import { webcrack } from "webcrack";
import { transform } from "esbuild";

export default async function deobfuscateCC(source: string) {
  try {
    const result = await webcrack(source, {
      deobfuscate: true,
      mangle: false,
      unminify: true,
      unpack: false,
      jsx: false,
    });
    return result.code;
  } catch (err) {
    console.error("webcrack failed, falling back to esbuild:", (err as Error).message);
  }

  const transformed = await transform(source, {
    minify: false,
    minifyIdentifiers: true,
    format: "esm",
    legalComments: "none",
  });

  return transformed.code;
}
