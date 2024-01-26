import { config } from "dotenv";
import { socksDispatcher } from "fetch-socks";

config();

export const port = Number(process.env.PORT || "80");
if (isNaN(port)) throw new TypeError("Invalid PORT");

export const host = process.env.HOST || undefined;

export const development = process.env.NODE_ENV !== "production";

// allow explicitly running in non headless mode
export const headlessBrowser = process.env.NO_HEADLESS !== "true";

// for quickly updating the server logic
export const skipUpdates = process.env.SKIP_UPDATES === "true";

const socksProxy = process.env.SOCKS_PROXY
  ? new URL(process.env.SOCKS_PROXY)
  : undefined;

export const dispatcher = socksProxy
  ? socksDispatcher({
      host: socksProxy.hostname,
      port: Number(socksProxy.port),
      type: socksProxy.protocol === "socks5:" ? 5 : 4,
    })
  : undefined;
