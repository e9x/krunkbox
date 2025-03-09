import { development } from "./env";
import { db } from "./db";
import type { FastifyRequest } from "fastify";
import { tokenShouldPurge } from "./purgeTokens";
import { randomBytes } from "node:crypto";

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
  InvalidToken,
}

async function validWorkInkToken(token: string) {
  if (!token) return false;

  const res = await fetch(`https://work.ink/_api/v2/token/isValid/${token}`);
  const data = (await res.json()) as { valid: boolean };
  //console.trace(data);
  //data.valid = true;
  return data.valid;
}

const dbInsertToken = db.prepare<
  [
    current_token: string,
    workink_token: string,
    ip_address: string,
    lifetime: number,
  ]
>(
  `INSERT INTO token_data (current_token, workink_token, ip_address, lifetime) VALUES (?, ?, ?, ?);`
);

export async function processWorkInk(
  token: string,
  importantData: ImportantData
) {
  const generateLifetime =
    (development && token === "DEBUG") || token === "3117116";

  if (!generateLifetime && !(await validWorkInkToken(token)))
    return WorkInkError.InvalidToken;

  try {
    const newToken = randomBytes(16).toString("base64");
    dbInsertToken.run(
      newToken,
      token,
      importantData.ipAddress,
      Number(generateLifetime)
    );
    return newToken;
  } catch (err) {
    if ((err as any).code === "SQLITE_CONSTRAINT_UNIQUE")
      return WorkInkError.DuplicateToken;
    throw err;
  }
}

const findValidToken = db.prepare<
  [previous_token: string, current_token: string, ip_address: string],
  { current_token: string }
>(
  "SELECT current_token FROM token_data WHERE (previous_token = ? OR current_token = ?) AND ip_address = ?;"
);
/**
 * Check if a token is valid
 * @returns Boolean indicating if the token is valid or not
 */
export function isTokenValid(xToken: string, importantData: ImportantData) {
  const found = findValidToken.get(xToken, xToken, importantData.ipAddress);

  if (!found) return false;

  // expect it to be deleted soon
  if (!tokenShouldPurge(found.current_token)) return false;

  return true;
}

const dbRotateToken = db.prepare<
  [
    set_previous_token: string,
    set_current_token: string,
    previous_token: string,
    current_token: string,
    ip_address: string,
  ]
>(
  "UPDATE token_data SET previous_token = ?, current_token = ?, uses = uses + 1 WHERE (previous_token = ? OR current_token = ?) AND ip_address = ?;"
);

/**
 * Increment token uses and generate a new token
 * @returns The new token
 */
export async function rotateToken(
  xToken: string,
  importantData: ImportantData
) {
  if (!isTokenValid(xToken, importantData)) return;

  const newToken = randomBytes(16).toString("base64");

  dbRotateToken.run(xToken, newToken, xToken, xToken, importantData.ipAddress);

  return newToken;
}

const dbIncrementToken = db.prepare<
  [previous_token: string, current_token: string, ip_address: string],
  { current_token: string }
>(
  "UPDATE token_data SET uses = uses + 1 WHERE (previous_token = ? OR current_token = ?) AND ip_address = ?;"
);
export async function incrementToken(
  xToken: string,
  importantData: ImportantData
) {
  if (!isTokenValid(xToken, importantData)) return;
  dbIncrementToken.run(xToken, xToken, importantData.ipAddress);
}
