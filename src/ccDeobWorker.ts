import { webcrack } from "webcrack";
import { transform } from "esbuild";

export default async function deobfuscateCC(source: string) {
  let code = source;

  try {
    const result = await webcrack(source, {
      deobfuscate: true,
      mangle: false,
      unminify: true,
      unpack: true,
      jsx: false,
    });
    code = result.code;
  } catch (err) {
    console.error("webcrack failed, falling back to raw source:", (err as Error).message);
  }

  const transformed = await transform(code, {
    minify: false,
    minifyIdentifiers: true,
    format: "esm",
    legalComments: "none",
  });

  return transformed.code;
}
