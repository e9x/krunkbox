import "source-map-support/register.js";
import parseGame from "./parseWorker.js";
import { binDir } from "./updateBin.js";
import { readFile } from "node:fs/promises";

await parseGame(await readFile(new URL("./game.debug.js", binDir), "utf-8"));
