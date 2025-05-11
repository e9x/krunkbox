import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from 'https-proxy-agent';

function pickProxy() {
    const PROXY = process.env["PROXY"]?.split(",");
    if (PROXY === undefined) {
        console.error("pls set PROXY g")
        process.exit(1)
    }
    return PROXY[~~(Math.random() * PROXY.length)]
}

export const proxy = pickProxy();

export const agent = (proxy.startsWith("https:") ? new HttpsProxyAgent(proxy) : proxy.startsWith("socks5://") ? new SocksProxyAgent(proxy) : undefined) as any;
