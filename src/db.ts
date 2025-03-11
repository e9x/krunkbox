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

export interface analytics_user {
  id: string;
  username: string;
  level: number;
}

export enum sketch_key_type {
  free = 0,
  pro = 1,
  unlimited = 2,
}

export interface sketch_key {
  code: string;
  reason: string | null;
  init: number;
  born: number | null;
  duration: number | null;
  type: sketch_key_type;
  uses: number;
}

export interface api_token {
  token: string;
  code: string;
  born: number;
  ip: string;
}

export const sketch_key_free_max_uses = 45;

const MS_DAY = 60e3 * 60 * 24;

export function validateSketchKey(key: sketch_key) {
  if (!key.born) throw new Error("key not born yet! you're a pedophile!");

  console.log(key);

  if (key.type === sketch_key_type.pro && key.born + key.duration! < Date.now())
    return "sketch_key_validate.expired";

  if (key.type === sketch_key_type.free && key.born + MS_DAY < Date.now())
    return "sketch_key_validate.expired";

  if (key.type === sketch_key_type.free && key.uses >= sketch_key_free_max_uses)
    return "sketch_key_validate.expired";
}

export interface ImportantData {
  ipAddress: string;
  userAgent: string;
}
