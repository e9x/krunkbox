import db from "./db";

export async function purgeTokens() {
  return (
    await db.query(
      "DELETE FROM token_data WHERE NOT lifetime AND (uses > 45 OR created_at + INTERVAL '1 days' > NOW());"
    )
  ).rowCount;
}

export async function tokenShouldPurge(token: string) {
  const {
    rows: [found],
  } = await db.query(
    "SELECT * FROM token_data WHERE current_token = $1 AND (lifetime OR (uses <= 45 AND created_at + INTERVAL '1 days' > NOW()));",
    [token]
  );

  return !!found;
}
