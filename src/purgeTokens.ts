import db from "./db.js";

export async function purgeTokens() {
  return (
    await db.query(
      "DELETE FROM token_data WHERE uses > 30 OR created_at < NOW() - INTERVAL '1 day';"
    )
  ).rowCount;
}

export async function tokenValid(token: string) {
  const {
    rows: [found],
  } = await db.query(
    "SELECT * FROM token_data WHERE current_token = $1 AND uses <= 30 AND created_at >= NOW() - INTERVAL '1 day';",
    [token]
  );

  console.log({ found });

  return !!found;
}
