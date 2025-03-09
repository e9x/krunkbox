import { db } from "./db";

const dbPurge = db.prepare<[]>(
  "DELETE FROM token_data WHERE NOT lifetime AND (uses > 45 OR created_at >= datetime('now', '-1 day'));"
);

export function purgeTokens() {
  return dbPurge.run().changes;
}

const dbShouldPurge = db.prepare<
  [current_token: string],
  { current_token: string }
>(
  "SELECT * FROM token_data WHERE current_token = ? AND (lifetime OR (uses <= 45 AND created_at >= datetime('now', '-1 day')));"
);
export async function tokenShouldPurge(token: string) {
  const found = dbShouldPurge.get(token);
  return found !== undefined;
}
