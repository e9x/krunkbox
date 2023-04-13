import { binDir } from "./updateBin.js";
import { Deobfuscator } from "deobfuscator";
import esbuild from "esbuild";
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
  const minified = await esbuild.transform(deobfuscated, {
    minify: true,
    sourcemap: false,
    legalComments: "none",
    treeShaking: true,
  });
  console.timeEnd("Minify");

  new Function(deobfuscated);

  await writeFile(new URL("./game.min.js", binDir), minified.code);
}
