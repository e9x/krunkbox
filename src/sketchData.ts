import {
  compatibleChecksumsPath,
  gameManifest,
  gameSourceDebugPath,
  lastGameChecksumPath,
  sketchPath,
} from "./sketchDataPaths";
import { watch } from "chokidar";
import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { discordWebhook, silenceGameWebhooks } from "./env";

function notifyGameUpdate(checksum: string, previousChecksum: string, source: Buffer) {
  if (silenceGameWebhooks) return;

  const formData = new FormData();

  const payload = {
    username: "sketch-watcher",
    embeds: [
      {
        title: "\uD83C\uDFAE Krunker Game Update Detected",
        color: 0x5865f2,
        fields: [
          { name: "Previous Checksum", value: `\`${previousChecksum}\``, inline: false },
          { name: "New Checksum", value: `\`${checksum}\``, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  formData.append("payload_json", JSON.stringify(payload));
  formData.append("file", new Blob([source]), "game.debug.js");

  fetch(discordWebhook, {
    method: "POST",
    body: formData,
  }).catch((err: any) => console.error("webhook error:", err));
}

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

// Persist the last seen checksum across restarts
let lastGameChecksum: string | undefined;

// Load previously stored checksum from disk on startup
const lastChecksumLoad = readFile(lastGameChecksumPath, "utf-8")
  .then((v: string) => {
    lastGameChecksum = v.trim() || undefined;
  })
  .catch(() => {
    /* file doesn't exist yet, that's fine */
  });

// Serialize access to updateGameData so concurrent calls
// don't race on lastGameChecksum and send duplicate webhooks.
let gameUpdateLock: Promise<void> = Promise.resolve();

export function updateGameData(notify = true) {
  const next = gameUpdateLock.then(() => _updateGameDataImpl(notify));
  // Always resolve the chain so a failure doesn't block future calls
  gameUpdateLock = next.catch(() => {});
  return next;
}

async function _updateGameDataImpl(notify: boolean) {
  let src: Buffer;
  try {
    src = await readFile(gameSourceDebugPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.log(`game source doesn't exist`);
    return;
  }

  let manifest: { renamed: Record<string, string> };
  try {
    manifest = JSON.parse(await readFile(gameManifest, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(err);
      console.log(`game manifest doesn't exist`);
      return;
    } else if (err instanceof SyntaxError) {
      console.error("game manifest is invalid JSON");
      return;
    } else throw err;
  }

  const checksum = createHash("sha512").update(src).digest("hex");
  const merged = Buffer.concat([
    src,
    Buffer.from(JSON.stringify(manifest.renamed)),
  ]);
  console.log("Game source:", checksum);
  const mergedChecksum = createHash("sha512").update(merged).digest("hex");

  if (notify && lastGameChecksum && lastGameChecksum !== checksum) {
    console.log("Game update detected, notifying Discord...");
    notifyGameUpdate(checksum, lastGameChecksum, src);
  }
  lastGameChecksum = checksum;
  writeFile(lastGameChecksumPath, checksum, "utf-8").catch((err: any) =>
    console.error("failed to persist game checksum:", err),
  );

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
        `Cannot read ${compatibleChecksumsPath}. Version information won't be shown`,
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

lastChecksumLoad.then(() => updateGameData(false));

// No watcher for game files — they're only written by parseWorker (same process),
// and router.ts calls updateGameData(true) explicitly after the worker finishes.
// Watching caused duplicate webhook spam from partial/concurrent reads.

export const compatibleChecksumsWatcher = watch(
  fileURLToPath(compatibleChecksumsPath),
);
compatibleChecksumsWatcher.on("change", updateCompatibleChecksums);
updateCompatibleChecksums();
