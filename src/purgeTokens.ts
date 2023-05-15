import db from "./db";

export async function purgeTokens() {
  return (
    await db.query(
      "DELETE FROM lv_token_data WHERE NOT lifetime AND (uses > 56 OR created_at + INTERVAL '2 days' > NOW());"
    )
  ).rowCount;
}

export async function tokenShouldPurge(token: string) {
  const {
    rows: [found],
  } = await db.query(
    "SELECT * FROM lv_token_data WHERE current_token = $1 AND (lifetime OR (uses <= 56 AND created_at + INTERVAL '2 days' > NOW()));",
    [token]
  );

  return !!found;
}

export async function purgeTempTokens() {
  return (
    await db.query(
      "DELETE FROM temp_tokens WHERE created_at + INTERVAL '10 minutes' < NOW();"
    )
  ).rowCount;
}
