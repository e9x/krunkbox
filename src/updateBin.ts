import type { PathLike } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { binDir, loaderIndex } from "./kruPaths";
import fetch from "node-fetch";
import { agent } from "./proxy";

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

const ua =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

async function testLoaders(updated: Partial<Updated>) {
  await Promise.all(
    resources.map(async (resource) => {
      console.log("FETCH",resource.url)
      const res = await fetch(resource.url, {
        agent,
        headers: {
          "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "User-Agent": ua,
        },
      });

      if (!res.ok || !res.body)
        throw new Error(`Fatal error: Cannot fetch ${resource.url} ${res.status}`);

      console.log("cucka fucka")
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
