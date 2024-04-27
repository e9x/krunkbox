import pg from "pg";
import { pgUrl } from "./env";

const db = new pg.Client(pgUrl);

export { db };
