import once from "@tootallnate/once";
import type { PathLike, WriteStream } from "fs";
import { createWriteStream } from "fs";
import { mkdir, readdir, stat, writeFile } from "fs/promises";
import fetch from "node-fetch";
import rimraf from "rimraf";
import { fileURLToPath } from "url";

export const loaderScriptPath = new URL("../bin/loader.mjs", import.meta.url);
export const loaderWasmPath = new URL("../bin/loader.wasm", import.meta.url);
export const coreDir = new URL("../bin/cores/", import.meta.url);

interface LoaderResource {
  alias: "loader js" | "loader wasm";
  url: string;
  path: PathLike;
}

const resources: LoaderResource[] = [
  {
    alias: "loader js",
    url: "https://krunker.io/pkg/loader.mjs",
    path: loaderScriptPath,
  },
  {
    alias: "loader wasm",
    url: "https://krunker.io/pkg/loader.wasm",
    path: loaderWasmPath,
  },
];

type Updated = Record<LoaderResource["alias"] | "core dat", boolean>;

async function testLoaders(updated: Partial<Updated>) {
  const writeStreams: WriteStream[] = [];

  for (const res of resources) {
    const response = await fetch(res.url);
    if (!response.ok || !response.body)
      throw new Error(`Fatal error: Cannot fetch ${res.url}`);

    try {
      const stats = await stat(res.path);
      const header = response.headers.get("last-modified");
      if (!header) throw new Error(`Bad last-modified: ${header}`);

      const lastModified = new Date(header);

      if (lastModified.getTime() <= stats.mtimeMs) continue;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }

    updated[res.alias] = true;

    const writeStream = createWriteStream(res.path);
    response.body.pipe(writeStream);
    writeStreams.push(writeStream);
  }

  for (const writeStream of writeStreams) await once(writeStream, "end");
}

const coreHeaders = {
  accept: "*/*",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  cookie: "can_use_cookies=test",
  get: "cheat",
  pragma: "no-cache",
  referer: "https://krunker.io/",
  "sec-ch-ua": '"Chromium";v="111", "Not(A:Brand";v="8"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Linux"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (X11; Fedora; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
};

async function testCoreDat(updated: Partial<Updated>) {
  const coreData = await Promise.all(
    (
      await readdir(coreDir).catch(() => [])
    ).map(async (file) => (await stat(new URL(file, coreDir))).mtimeMs)
  );
  let splitCores = 0;
  let didUpdate = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(
      `https://krunker.io/pkg/core.dat.split-${splitCores}`,
      {
        method: "HEAD",
        headers: coreHeaders,
      }
    );

    if (!res.ok) break;

    const lastModified = res.headers.get("last-modified");

    if (!lastModified) throw new Error("Invalid last-modified header");

    const mtimeMs = new Date(lastModified).getTime();

    if (splitCores + 1 >= coreData.length || coreData[splitCores] < mtimeMs) {
      didUpdate = true;
    }

    splitCores++;
  }

  if (didUpdate) {
    updated["core dat"] = true;
    await rimraf(fileURLToPath(coreDir));
  }

  const promises: Promise<void>[] = [];

  try {
    await mkdir(coreDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
  }

  for (let i = 0; i < splitCores; i++)
    promises.push(
      (async () => {
        const res = await fetch(`https://krunker.io/pkg/core.dat.split-${i}`, {
          headers: coreHeaders,
        });
        if (!res.ok || !res.body) throw new Error("Fatal error");
        await writeFile(
          new URL(`core.dat.split-${i}`, coreDir),
          Buffer.from(await res.arrayBuffer())
        );
      })()
    );

  await Promise.all(promises);
}

export default async function updateBin() {
  const updated: Partial<Updated> = {};

  await testLoaders(updated);
  await testCoreDat(updated);

  return updated;
}
