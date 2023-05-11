import { pgURL } from "./env.js";
import pg from "pg";

const db = new pg.Client(pgURL);

db.connect();

export default db;
