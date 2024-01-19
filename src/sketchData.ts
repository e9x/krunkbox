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

let sketchScript: undefined | string;
let gameSource: undefined | string;
let gameSkins: undefined | string;

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
let gameSourceChecksum: undefined | null | string;
let gameSkinsChecksum: undefined | null | string;

export function getCompatibleChecksums() {
  return compatibleChecksums;
}

export function getSketchChecksum() {
  return sketchChecksum;
}

export function getSketchVersion() {
  return sketchVersion;
}

export function getGameSourceChecksum() {
  return gameSourceChecksum;
}

export function getGameSkinsChecksum() {
  return gameSkinsChecksum;
}

export function getSketchScript() {
  return sketchScript;
}

export function getGameSource() {
  return gameSource;
}

export function getGameSkins() {
  return gameSkins;
}

async function updateSketchData() {
  sketchScript = undefined;
  sketchVersion = undefined;
  sketchChecksum = undefined;

  while (true)
    try {
      const tmpSketchScript = await readFile(sketchPath, "utf-8");

      if (tmpSketchScript.split("\n").length > 100) {
        console.error(
          "Detected Sketch source code. Deleting file and refusing to serve a script."
        );
        await unlink(sketchPath);
        return;
      }

      sketchScript = tmpSketchScript;
      sketchChecksum = generateSHA512Checksum(sketchScript);

      const [, matchSketchVersion] =
        sketchScript.match(/^\/\/ @version\s+(.*?)$/m) || [];

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

function generateSHA512Checksum(string: string) {
  const hash = createHash("sha512");
  hash.update(string);
  return hash.digest("hex");
}

export async function updateGameData() {
  gameSource = undefined;
  gameSourceChecksum = null;

  while (true)
    try {
      gameSource = await readFile(gameSourcePath, "utf-8");
      gameSourceChecksum = generateSHA512Checksum(gameSource);
      console.log("Game Source:", gameSourceChecksum);

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
  gameSkinsChecksum = null;

  while (true)
    try {
      gameSkins = await readFile(gameSkinsPath, "utf-8");
      gameSkinsChecksum = generateSHA512Checksum(gameSkins);
      console.log("Game Skins: ", gameSkinsChecksum);

      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      console.error(err);
      console.log(
        `Cannot read ${gameSkinsPath}. Version information won't be shown`
      );
      break;
    }
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
