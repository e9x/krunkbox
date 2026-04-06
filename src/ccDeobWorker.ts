import { webcrack } from "webcrack";

export default async function deobfuscateCC(source: string) {
  const result = await webcrack(source, {
    deobfuscate: true,
    mangle: () => true,
    unminify: true,
    unpack: true,
    jsx: false,
  });

  return result.code;
}
