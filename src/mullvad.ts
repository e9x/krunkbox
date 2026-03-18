class MullvadServer {
    hostname!: string;
    country_code!: string;
    country_name!: string;
    city_code!: string;
    city_name!: string;
    fqdn!: string;
    active!: boolean;
    owned!: boolean;
    provider!: string;
    ipv4_addr_in!: string;
    ipv6_addr_in!: string;
    network_port_speed!: number;
    stboot!: boolean;
    pubkey!: string;
    multihop_port!: number;
    socks_name!: string;
    socks_port!: number;
    daita!: boolean;
    toString() {
        return `socks5://${this.socks_name}:${this.socks_port}`
    }
}

function parseSocks(proxy: string): MullvadServer {
    const [host, port] = proxy.split(":");
    return Object.setPrototypeOf({
        socks_name: host,
        socks_port: parseInt(port),
        active: true,
    }, MullvadServer.prototype);
}

export const wireguard: MullvadServer[] = process.env.PROXY ? [parseSocks(process.env.PROXY)] : await fetch("https://api.mullvad.net/www/relays/wireguard/").then(res => res.json()).then(m => (m as any[]).map(s => Object.setPrototypeOf(s, MullvadServer.prototype))) as any;
