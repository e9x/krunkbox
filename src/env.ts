import { config } from "dotenv";

config();

export const port = Number(process.env.PORT || "80");
if (isNaN(port)) throw new TypeError("Invalid PORT");

export const pgURL = process.env.PG_URL || "";
if (!pgURL) throw new TypeError("Invalid PG_URL");

export const development = process.env.NODE_ENV !== "production";

// for quickly updating the server logic
export const skipUpdates = process.env.SKIP_UPDATES === "true";
