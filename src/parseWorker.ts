import {
  gameSkinsPath,
  gameSourceDebugPath,
  gameSourcePath,
} from "./sketchDataPaths";
import { transform } from "esbuild";
import { writeFile } from "node:fs/promises";
import { webcrack } from "webcrack";
import { KruSource } from "~client/inject";

const myTokenArg = "WP_MMToken";

export default async function parseGame(exp: KruSource) {
  // add helpers so the debug file can execute
  await writeFile(
    gameSourceDebugPath,
    `${Object.entries(exp.renamed)
      .map(([name, src]) => `window.${src}=${name}`)
      .join(";")};var ${exp.token}=${myTokenArg};${exp.source}`
  );

  await writeFile(gameSkinsPath, exp.skins);

  console.log("Processing game...");

  console.time("Deobfuscate");

  // crack(gameScript):                                       27.367s
  // await new Deobfuscator().deobfuscateSource(gameScript):  8:38.864 (m:ss.mmm) fail
  // ^ but only StringDecoder:                                35.158s
  let deobfuscated = "";

  const oldLog = console.log;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = () => {};

  try {
    deobfuscated = (await webcrack(exp.source)).code;
  } finally {
    console.log = oldLog;
  }

  console.timeEnd("Deobfuscate");

  for (const v in exp.renamed)
    deobfuscated = deobfuscated.replaceAll(exp.renamed[v], v);

  deobfuscated = deobfuscated.replaceAll(exp.token, myTokenArg);

  console.time("Minify");
  let { code: minified } = await transform(deobfuscated, {
    minify: true,
    sourcemap: false,
    legalComments: "none",
    treeShaking: true,
    supported: {
      "nullish-coalescing": false,
      "optional-catch-binding": false,
      "optional-chain": false,
    },
  });
  console.timeEnd("Minify");

  const [, procInputs] =
    minified.match(/this\.(\w+)=function\((?:\w+,){3}\w+\)\{this\.recon=/) ||
    [];

  console.log({ procInputs });

  minified = minified.replaceAll(procInputs, "procInputs");

  const [, , canBSeen] =
    minified.match(/!(\w+)\.isYou&&\1\.objInstances\){if\(\1\.(\w+)\){/) || [];

  console.log({ canBSeen });

  minified = minified.replaceAll(canBSeen, "canBSeen");

  // make sure it can be executed
  new Function(deobfuscated);

  await writeFile(gameSourcePath, minified);
}
