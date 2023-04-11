import { writeFile } from "fs/promises";
import { minify } from "terser";

export async function parse(gameScript: string) {
  await writeFile(new URL("../bin/game.debug.js", import.meta.url), gameScript);

  console.log("Parsing game...");

  console.time("Parse");
  const minified = (await minify(gameScript)).code!;
  console.timeEnd("Parse");

  await writeFile(new URL("../bin/game.min.js", import.meta.url), minified);
}
