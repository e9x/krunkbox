/* eslint-disable no-async-promise-executor */
import "source-map-support/register.js";
import type * as EnvModule from "./env.js";
import { readdir, readFile } from "node:fs/promises";
import type { Module, SourceTextModuleOptions } from "node:vm";
import { createContext, Script, SourceTextModule } from "node:vm";

const loaderWasmPath = new URL("../bin/loader.wasm", import.meta.url);
const coreDir = new URL("../bin/cores/", import.meta.url);

const coreDataBin: ArrayBuffer[] = await Promise.all(
  (
    await readdir(coreDir)
  ).map(async (file) => (await readFile(new URL(file, coreDir))).buffer)
);

const envModuleJS = new URL("env.js", import.meta.url);
const envModuleContent = await readFile(envModuleJS, "utf-8");
const spoofEnvModuleJS = envModuleJS.toString(); // "<anonymous>";

console.time("Compile JS");

const createEnvModule = (
  context?: SourceTextModuleOptions["context"],
  cachedData?: SourceTextModuleOptions["cachedData"]
) =>
  new SourceTextModule(envModuleContent, {
    context,
    identifier: spoofEnvModuleJS,
    cachedData,
  });

const envModuleCache = createEnvModule().createCachedData();

const loaderModuleJS = new URL("../bin/loader.mjs", import.meta.url);
const loaderModuleJSContent = await readFile(loaderModuleJS, "utf-8");
const spoofLoaderModuleJS = loaderModuleJS.toString(); // "https://krunker.io/pkg/loader.mjs?t="; // should the build be here?

interface LoaderModule {
  default: (module?: unknown) => void;
}

const createLoaderModule = (
  context?: SourceTextModuleOptions["context"],
  cachedData?: SourceTextModuleOptions["cachedData"]
) =>
  new SourceTextModule(loaderModuleJSContent, {
    context,
    identifier: spoofLoaderModuleJS,
    initializeImportMeta: (meta) => {
      meta.url = spoofLoaderModuleJS;
    },
    cachedData,
  });

const loaderModuleCache = createLoaderModule().createCachedData();

console.timeEnd("Compile JS");

function noLinker(): Module {
  throw new Error("Unsupported");
}

const wasmCompilerJS = new URL("wasmCompiler.js", import.meta.url);

const wasmCompiler = new SourceTextModule(
  await readFile(wasmCompilerJS, "utf-8"),
  {
    context: createContext(),
    identifier: wasmCompilerJS.toString(),
  }
);
await wasmCompiler.link(noLinker);
await wasmCompiler.evaluate();

const { WebAssembly, modulePromise } =
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  (wasmCompiler.namespace as typeof import("./wasmCompiler.js")).compileWasm(
    (await readFile(loaderWasmPath)).buffer
  );

console.time("Compile WASM module");
await modulePromise;
console.timeEnd("Compile WASM module");

const getThis = new Script("this");

async function execute(initData: EnvModule.InitData) {
  const context = createContext();

  const envModule = createEnvModule(context, envModuleCache);
  await envModule.link(noLinker);
  await envModule.evaluate();

  const loaderModule = createLoaderModule(context, loaderModuleCache);
  await loaderModule.link(noLinker);

  const env = (envModule.namespace as typeof EnvModule).default(initData);

  await loaderModule.evaluate();
  (loaderModule.namespace as LoaderModule).default();

  return env;
}

const baseInit = (): EnvModule.InitData => ({
  coreDataBin,
  TextDecoder,
  WebAssembly,
  URL,
  console,
  fetch,
  logs: true,
  generateToken: async () =>
    await (
      await fetch("https://matchmaker.krunker.io/generate-token")
    ).arrayBuffer(),
  contentWindow: getThis.runInNewContext(),
});

export const hashToken = (token: ArrayBuffer) =>
  new Promise<string>((resolve, reject) =>
    execute({
      ...baseInit(),
      resolve: (hashed: string) => resolve(hashed),
      generateToken: () => token,
      newFunction: (args) => {
        // console.log(args);
        if (args.length === 2 && args[1].startsWith("\nfunction "))
          args[1] = `window.resolve(${args[0]})`;

        return args;
      },
    }).catch(reject)
  );

export const game = () =>
  new Promise<string>(async (resolve, reject) => {
    try {
      const env = await execute({
        ...baseInit(),
        generateToken: () =>
          new Uint8Array([25, 30, 17, 17, 27, 16, 16, 29, 16, 24]).buffer,
        newFunction: (args) => {
          if (args.length === 2 && args[1].startsWith("\nfunction ")) {
            let source = args[1];
            args[1] = ``;

            for (const [key, value] of env.getRenamed())
              source = source.replaceAll(key, value);

            source = source.replaceAll(args[0], "WP_MMToken");

            resolve(source);
          }

          return args;
        },
      });
    } catch (err) {
      reject(err);
    }
  });
