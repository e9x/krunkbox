import { transform } from "esbuild";
import {
  gameSkinsPath,
  gameSourceDebugPath,
  gameSourcePath,
  gameManifest,
  gameSourceDeobPath,
} from "./sketchDataPaths";
import { writeFile } from "node:fs/promises";
import { webcrack } from "webcrack";
import type { KruSource } from "~client/inject";

const myTokenArg = "WP_MMToken";

export default async function parseGame(exp: KruSource, saveManifest = true) {
  // massive waste of resources
  if (saveManifest) {
    console.log("saving game.manifest.json");
    await writeFile(gameManifest, JSON.stringify(exp));
  }

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

  // try {
  //   deobfuscated = (
  //     await webcrack(exp.source, {
  //       mangle: false,
  //       jsx: false,
  //       unminify: false,
  //       unpack: false,
  //       onProgress: (prog) => console.log("smoke crack:", prog),
  //     })
  //   ).code;
  // } finally {
  //   console.log = oldLog;
  // }

  // console.timeEnd("Deobfuscate");

  // for (const v in exp.renamed)
  //   deobfuscated = deobfuscated.replaceAll(exp.renamed[v], v);

  // deobfuscated = deobfuscated.replaceAll(exp.token, myTokenArg);

  // await writeFile(gameSourceDeobPath, deobfuscated);
  // // await writeFile(gameSourceDeobPath, deobfuscated);

  // let minified = deobfuscated;

  // const isSchizo = /[iI][îiïíì]{6}/g;

  // const iTray: string[] = [];

  // minified = minified.replace(isSchizo, (m) => {
  //   let ind = iTray.indexOf(m);
  //   if (ind === -1) {
  //     ind = iTray.push(m) - 1;
  //   }
  //   return "KRL" + ind.toString(16);
  // });

  try {
    deobfuscated = (
      await webcrack(exp.source, {
        jsx: false,
        deobfuscate: true,
        unminify: false,
        unpack: false,
      })
    ).code;
  } finally {
    console.log = oldLog;
  }

  console.timeEnd("Deobfuscate");

  for (const v in exp.renamed)
    deobfuscated = deobfuscated.replaceAll(exp.renamed[v], v);

  deobfuscated = deobfuscated.replaceAll(exp.token, myTokenArg);

  await writeFile(gameSourceDeobPath, deobfuscated);

  console.time("Minify");
  let { code: minified } = await transform(deobfuscated, {
    minify: true,
    sourcemap: false,
    legalComments: "none",
    treeShaking: false,
    supported: {
      "nullish-coalescing": false,
      "optional-catch-binding": false,
      "optional-chain": false,
    },
  });
  console.timeEnd("Minify");

  const [, , canBSeen] =
    minified.match(/!(\w+)\.isYou&&\1\.objInstances\){if\(\1\.(\w+)\){/) || [];

  console.log({ canBSeen });

  minified = minified.replaceAll(canBSeen, "canBSeen");

  // make sure it can be executed
  new Function(minified);

  await writeFile(gameSourcePath, minified);
}
