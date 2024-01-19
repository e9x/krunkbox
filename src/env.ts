import { Agent } from "undici";
import { config } from "dotenv";

config();

export const port = Number(process.env.PORT || "80");
if (isNaN(port)) throw new TypeError("Invalid PORT");

export const host = process.env.HOST || undefined;

export const development = process.env.NODE_ENV !== "production";

// for quickly updating the server logic
export const skipUpdates = process.env.SKIP_UPDATES === "true";

export const dispatcher = new Agent({
  localAddress: process.env.LOCAL_ADDRESS || undefined,
});
