import { binDir } from "./kruPaths";

export const gameSourceDebugPath = new URL("./game.debug.js", binDir);
export const gameSourcePath = new URL("./game.min.js", binDir);
export const gameSourceDeobPath = new URL("./game.deob.js", binDir);
export const gameSkinsPath = new URL("./skins.jspck", binDir);
// for stuff like the renamed vars blah blah blah
export const gameManifest = new URL("./game.manifest.json", binDir);
export const userscriptName = "sketch.user.js";
export const sketchPath = new URL(userscriptName, binDir);
export const compatibleChecksumsPath = new URL("./compat.json", binDir);
export const lastGameChecksumPath = new URL("./last_game_checksum.txt", binDir);
export const ccChecksumsPath = new URL("./cc_checksums.txt", binDir);
