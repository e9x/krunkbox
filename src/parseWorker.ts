import { binDir } from "./updateBin.js";
import { string } from "@tdewolff/minify";
import { writeFile } from "node:fs/promises";

export async function parse(gameScript: string) {
  await writeFile(new URL("./game.debug.js", binDir), gameScript);

  console.log("Minifying game...");

  console.time("Minify");
  const minified = string("application/javascript", gameScript);
  console.timeEnd("Minify");

  await writeFile(new URL("./game.min.js", binDir), minified);
}
