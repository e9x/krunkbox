import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

/**
 * @type {import("rollup").RollupOptions}
 */
const config = [
  {
    input: "src/server.ts",
    output: { file: "dist/server.js", format: "es", sourcemap: true },
    external: [/node_modules/],
    plugins: [nodeResolve(), typescript()],
  },
  {
    input: "src/parseWorker.ts",
    output: { file: "dist/parseWorker.js", format: "es", sourcemap: true },
    external: [/node_modules/],
    plugins: [nodeResolve(), typescript()],
  },
  {
    input: "src/electronker/preload.ts",
    output: { file: "dist/preload.js", format: "cjs", sourcemap: "inline" },
    external: [/node_modules/],
    plugins: [nodeResolve(), typescript()],
  },
];

export default config;
