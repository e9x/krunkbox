import db from "db";
import type { FastifyRequest } from "fastify";
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
    "SELECT current_token FROM lv_token_data WHERE (previous_token = $1 OR current_token = $1) AND ip_address = $2;",
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
    "WITH updated AS (UPDATE lv_token_data SET previous_token = current_token, current_token = encode(gen_random_bytes(16), 'base64'), uses = uses + $1 WHERE (previous_token = $2 OR current_token = $2) AND ip_address = $3 RETURNING *) SELECT * FROM updated;",
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
    "UPDATE lv_token_data SET uses = uses + $1 WHERE (previous_token = $2 OR current_token = $2) AND ip_address = $3;",
    [1, xToken, importantData.ipAddress]
  );
}
