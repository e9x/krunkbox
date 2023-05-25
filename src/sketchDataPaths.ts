import { binDir } from "./updateBin";

export const gameSourceDebugPath = new URL("./game.debug.js", binDir);
export const gameSourcePath = new URL("./game.min.js", binDir);
export const gameSkinsPath = new URL("./skins.jspck", binDir);
export const userscriptName = "sketch.user.js";
export const sketchPath = new URL(userscriptName, binDir);
export const compatibleChecksumsPath = new URL("./compat.json", binDir);
