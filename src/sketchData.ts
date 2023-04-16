import { binDir } from "./updateBin.js";
import { watch } from "chokidar";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let sketchVersion: undefined | string;

export const userscriptName = "krunksketch.user.js";
export const sketchPath = new URL(userscriptName, binDir);

export function getSketchVersion() {
  return sketchVersion;
}

async function updateSketchData() {
  try {
    const script = await readFile(sketchPath, "utf-8");

    const [, v] = script.match(/^\/\/ @version\s+(.*?)$/m) || [];

    if (!v) {
      console.error("Failure finding version");
      return;
    }

    sketchVersion = v;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.error("friendly error:", err);
    console.log(
      `Cannot read ${sketchPath}. Version information won't be shown`
    );
  }
}

// allow ending the watcher
export const watcher = watch(fileURLToPath(sketchPath));

watcher.on("all", updateSketchData);
