import db from "./db.js";

export async function purgeTokens() {
  return (
    await db.query(
      "DELETE FROM token_data WHERE uses > 30 OR created_at < NOW() - INTERVAL '3 days' AND NOT lifetime;"
    )
  ).rowCount;
}

export async function tokenShouldPurge(token: string) {
  const {
    rows: [found],
  } = await db.query(
    "SELECT * FROM token_data WHERE current_token = $1 AND ((uses <= 90 AND created_at >= NOW() - INTERVAL '1 day') OR NOT lifetime);",
    [token]
  );

  return !!found;
}
