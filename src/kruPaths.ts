export const binDir = new URL("../bin/", import.meta.url);
export const loaderModuleDebugJS = new URL("./loader.debug.mjs", binDir);
export const loaderModuleJS = new URL("./loader.min.mjs", binDir);
export const loaderWasmPath = new URL("./loader.wasm", binDir);
export const coreDir = new URL("./cores/", binDir);
export const skinsDir = new URL("./skins/", binDir);
