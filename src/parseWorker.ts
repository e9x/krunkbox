import { string } from "@tdewolff/minify";
import { writeFile } from "node:fs/promises";

export async function parse(gameScript: string) {
  await writeFile(new URL("../bin/game.debug.js", import.meta.url), gameScript);

  console.log("Minifying game...");

  console.time("Minify");
  const minified = string("application/javascript", gameScript);
  console.timeEnd("Minify");

  await writeFile(new URL("../bin/game.min.js", import.meta.url), minified);
}
