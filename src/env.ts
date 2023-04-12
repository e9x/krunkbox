import { config } from "dotenv";

config();

export const PORT = Number(process.env.PORT || "80");
if (isNaN(PORT)) throw new TypeError("Invalid PORT");

export const PG_URL = process.env.PG_URL || "";
if (!PG_URL) throw new TypeError("Invalid PG_URL");

export const WORKINK_API = process.env.WORKINK_API || "";
if (!WORKINK_API) throw new TypeError("Invalid WORKINK_API");
