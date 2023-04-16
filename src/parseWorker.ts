import { binDir } from "./updateBin.js";
import type { ExportedGame } from "contextWorker.js";
import { Deobfuscator } from "deobfuscator";
import esbuild from "esbuild";
import { writeFile } from "node:fs/promises";

export default async function parseGame(exp: ExportedGame) {
  // add helpers so the debug file can execute
  await writeFile(
    new URL("./game.debug.js", binDir),
    `${Object.entries(exp.renamed)
      .map(([name, src]) => `window.${src}=${name}`)
      .join(";")};${exp.source}`
  );

  console.log("Processing game...");

  console.time("Deobfuscate");

  // crack(gameScript):                                       27.367s
  // await new Deobfuscator().deobfuscateSource(gameScript):  8:38.864 (m:ss.mmm) fail
  // ^ but only StringDecoder:                                35.158s
  let deobfuscated = await new Deobfuscator().deobfuscateSource(exp.source, {
    customTransformers: [["StringDecoder", []]],
  });
  console.timeEnd("Deobfuscate");

  for (const v in exp.renamed)
    deobfuscated = deobfuscated.replaceAll(exp.renamed[v], v);

  console.time("Minify");
  let { code: minified } = await esbuild.transform(deobfuscated, {
    minify: true,
    sourcemap: false,
    legalComments: "none",
    treeShaking: true,
  });
  console.timeEnd("Minify");

  const [, , canBSeen] =
    minified.match(/!(\w+)\.isYou&&\1\.objInstances\){if\(\1\.(\w+)\){/) || [];

  console.log({ canBSeen });

  minified = minified.replaceAll(canBSeen, "canBSeen");

  new Function(deobfuscated);

  await writeFile(new URL("./game.min.js", binDir), minified);
}
