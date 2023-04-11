export function compileWasm(loaderWasmData: ArrayBuffer) {
  const modulePromise = WebAssembly.compile(loaderWasmData);

  WebAssembly.instantiateStreaming = async function (_source, importObject) {
    const module = await modulePromise;
    const instance = await WebAssembly.instantiate(module, importObject);
    return { module, instance };
  };

  return { WebAssembly, modulePromise };
}
