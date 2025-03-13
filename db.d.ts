import Database from "better-sqlite3";

export const db: Database.Database;

export interface analytics_user {
  id: string;
  username: string;
  level: number;
  game: string;
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

export const sketch_key_free_max_uses: number;

export function validateSketchKey(key: sketch_key): string | undefined;

export interface ImportantData {
  ipAddress: string;
  userAgent: string;
}
