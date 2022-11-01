import { writeFile } from "fs/promises";
import { minify } from "terser";

export async function parse(gameScript: string) {
  await writeFile(new URL("../bin/game.debug.js", import.meta.url), gameScript);

  console.log("Parsing game...");

  console.time("parse");
  const minified = (await minify(gameScript)).code!;
  console.timeEnd("parse");

  await writeFile(new URL("../bin/game.min.js", import.meta.url), minified);

  const [, , ahk] =
    minified.match(/function\((\w+)\){\1\.exports=JSON\.parse\("(\d+)"\)}/) ||
    [];

  const [, build] = minified.match(/\w+\.exports\.buildVersion="(.*?)"/) || [];

  await writeFile(
    new URL("../bin/gameVars.json", import.meta.url),
    Buffer.from(
      JSON.stringify({
        ahk: parseInt(ahk),
        build,
      })
    )
  );
}
