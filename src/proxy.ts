import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getWireguard } from "./mullvad";
import fetch, { RequestInit, Response } from "node-fetch";
import { readFile, writeFile } from "node:fs/promises";
import { binDir } from "./kruPaths";
import { proxy, proxyWebhook } from "./env";

export const ua =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

export function getAgent(proxyServer: string) {
  let agent;
  const url = new URL(proxyServer);
  switch (url.protocol) {
    case "https:":
    case "http:":
      agent = new HttpsProxyAgent(proxyServer);
      break;
    case "socks4:":
    case "socks5:":
      agent = new SocksProxyAgent(proxyServer);
      break;
  }

  return agent as undefined as any;
}

const PROXY_ENV = proxy;

let proxyServers: string[];

if (PROXY_ENV) {
  proxyServers = PROXY_ENV.split(",").map((p: string) =>
    p.includes("://") ? p : `http://${p}`,
  );
  console.log("Using", proxyServers.length, "proxies from env");
} else {
  const wireguard = await getWireguard();
  proxyServers = wireguard.filter((s) => s.active).map((s) => s.toString());
  console.log("Loaded", wireguard.length, "Mullvad servers");
}

const bannedProxiesPath = new URL("./banned-proxies.json", binDir);

let bannedProxies: string[] = [];

try {
  bannedProxies = JSON.parse(await readFile(bannedProxiesPath, "utf-8"));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

if (bannedProxies.length)
  console.log("Banned", bannedProxies.length, "proxies");

for (const server of bannedProxies) {
  let pi = proxyServers.indexOf(server);
  if (pi !== -1) proxyServers.splice(pi, 1);
}

async function setBanned(server: string) {
  if (!bannedProxies.includes(server)) bannedProxies.push(server);

  let pi = proxyServers.indexOf(server);
  if (pi !== -1) proxyServers.splice(pi, 1);

  await writeFile(bannedProxiesPath, JSON.stringify(bannedProxies));
}

class Proxy {
  server!: string;
  agent!: any;
  auth?: { username: string; password: string };
  next() {
    let proxyServer = proxyServers[~~(Math.random() * proxyServers.length)];

    // let proxy = proxyServers[~~(Math.random() * PROXY.length)]
    // console.log(proxyServer)
    this.server = proxyServer;
    this.agent = getAgent(proxyServer);
    const url = new URL(proxyServer);
    this.auth = url.username
      ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
      : undefined;
  }
  constructor() {
    this.fetch = this.fetch.bind(this);
    this.next();
    console.log("Selected proxy:", this.server, this.auth ? "(auth)" : "");
  }
  async fetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
    url = new URL(url);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          ...init,
          headers: {
            ...(init.headers || {}),
            "User-Agent": ua,
          },
          agent: this.agent,
        });
      } catch (err) {
        lastErr = err;
        console.error(`Proxy fetch failed (attempt ${attempt + 1}/3):`, this.server, String(err));
        this.next();
        continue;
      }

      if (
        res.status === 403 &&
        /(?:\.|^)krunker.io$/.test(url.hostname) &&
        res.headers.get("content-type") == "text/html; charset=UTF-8"
      ) {
        // console.log("Proxy is IP banned, finding new one", res.status, this.server);
        console.log("Proxy banned, rotating:", this.server);
        setBanned(this.server);
        this.next();
        continue;
      }
      //console.log("yay proxy worked",url,init, res.status, this.server);

      return res;
    }

    notifyProxyFailure(String(url), String(lastErr));
    throw lastErr;
  }
}

export async function pickProxy() {
  return new Proxy();
}

function notifyProxyFailure(url: string, error: string) {
  if (!proxyWebhook) return;

  const payload = {
    username: "proxy-watcher",
    embeds: [
      {
        title: "Proxy Failure",
        color: 0xff0000,
        fields: [
          { name: "URL", value: url, inline: false },
          { name: "Error", value: error.slice(0, 1024), inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  fetch(proxyWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.error("Proxy webhook error:", err));
}
