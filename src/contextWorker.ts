import type { HashedData, Token, InitData } from "./env.js";
import { readdir, readFile } from "fs/promises";
import fetch from "node-fetch";
import { performance } from "perf_hooks";
import { loaderScriptPath } from "updateBin.js";
import { Script, createContext } from "vm";

type CompatibleContext = { initData: Readonly<InitData> };

const coreDir = new URL("../bin/cores/", import.meta.url);

const coreDataBin: ArrayBuffer[] = await Promise.all(
  (
    await readdir(coreDir)
  ).map(async (file) => (await readFile(new URL(file, coreDir))).buffer)
);

const initScriptPath = new URL("./env.js", import.meta.url);

const initScript = new Script(
  (await readFile(initScriptPath, "utf-8")).replace("export {};", ""),
  {
    filename: initScriptPath.toString(),
  }
);

const loaderScriptPath2 = new URL("../bin/loader.patch.mjs", import.meta.url);

const loaderScript = new Script(
  (await readFile(loaderScriptPath2, "utf-8"))
    // simulate ESM support
    .replace(
      /import\.meta/g,
      JSON.stringify({ url: "https://krunker.io/pkg/loader.mjs" })
    )
    .replace(/export default/g, "this.defaultExport = "),
  {
    filename: loaderScriptPath2.toString(),
  }
);

const executeDefaultScript = new Script("defaultExport()", {
  filename: "Default Execute",
});

const getThis = new Script("this");

// context provides: WebAssembly, pre-compiled module
const WebAssemblyContext = {
  loaderWasmData: (
    await readFile(new URL("../bin/loader.wasm", import.meta.url))
  ).buffer,
};

createContext(WebAssemblyContext);

const [WebAssembly, modulePromise] = new Script(`
const modulePromise = WebAssembly.compile(loaderWasmData);

WebAssembly.instantiateStreaming = async function (_source, importObject) {
	const module = await modulePromise;
	const instance = await WebAssembly.instantiate(module, importObject);
	return { module, instance };
};

[WebAssembly, modulePromise]`).runInContext(WebAssemblyContext);

console.time("Compile WASM module");
await modulePromise;
console.timeEnd("Compile WASM module");

const baseInit = () => ({
  WebAssembly,
  coreDataBin,
  performanceNow: performance.now,
  TextDecoder,
  URL,
  console,
  async generateToken() {
    return await (
      await fetch("https://matchmaker.krunker.io/generate-token", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 6.1; rv:31.0) Gecko/20100101 Firefox/31.0",
        },
      })
    ).arrayBuffer();
  },
  fetch,
  contentWindow: getThis.runInNewContext(),
});

/*{
	const context = {
		initData: {
			...baseInit,
			TextDecoder: class extends TextDecoder {
				decode(buffer) {
					const decoded = super.decode(buffer);
					// decoded === "return new Function('WP_fetchMMToken',new TextDecoder().decode(new Uint8Array(arg)))(token)"

					return decoded;
				},
			},
	};
	
	createContext(context);
	initScript.runInContext(context);
	loaderScript.runInContext(context);
  executeDefaultScript.runInContext(context);
}*/

const dummyToken = {
  token: "",
  cfid: 0,
  sid: 0,
};

export const hashToken = (token: Token) =>
  new Promise<HashedData>((resolve) => {
    const context: CompatibleContext = {
      initData: Object.freeze<InitData>({
        ...baseInit(),
        coreDataBin: false,
        resolve: (hashed) => resolve(JSON.parse(hashed)),
        async generateToken() {
          return JSON.stringify(token);
        },
        TextDecoder: class extends TextDecoder {
          decode(buffer: BufferSource | undefined) {
            const decoded = super.decode(buffer);

            if (
              decoded ===
              "return new Function('WP_fetchMMToken',new TextDecoder().decode(new Uint8Array(arg)))(token)"
            ) {
              return "return token.then(data => window.resolve(JSON.stringify(data))), () => {}";
            }

            return decoded;
          }
        },
      }),
    };

    createContext(context);
    initScript.runInContext(context);
    loaderScript.runInContext(context);
    executeDefaultScript.runInContext(context);
  });

export const game = () =>
  new Promise<string>((resolve) => {
    const context: CompatibleContext = {
      initData: Object.freeze<InitData>({
        ...baseInit(),
        resolve: (script) => resolve(script),
        async generateToken() {
          return JSON.stringify(dummyToken);
        },
        TextDecoder: class extends TextDecoder {
          decode(buffer: BufferSource | undefined) {
            const decoded = super.decode(buffer);

            if (
              decoded ===
              "return new Function('WP_fetchMMToken',new TextDecoder().decode(new Uint8Array(arg)))(token)"
            ) {
              return "return window.resolve(new TextDecoder().decode(new Uint8Array(arg))), () => {}";
            }

            return decoded;
          }
        },
      }),
    };

    createContext(context);
    initScript.runInContext(context);
    loaderScript.runInContext(context);
    executeDefaultScript.runInContext(context);
  });
