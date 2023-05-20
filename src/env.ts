import { config } from "dotenv";

config();

export const port = Number(process.env.PORT || "80");
if (isNaN(port)) throw new TypeError("Invalid PORT");

export const host = process.env.HOST || undefined;

export const pgURL = process.env.PG_URL || "";
if (!pgURL) throw new TypeError("Invalid PG_URL");

// TODO: make this a watched file in sketchData
export const linkvertiseKey = process.env.LINKVERTISE_KEY || "";
if (!linkvertiseKey) throw new TypeError("Invalid LINKVERTISE_KEY");

export const development = process.env.NODE_ENV !== "production";

// for quickly updating the server logic
export const skipUpdates = process.env.SKIP_UPDATES === "true";
