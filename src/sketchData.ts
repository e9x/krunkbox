import {
  compatibleChecksumsPath,
  gameSkinsPath,
  gameSourcePath,
  sketchPath,
} from "./sketchDataPaths";
import { watch } from "chokidar";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Use memory as a cache layer
// Save both the gameSource and sketchScript in memory as soon as they're accessible

let sketchScript: undefined | Buffer;
let gameSource: undefined | Buffer;
let gameSourceChecksum: string | null;
let gameSkins: undefined | Buffer;

let compatibleChecksums: undefined | CompatibleChecksums;

interface CompatibleChecksums {
  /**
   * Key is the checksum used in Sketch (SKETCH_SUPPORTED_GAME)
   * Value is an array of checksums that are compatible with the checksum described in the key.
   * The checksums are newer/older versions of the game
   *
   * If you can support X, then you can support one of Y
   */
  [oldSourceChecksum: string]: string[];
}

let sketchVersion: undefined | string;
let sketchChecksum: undefined | null | string;
// null = file doesn't exist, undfined = waiting..., string = REAL
let gameDataChecksum: undefined | null | string;

export function getCompatibleChecksums() {
  return compatibleChecksums;
}

export function getSketchChecksum() {
  return sketchChecksum;
}

export function getSketchVersion() {
  return sketchVersion;
}

export function getSketchScript() {
  return sketchScript;
}

export function getGameData() {
  if (typeof gameDataChecksum !== "string" || !gameSource || !gameSkins) return;
  return {
    sourceChecksum: gameSourceChecksum,
    mergedChecksum: gameDataChecksum, // cache for endpoint
    source: gameSource,
    skins: gameSkins,
  };
}

async function updateSketchData() {
  sketchScript = undefined;
  sketchVersion = undefined;
  sketchChecksum = undefined;

  while (true)
    try {
      sketchScript = await readFile(sketchPath);

      const txt = sketchScript.toString();
      if (txt.split("\n").length > 100) {
        console.error(
          "Detected Sketch source code. Deleting file and refusing to serve a script."
        );
        await unlink(sketchPath);
        return;
      }

      try {
        new Function(txt);
      } catch (err) {
        sketchScript = undefined;
        // hopefully the script is still being uploaded and will be valid in one second
        console.error("Invalid sketch code uploaded");
        console.error(err);
        await sleep(1e3);
        continue;
      }

      const hash = createHash("sha512");
      hash.update(sketchScript);
      sketchChecksum = hash.digest("hex");
      console.log("sketch lol", sketchChecksum);

      const [, matchSketchVersion] =
        txt.match(/^\/\/ @version\s+(.*?)$/m) || [];

      if (!matchSketchVersion) {
        console.error("Failure finding sketch version");
        await sleep(1e3);
        continue;
      }

      sketchVersion = matchSketchVersion;

      console.log({ sketchVersion });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      console.error(err);
      console.log(
        `Cannot read ${sketchPath}. Version information won't be shown`
      );
      break;
    }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), ms));
}

export async function updateGameData() {
  gameSource = undefined;
  gameSourceChecksum = null;
  const hash = createHash("sha512");

  while (true)
    try {
      gameSource = await readFile(gameSourcePath);
      hash.update(gameSource);
      gameSourceChecksum = hash.copy().digest("hex");
      console.log("Game source:", gameSourceChecksum);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      console.error(err);
      console.log(
        `Cannot read ${gameSourcePath}. Version information won't be shown`
      );
      break;
    }

  gameSkins = undefined;

  while (true)
    try {
      gameSkins = await readFile(gameSkinsPath);
      hash.update(gameSkins);

      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      console.error(err);
      console.log(
        `Cannot read ${gameSkinsPath}. Version information won't be shown`
      );
      break;
    }

  gameDataChecksum = hash.digest("hex");
}

async function updateCompatibleChecksums() {
  compatibleChecksums = undefined;

  while (true)
    try {
      const data = await readFile(compatibleChecksumsPath, "utf-8");
      compatibleChecksums = JSON.parse(data) as CompatibleChecksums;
      console.log({ compatibleChecksums });

      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      console.error(err);
      console.log(
        `Cannot read ${compatibleChecksumsPath}. Version information won't be shown`
      );
      break;
    }
}

// export so we can ending the watcher
export const sketchWatcher = watch(fileURLToPath(sketchPath));
sketchWatcher.on("change", updateSketchData);
updateSketchData();

updateGameData();

export const compatibleChecksumsWatcher = watch(
  fileURLToPath(compatibleChecksumsPath)
);
compatibleChecksumsWatcher.on("change", updateCompatibleChecksums);
updateCompatibleChecksums();
