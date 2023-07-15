import db from "./db";

export async function purgeTokens() {
  const result = await db.lv_token_data.deleteMany({
    where: {
      NOT: {
        lifetime: true,
      },
      OR: [
        {
          uses: {
            gt: 56,
          },
        },
        {
          created_at: {
            lte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          },
        },
      ],
    },
  });

  return result.count;
}

export async function tokenShouldPurge(token: string) {
  const found = await db.lv_token_data.findFirst({
    where: {
      current_token: token,
      OR: [
        {
          lifetime: true,
        },
        {
          uses: {
            lte: 56,
          },
          created_at: {
            gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          },
        },
      ],
    },
  });

  return !!found;
}

export async function purgeTempTokens() {
  const result = await db.temp_tokens.deleteMany({
    where: {
      created_at: {
        lt: new Date(Date.now() - 10 * 60 * 1000),
      },
    },
  });

  return result.count;
}

export async function purgeTempAccessTokens() {
  const result = await db.temp_access_tokens.deleteMany({
    where: {
      created_at: {
        lt: new Date(Date.now() - 10 * 60 * 1000),
      },
    },
  });

  return result.count;
}
