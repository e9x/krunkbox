import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let db: Database.Database;

const dbPath = fileURLToPath(new URL("../krunkbox.db", import.meta.url));

try {
  db = new Database(dbPath, { fileMustExist: true });
} catch (err) {
  if ((err as any).code !== "SQLITE_CANTOPEN") throw err;
  const run = await readFile(new URL("../db.sql", import.meta.url), "utf-8");
  console.log("initializing the database...");
  db = new Database(dbPath);
  db.exec(run);
}

db.pragma("journal_mode = WAL");

export { db };

export interface DBUser {
  id: string;
  username: string;
  level: number;
}
