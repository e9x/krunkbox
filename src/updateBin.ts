import type { PathLike } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rimraf } from "rimraf";

export const binDir = new URL("../bin/", import.meta.url);
export const loaderModuleJS = new URL("./loader.mjs", binDir);
export const loaderWasmPath = new URL("./loader.wasm", binDir);
export const coreDir = new URL("./cores/", binDir);
export const skinsDir = new URL("./skins/", binDir);

interface LoaderResource {
  alias: "loader_js" | "loader_wasm";
  url: string;
  path: PathLike;
}

const resources: LoaderResource[] = [
  {
    alias: "loader_js",
    url: "https://krunker.io/pkg/loader.mjs",
    path: loaderModuleJS,
  },
  {
    alias: "loader_wasm",
    url: "https://krunker.io/pkg/loader.wasm",
    path: loaderWasmPath,
  },
];

type Updated = Record<LoaderResource["alias"] | "core" | "skins", boolean>;

async function testLoaders(updated: Partial<Updated>) {
  await Promise.all(
    resources.map(async (resource) => {
      const res = await fetch(resource.url);

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

    if (splitCores + 1 > coreData.length || coreData[splitCores] < mtimeMs) {
      didUpdate = true;
    }

    splitCores++;
  }

  if (didUpdate) {
    updated.core = true;
    await rimraf(fileURLToPath(coreDir));
  }

  try {
    await mkdir(coreDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
  }

  await Promise.all(
    [...Array(splitCores)].map(async (_, i) => {
      const res = await fetch(`https://krunker.io/pkg/core.dat.split-${i}`, {
        headers: coreHeaders,
      });
      if (!res.ok || !res.body) throw new Error("Fatal error");
      await writeFile(
        new URL(`core.dat.split-${i}`, coreDir),
        Buffer.from(await res.arrayBuffer())
      );
    })
  ).catch(console.error);
}

async function testSkins(updated: Partial<Updated>) {
  const skinsData = await Promise.all(
    (
      await readdir(skinsDir).catch(() => [])
    ).map(async (file) => (await stat(new URL(file, skinsDir))).mtimeMs)
  );
  let splitSkins = 0;
  let didUpdate = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`https://krunker.io/skins${splitSkins}.jspck`, {
      method: "HEAD",
      headers: coreHeaders,
    });

    if (!res.ok) break;

    const lastModified = res.headers.get("last-modified");

    if (!lastModified) throw new Error("Invalid last-modified header");

    const mtimeMs = new Date(lastModified).getTime();

    if (splitSkins + 1 > skinsData.length || skinsData[splitSkins] < mtimeMs) {
      didUpdate = true;
    }

    splitSkins++;
  }

  if (didUpdate) {
    updated.skins = true;
    await rimraf(fileURLToPath(skinsDir));
  }

  try {
    await mkdir(skinsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
  }

  await Promise.all(
    [...Array(splitSkins)].map(async (_, i) => {
      const res = await fetch(`https://krunker.io/skins${i}.jspck`, {
        headers: coreHeaders,
      });
      if (!res.ok || !res.body) throw new Error("Fatal error");
      await writeFile(
        new URL(`skins${i}.jspck`, skinsDir),
        Buffer.from(await res.arrayBuffer())
      );
    })
  ).catch(console.error);
}

export default async function updateBin() {
  const updated: Partial<Updated> = {};

  try {
    await mkdir(binDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
  }

  await Promise.all([
    testLoaders(updated),
    testCoreDat(updated),
    testSkins(updated),
  ]);

  return updated;
}
