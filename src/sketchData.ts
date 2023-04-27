/* eslint-disable no-constant-condition */
// Use memory as a cache layer
// Save both the gameScript and sketchScript in memory as soon as they're accessible
import { binDir } from "./updateBin.js";
import { watch } from "chokidar";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let sketchScript: undefined | string;
let gameScript: undefined | string;

let sketchVersion: undefined | string;
let gameChecksum: undefined | string;

const gamePath = new URL("./game.min.js", binDir);
export const userscriptName = "sketch.user.js";
export const sketchPath = new URL(userscriptName, binDir);

export function getSketchVersion() {
  return sketchVersion;
}

export function getGameChecksum() {
  return gameChecksum;
}

export function getSketchScript() {
  return sketchScript;
}

export function getGameScript() {
  return gameScript;
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
      console.error("friendly error:", err);
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

async function updateGameData() {
  gameScript = undefined;

  while (true)
    try {
      gameScript = await readFile(gamePath, "utf-8");

      gameChecksum = generateSHA512Checksum(gameScript);
      console.log({ gameChecksum });

      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      console.error("friendly error:", err);
      console.log(
        `Cannot read ${gamePath}. Version information won't be shown`
      );
      break;
    }
}

// export so we can ending the watcher
export const sketchWatcher = watch(fileURLToPath(sketchPath));
sketchWatcher.on("change", updateSketchData);
updateSketchData();

export const gameWatcher = watch(fileURLToPath(gamePath));
gameWatcher.on("change", updateGameData);
updateGameData();
