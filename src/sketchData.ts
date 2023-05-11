/* eslint-disable no-constant-condition */
// Use memory as a cache layer
// Save both the gameSource and sketchScript in memory as soon as they're accessible

import { gameSkinsPath, gameSourcePath, sketchPath } from "./sketchDataPaths";
import { watch } from "chokidar";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let sketchScript: undefined | string;
let gameSource: undefined | string;
let gameSkins: undefined | string;

let sketchVersion: undefined | string;
let gameChecksum: undefined | string;

export function getSketchVersion() {
  return sketchVersion;
}

export function getGameChecksum() {
  return gameChecksum;
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

  while (true)
    try {
      sketchScript = await readFile(sketchPath, "utf-8");

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

async function updateGameSourceData() {
  gameSource = undefined;

  while (true)
    try {
      gameSource = await readFile(gameSourcePath, "utf-8");

      gameChecksum = generateSHA512Checksum(gameSource);
      console.log({ gameChecksum });

      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      console.error(err);
      console.log(
        `Cannot read ${gameSourcePath}. Version information won't be shown`
      );
      break;
    }
}

async function updateGameSkinsData() {
  gameSkins = undefined;

  while (true)
    try {
      gameSkins = await readFile(gameSkinsPath, "utf-8");

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

// export so we can ending the watcher
export const sketchWatcher = watch(fileURLToPath(sketchPath));
sketchWatcher.on("change", updateSketchData);
updateSketchData();

export const gameSourceWatcher = watch(fileURLToPath(gameSourcePath));
gameSourceWatcher.on("change", updateGameSourceData);
updateGameSourceData();

export const gameSkinsWatcher = watch(fileURLToPath(gameSkinsPath));
gameSkinsWatcher.on("change", updateGameSkinsData);
updateGameSkinsData();
