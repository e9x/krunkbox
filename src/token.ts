import { development } from "./env";
import db from "db";
import type { FastifyRequest } from "fastify";
import pg from "pg";
import { tokenShouldPurge } from "purgeTokens";

interface ImportantData {
  ipAddress: string;
  userAgent: string;
}

export function getImportantData(req: FastifyRequest): ImportantData {
  return {
    ipAddress: req.headers["cf-connecting-ip"]?.toString() || req.ip,
    userAgent: req.headers["user-agent"]?.toString() || "",
  };
}

export enum WorkInkError {
  DuplicateToken,
}

async function validWorkInkToken(token: string) {
  if (!token) return false;

  const res = await fetch(`https://redirect-api.work.ink/tokenValid/${token}`);
  if (!res.ok) throw new Error(`Not OK: ${res.status}`);
  const body = (await res.json()) as { valid: boolean };

  return body.valid;
}

export async function processWorkInk(
  token: string,
  importantData: ImportantData
) {
  const generateLifetime =
    (development && token === "DEBUG") || token === "3117116";

  if (!generateLifetime && !(await validWorkInkToken(token))) return;

  try {
    const {
      rows: [{ current_token }],
    } = await db.query<{ current_token: string }>(
      `INSERT INTO token_data (workink_token, ip_address, lifetime) VALUES ($1, $2, $3) RETURNING current_token;`,
      [token, importantData.ipAddress, generateLifetime]
    );

    return current_token;
  } catch (err) {
    if (
      err instanceof pg.DatabaseError &&
      err.constraint === "token_data_workink_token_key"
    )
      return WorkInkError.DuplicateToken;
    else throw err;
  }
}
/**
 * Check if a token is valid
 * @returns Boolean indicating if the token is valid or not
 */
export async function isTokenValid(
  xToken: string,
  importantData: ImportantData
) {
  const {
    rows: [found],
  } = await db.query<{ current_token: string }>(
    "SELECT current_token FROM token_data WHERE (previous_token = $1 OR current_token = $1) AND ip_address = $2;",
    [xToken, importantData.ipAddress]
  );

  if (!found) return false;

  // expect it to be deleted soon
  if (!(await tokenShouldPurge(found.current_token))) return false;

  return true;
}

/**
 * Increment token uses and generate a new token
 * @returns The new token
 */
export async function rotateToken(
  xToken: string,
  importantData: ImportantData
) {
  if (!(await isTokenValid(xToken, importantData))) return;

  const {
    rows: [found],
  } = await db.query<{ current_token: string }>(
    "WITH updated AS (UPDATE token_data SET previous_token = current_token, current_token = encode(gen_random_bytes(16), 'base64'), uses = uses + $1 WHERE (previous_token = $2 OR current_token = $2) AND ip_address = $3 RETURNING *) SELECT * FROM updated;",
    [1, xToken, importantData.ipAddress]
  );

  return found.current_token;
}

export async function incrementToken(
  xToken: string,
  importantData: ImportantData
) {
  if (!(await isTokenValid(xToken, importantData))) return;

  await db.query<{ current_token: string }>(
    "UPDATE token_data SET uses = uses + $1 WHERE (previous_token = $2 OR current_token = $2) AND ip_address = $3;",
    [1, xToken, importantData.ipAddress]
  );
}
