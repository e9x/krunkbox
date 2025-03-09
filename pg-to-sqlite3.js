import Database from "better-sqlite3";
import { config } from "dotenv";
import { readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

config();

export const pgUrl = process.env.PG_URL || "";
if (!pgUrl) throw new TypeError("INVALID PG_URL");

const c = new pg.Client(pgUrl);
await c.connect();
const res = await c.query("SELECT * FROM usersv2");
await c.end();
console.log("got", res.rowCount, "users");

const dbPath = fileURLToPath(new URL("krunkbox.db", import.meta.url));
const run = await readFile(new URL("db.sql", import.meta.url), "utf-8");
console.log("initializing the database...");
await unlink(dbPath);
const db = new Database(dbPath);
db.exec(run);
db.pragma("journal_mode = WAL");

/*
CREATE TABLE usersv2 (
  id TEXT NOT NULL PRIMARY KEY,
  username TEXT NOT NULL,
  level INT NOT NULL,
  seen DATETIME DEFAULT CURRENT_TIMESTAMP
);
*/

const dbInsert = db.prepare(
  "INSERT INTO usersv2 (id, username, level, seen) VALUES (?, ?, ?, ?)"
);

db.transaction(() => {
  for (const r of res.rows) {
    dbInsert.run(r.id, r.username, r.level, r.seen ? r.seen.getTime() : r.seen);
  }
})();

console.log("migrated");

db.close();
