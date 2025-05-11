import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from 'https-proxy-agent';

async function pickProxy() {
    // const PROXY = process.env["PROXY"]?.split(",");
    // if (PROXY === undefined) {
    //     console.error("pls set PROXY g")
    //     process.exit(1)
    // }
    // return PROXY[~~(Math.random() * PROXY.length)]

    let mullvadServers = await fetch("https://api.mullvad.net/www/relays/wireguard/").then(res => res.json()) as any[];
    mullvadServers = mullvadServers.filter(s => s.active && s.country_code === "us")
    const server = mullvadServers[~~(Math.random() * mullvadServers.length)];
    return `socks5://${server.socks_name}:${server.socks_port}`
}

export const proxy = await pickProxy();

console.log({ proxy });

export const agent = (proxy.startsWith("https:") ? new HttpsProxyAgent(proxy) : proxy.startsWith("socks5://") ? new SocksProxyAgent(proxy) : undefined) as any;
