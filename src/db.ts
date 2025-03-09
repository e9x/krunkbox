import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";

let db: Database.Database;

try {
  db = new Database("krunkbox.db", { fileMustExist: true });
} catch (err) {
  if ((err as any).code !== "SQLITE_CANTOPEN") throw err;
  const run = await readFile("db.sql", "utf-8");
  console.log("initializing the database...");
  db = new Database("krunkbox.db");
  db.exec(run);
}

db.pragma("journal_mode = WAL");

export { db };

export interface DBUser {
  id: string;
  username: string;
  level: number;
}
