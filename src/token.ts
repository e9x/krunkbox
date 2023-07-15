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
  const found = await db.lv_token_data.findFirst({
    where: {
      OR: [
        {
          previous_token: xToken,
        },
        {
          current_token: xToken,
        },
      ],
      ip_address: importantData.ipAddress,
    },
    select: {
      current_token: true,
    },
  });

  if (!found) return false;

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

  const found = await db.lv_token_data.updateMany({
    where: {
      OR: [
        {
          previous_token: xToken,
        },
        {
          current_token: xToken,
        },
      ],
      ip_address: importantData.ipAddress,
    },
    data: {
      previous_token: xToken,
      current_token:
        await db.$queryRaw<string>`encode(gen_random_bytes(16), 'base64')`,
      uses: {
        increment: 1,
      },
    },
    select: {
      current_token: true,
    },
  });

  return found.current_token;
}

export async function incrementToken(
  xToken: string,
  importantData: ImportantData
) {
  if (!(await isTokenValid(xToken, importantData))) return;

  await db.lv_token_data.updateMany({
    where: {
      OR: [
        {
          previous_token: xToken,
        },
        {
          current_token: xToken,
        },
      ],
      ip_address: importantData.ipAddress,
    },
    data: {
      uses: {
        increment: 1,
      },
    },
  });
}
