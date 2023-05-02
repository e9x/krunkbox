import db from "./db.js";

export async function purgeTokens() {
  return (
    await db.query(
      "DELETE FROM token_data WHERE NOT lifetime AND (uses > 90 OR created_at + INTERVAL '3 days' > NOW());"
    )
  ).rowCount;
}

export async function tokenShouldPurge(token: string) {
  const {
    rows: [found],
  } = await db.query(
    "SELECT * FROM token_data WHERE current_token = $1 AND NOT lifetime AND (uses > 90 OR created_at + INTERVAL '3 days' > NOW());",
    [token]
  );

  return !!found;
}
