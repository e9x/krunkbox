import { binDir } from "./updateBin.js";
import { string } from "@tdewolff/minify";
import { Deobfuscator } from "deobfuscator";
import { writeFile } from "node:fs/promises";

export default async function parseGame(gameScript: string) {
  await writeFile(new URL("./game.debug.js", binDir), gameScript);

  console.log("Minifying game...");

  console.time("Deobfuscate");

  // crack(gameScript):                                       27.367s
  // await new Deobfuscator().deobfuscateSource(gameScript):  8:38.864 (m:ss.mmm) fail
  // ^ but only StringDecoder:                                35.158s
  const deobfuscated = await new Deobfuscator().deobfuscateSource(gameScript, {
    customTransformers: [["StringDecoder", []]],
  });
  console.timeEnd("Deobfuscate");

  console.time("Minify");
  const minified = string("application/javascript", deobfuscated);
  console.timeEnd("Minify");

  await writeFile(new URL("./game.min.js", binDir), minified);
}
