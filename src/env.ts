import { config } from "dotenv";

if (process.argv.includes("--dev")) process.env.NODE_ENV = "development";

if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

config();

export const port = Number(process.env.PORT || "80");
if (isNaN(port)) throw new TypeError("Invalid PORT");

export const host = process.env.HOST || undefined;

export const development = process.env.NODE_ENV !== "production";

// allow explicitly running in non headless mode
export const headlessBrowser = process.env.NO_HEADLESS !== "true";

// for quickly updating the server logic
export const skipUpdates = process.env.SKIP_UPDATES === "true";

export const workinkURL = process.env.WORKINK_URL || "";
if (!workinkURL) throw new TypeError("INVALID WORKINK_URL");

export const workinkAPI = process.env.WORKINK_API || "";
if (!workinkAPI) throw new TypeError("Invalid WORKINK_API");

/*
export const dispatcher = socksProxy
  ? socksDispatcher({
      host: socksProxy.hostname,
      port: Number(socksProxy.port),
      type: socksProxy.protocol === "socks5:" ? 5 : 4,
    })
  : undefined;
*/
