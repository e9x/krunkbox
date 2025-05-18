import {
  compatibleChecksumsPath,
  gameSkinsPath,
  gameSourceDebugPath,
  sketchPath,
} from "./sketchDataPaths";
import { watch } from "chokidar";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Use memory as a cache layer
// Save both the gameSource and sketchScript in memory as soon as they're accessible

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

export const scripts: {
  sketch?: {
    source: Buffer;
    checksum: string;
    version: string;
  };
  game?: {
    source: Buffer;
    // why store this at all
    // skins: Buffer;
    checksum: string; // only for src
    merged: Buffer;
    mergedChecksum: string;
  };
  compat?: CompatibleChecksums;
} = {};

let checkBackSorry: NodeJS.Timeout | undefined;

async function updateSketchData() {
  // AVAIBILITY: why would we want sketch to be down, even for a seconnddd!!
  // delete scripts.sketch;

  if (checkBackSorry) {
    clearTimeout(checkBackSorry);
    checkBackSorry = undefined;
  }

  let src: Buffer;

  try {
    src = await readFile(sketchPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("sketch code doesn't exist");
      return;
    } else throw err;
  }

  let version: string;

  {
    const txt = src.toString();
    if (txt.split("\n").length > 100) {
      console.error("I'm deleting this confidential code");
      await unlink(sketchPath);
      return;
    }

    try {
      new Function(txt);
    } catch (err) {
      // hopefully the script is still being uploaded and will be valid in one second
      console.error("sketch code is junk: invalid js");
      checkBackSorry = setTimeout(updateSketchData, 1e3);
      return;
    }

    [, version] = txt.match(/^\/\/ @version\s+(.*?)$/m) || [];
  }

  if (!version) {
    console.error("sketch code is junk: can't find `// @version`");
    checkBackSorry = setTimeout(updateSketchData, 1e3);
    return;
  }

  const hash = createHash("sha512");
  hash.update(src);
  const checksum = hash.digest("hex");
  console.log("sketch checksum:", checksum);

  console.log("sketch version:", version);

  scripts.sketch = { checksum, source: src, version };
}

export async function updateGameData() {
  delete scripts.game;

  let src: Buffer;
  try {
    src = await readFile(gameSourceDebugPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.log(`game source doesn't exist`);
    return;
  }

  let skins: Buffer;
  try {
    skins = await readFile(gameSkinsPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(err);
      console.log(`game skins doesn't exist`);
      return;
    } else throw err;
  }

  const checksum = createHash("sha512").update(src).digest("hex");
  const merged = Buffer.concat([src, skins]);
  console.log("Game source:", checksum);
  const mergedChecksum = createHash("sha512").update(merged).digest("hex");

  scripts.game = {
    source: src,
    checksum,
    merged,
    mergedChecksum,
  };
}

async function updateCompatibleChecksums() {
  delete scripts.compat;

  let compat: CompatibleChecksums;

  try {
    const data = await readFile(compatibleChecksumsPath, "utf-8");
    compat = JSON.parse(data) as CompatibleChecksums;
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("Compat table contained invalid JSON 😨");
      console.error(err);
      return;
    } else if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(err);
      console.log(
        `Cannot read ${compatibleChecksumsPath}. Version information won't be shown`
      );
      return;
    } else throw err;
  }

  console.log("CHECKSUMS:", compat);
  scripts.compat = compat;
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
