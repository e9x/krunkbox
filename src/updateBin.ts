import once from "@tootallnate/once";
import type { PathLike, WriteStream } from "fs";
import { createWriteStream } from "fs";
import { readFile, stat, unlink, writeFile } from "fs/promises";
import fetch from "node-fetch";

interface LoaderResource {
  alias: "loader js" | "loader wasm";
  url: string;
  path: PathLike;
}

const resources: LoaderResource[] = [
  {
    alias: "loader js",
    url: "https://krunker.io/pkg/loader.js",
    path: new URL("../bin/loader.js", import.meta.url),
  },
  {
    alias: "loader wasm",
    url: "https://krunker.io/pkg/loader.wasm",
    path: new URL("../bin/loader.wasm", import.meta.url),
  },
];

type Updated = Record<LoaderResource["alias"] | "core dat", boolean>;

async function testLoaders(updated: Partial<Updated>) {
  const writeStreams: WriteStream[] = [];

  for (const res of resources) {
    const response = await fetch(res.url);
    if (!response.ok || !response.body) throw new Error("Fatal error");

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

const coreDataPath = new URL("../bin/coreData.json", import.meta.url);
const coreDir = new URL("../bin/cores/", import.meta.url);

/**
 * Array of last-modified headers, i = split
 */
export type CoreData = string[];

async function getCoreData(): Promise<CoreData | void> {
  try {
    return JSON.parse(await readFile(coreDataPath, "utf-8"));
  } catch (err) {
    // who cares
  }
}

async function fetchPkg(i: number) {
  const res = await fetch(`https://krunker.io/pkg/core.dat.split-${i}`);
  if (!res.ok || !res.body) throw new Error("Fatal error");
  await writeFile(
    new URL(`core.dat.split-${i}`, coreDir),
    Buffer.from(await res.arrayBuffer())
  );
}

async function testCoreDat(updated: Partial<Updated>) {
  // updated['core dat'] = true;
  const coreData = await getCoreData();
  const newCoreData: CoreData = [];

  let splitCores = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(
      `https://krunker.io/pkg/core.dat.split-${splitCores}`,
      {
        method: "HEAD",
      }
    );

    if (!res.ok) break;

    const lastModified = res.headers.get("last-modified");

    if (!lastModified) throw new Error("Invalid last-modified header");

    newCoreData.push(lastModified);

    splitCores++;
  }

  if (!coreData || splitCores !== coreData.length) {
    updated["core dat"] = true;
    if (coreData) {
      for (let i = 0; i < coreData.length; i++)
        await unlink(new URL(`core.dat.split-${i}`, coreDir));
    }
  }

  const fetching: Promise<void>[] = [];
  for (let i = 0; i < newCoreData.length; i++) fetching.push(fetchPkg(i));
  await Promise.all(fetching);

  await writeFile(coreDataPath, JSON.stringify(newCoreData));
}

export default async function updateBin() {
  const updated: Partial<Updated> = {};

  await testLoaders(updated);
  await testCoreDat(updated);

  return updated;
}
