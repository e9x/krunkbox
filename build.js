import eslint from "esbuild-plugin-eslint";
import { build } from "esbuild";

await build({
  platform: "node",
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  format: "esm",
  sourcemap: true,
  bundle: true,
  minify: true,
  packages: "external",
  tsconfig: "src/tsconfig.json",
  plugins: [eslint()],
});

await build({
  platform: "node",
  entryPoints: ["src/parseWorker.ts"],
  outfile: "dist/parseWorker.js",
  format: "esm",
  sourcemap: true,
  bundle: true,
  minify: true,
  packages: "external",
  tsconfig: "src/tsconfig.json",
  plugins: [eslint()],
});

await build({
  platform: "node",
  entryPoints: ["client/preload.ts"],
  outfile: "dist/preload.js",
  format: "cjs",
  sourcemap: "inline",
  bundle: true,
  minify: true,
  packages: "external",
  tsconfig: "src/tsconfig.json",
  plugins: [eslint()],
});
