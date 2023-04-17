// Use memory as a cache layer
// Save both the gameScript and sketchScript in memory as soon as they're accessible
import { binDir } from "./updateBin.js";
import { watch } from "chokidar";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let sketchScript: undefined | string;
let gameScript: undefined | string;

let sketchVersion: undefined | string;
let gameVersion: undefined | string;

const gamePath = new URL("./game.min.js", binDir);
export const userscriptName = "sketch.user.js";
export const sketchPath = new URL(userscriptName, binDir);

export function getSketchVersion() {
  return sketchVersion;
}

export function getGameVersion() {
  return gameVersion;
}

export function getSketchScript() {
  return sketchScript;
}

export function getGameScript() {
  return gameScript;
}

async function updateSketchData() {
  sketchScript = undefined;

  try {
    sketchScript = await readFile(sketchPath, "utf-8");

    const [, matchSketchVersion] =
      sketchScript.match(/^\/\/ @version\s+(.*?)$/m) || [];

    if (!matchSketchVersion) {
      console.error("Failure finding sketch version");
      return;
    }

    sketchVersion = matchSketchVersion;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.error("friendly error:", err);
    console.log(
      `Cannot read ${sketchPath}. Version information won't be shown`
    );
  }
}

async function updateGameData() {
  gameScript = undefined;

  try {
    gameScript = await readFile(gamePath, "utf-8");

    const [, matchGameVersion] =
      gameScript.match(/exports=JSON\.parse\('"(.*?)"'\)/) || [];

    if (!matchGameVersion) {
      console.error("Failure finding game version");
      return;
    }

    gameVersion = matchGameVersion;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.error("friendly error:", err);
    console.log(`Cannot read ${gamePath}. Version information won't be shown`);
  }
}

// export so we can ending the watcher
export const sketchWatcher = watch(fileURLToPath(sketchPath));
sketchWatcher.on("change", updateSketchData);
updateSketchData();

export const gameWatcher = watch(fileURLToPath(gamePath));
gameWatcher.on("change", updateGameData);
updateGameData();
