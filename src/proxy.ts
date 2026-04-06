import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { wireguard } from "./mullvad";
import fetch, { RequestInit, Response } from "node-fetch";
import { readFile, writeFile } from "node:fs/promises";
import { binDir } from "./kruPaths";

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

const PROXY_ENV = process.env["PROXY"];
const proxyServers = PROXY_ENV
  ? PROXY_ENV.split(",").map((p: string) =>
      p.includes("://") ? p : `http://${p}`,
    )
  : wireguard.filter((s: any) => s.active).map((s: any) => s.toString());

console.log("Loaded", wireguard.length, "Mullvad servers");

const bannedProxiesPath = new URL("./banned-proxies.json", binDir);

let bannedProxies: string[] = [];

try {
  bannedProxies = JSON.parse(await readFile(bannedProxiesPath, "utf-8"));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

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
  next() {
    let proxyServer = proxyServers[~~(Math.random() * proxyServers.length)];

    // let proxy = proxyServers[~~(Math.random() * PROXY.length)]
    // console.log(proxyServer)
    this.server = proxyServer;
    this.agent = getAgent(proxyServer);
  }
  constructor() {
    this.fetch = this.fetch.bind(this);
    this.next();
  }
  async fetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
    url = new URL(url);
    while (true) {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers || {}),
          "User-Agent": ua,
        },
        agent: this.agent,
      });

      if (
        res.status === 403 &&
        /(?:\.|^)krunker.io$/.test(url.hostname) &&
        res.headers.get("content-type") == "text/html; charset=UTF-8"
      ) {
        // console.log("Proxy is IP banned, finding new one", res.status, this.server);
        setBanned(this.server);
        this.next();
        continue;
      }
      //console.log("yay proxy worked",url,init, res.status, this.server);

      return res;
    }
  }
}

export async function pickProxy() {
  return new Proxy();
}
