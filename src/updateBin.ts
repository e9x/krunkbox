import type { PathLike } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { binDir, loaderIndex } from "./kruPaths";

interface LoaderResource {
  alias: "index_html";
  url: string;
  path: PathLike;
}

const resources: LoaderResource[] = [
  {
    alias: "index_html",
    url: "https://krunker.io/",
    path: loaderIndex,
  },
];

export type Updated = Record<LoaderResource["alias"], boolean>;

async function testLoaders(updated: Partial<Updated>) {
  await Promise.all(
    resources.map(async (resource) => {
      const res = await fetch(resource.url, {
        // dispatcher
      });

      if (!res.ok || !res.body)
        throw new Error(`Fatal error: Cannot fetch ${res.url}`);

      try {
        const stats = await stat(resource.path);
        const header = res.headers.get("last-modified");
        if (!header) throw new Error(`Bad last-modified: ${header}`);

        const lastModified = new Date(header);

        if (lastModified.getTime() <= stats.mtimeMs) return;
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }

      updated[resource.alias] = true;

      await writeFile(resource.path, Buffer.from(await res.arrayBuffer()));
    })
  );
}

const coreHeaders = {
  accept: "*/*",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  cookie: "can_use_cookies=test",
  // SUBJECT TO CHANGE:
  get: "cheat",
  pragma: "no-cache",
  referer: "https://krunker.io/",
  "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Linux"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export default async function updateBin() {
  const updated: Partial<Updated> = {};

  try {
    await mkdir(binDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
  }

  await Promise.all([testLoaders(updated)]);

  return updated;
}
