import { readFile } from "node:fs/promises";
import parseGame from "./parseWorker";
import { gameManifest } from "./sketchDataPaths";
import { KruSource } from "~client/inject";

const k = JSON.parse(await readFile(gameManifest, "utf-8")) as KruSource;
parseGame(k, false);
