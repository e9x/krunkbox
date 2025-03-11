import { build } from "esbuild";

await build({
  platform: "node",
  entryPoints: [
    {
      in: "src/test.ts",
      out: "test",
    },
    {
      in: "src/server.ts",
      out: "server",
    },
    {
      in: "src/parseWorker.ts",
      out: "parseWorker",
    },
  ],
  outdir: "dist/",
  format: "esm",
  sourcemap: true,
  bundle: true,
  minify: true,
  external: ["./db.js"],
  packages: "external",
  tsconfig: "src/tsconfig.json",
});

await build({
  platform: "browser",
  entryPoints: ["client/preload.ts"],
  outfile: "dist/preload.js",
  format: "cjs",
  sourcemap: "inline",
  bundle: true,
  minify: true,
  packages: "external",
  tsconfig: "src/tsconfig.json",
});
