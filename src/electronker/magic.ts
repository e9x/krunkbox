import { hookContext, mirrorAttributes } from "./hook";
import type { HookOptions } from "./hook";
import type { KruCount } from "./inject";

declare const count: KruCount;

const skinsDataBin = [...Array(count.skinsDataBin)].map((_, i) =>
  fetch(`/skin?i=${i}`).then((res) => res.arrayBuffer())
);
const coreDataBin = [...Array(count.coreDataBin)].map((_, i) =>
  fetch(`/core?i=${i}`).then((res) => res.arrayBuffer())
);
// patched when intercepting
const loaderModuleJSContent = fetch("/loader.js").then((res) => res.text());

const modulePromise = fetch("/loader.wasm")
  .then((res) => res.arrayBuffer())
  .then((loaderWasmData) => WebAssembly.compile(loaderWasmData));

WebAssembly.instantiateStreaming = async function (_source, importObject) {
  const module = await modulePromise;
  const instance = await WebAssembly.instantiate(module, importObject);
  return { module, instance };
};

localStorage.logs = "true";

export interface MagicOptions {
  newFunction?: HookOptions["newFunction"];
  generateToken: () => ArrayBuffer | Promise<ArrayBuffer>;
  resolve?: (data: string) => void;
}

/**
 * Collect and release the context resources
 * @param
 */
export type CreateOptions = (
  /**
   *  hi
   */
  collect: () => void,
  helpers: { getRenamed: () => Record<string, string>; getSkins: () => string }
) => MagicOptions;

export async function magic(createOptions: CreateOptions) {
  const iframe = document.createElement("iframe");
  iframe.hidden = true;
  document.documentElement.append(iframe);

  const contentWindow = iframe.contentWindow as typeof globalThis | null;
  if (!contentWindow) throw new Error("fail");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentWindowAny = contentWindow as any;

  const options = createOptions(() => iframe.remove(), {
    getRenamed: () => {
      const found: Record<string, string> = Object.create(null);

      for (const key in contentWindow)
        if (
          contentWindow[key as keyof typeof contentWindow] ===
            contentWindow.setTimeout &&
          key !== "setTimeout"
        )
          found.setTimeout = key;
        else if (
          contentWindow[key as keyof typeof contentWindow] ===
            contentWindow.requestAnimationFrame &&
          key !== "requestAnimationFrame"
        )
          found.requestAnimationFrame = key;

      return found;
    },
    getSkins: () => {
      return contentWindowAny.skinfx || "";
    },
  });

  // return some data from the script
  if (options.resolve) {
    const resolve = options.resolve;
    contentWindowAny.resolve = (data: string) => resolve(data);
  }

  // they might start checking if random shit like TWEEN, FRVR, and randInt exists

  Object.defineProperty(contentWindow.Object.prototype, "Context", {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    set(value) {},
    configurable: false,
    enumerable: false,
  });

  /*contentWindowAny.TWEEN = {
    update() {},
  };

  contentWindowAny.FRVR = {
    bootstrapper: {
      complete() {},
      setProgress() {},
      init() {
        return Promise.resolve();
      },
    },
    tracker: { logEvent() {}, addExtraFieldFunction() {} },
    lifecycle: {},
    channelCharacteristics: {},
  };
  contentWindowAny.loadGamNm = {};
  contentWindowAny.loadTipsHolder = {};
  contentWindowAny.randInt = function (n: number, o: number) {
    return Math.floor(Math.random() * (o - n + 1)) + n;
  };
  contentWindowAny.Howler = { volume() {} };

  contentWindowAny.m = { trust() {}, mount() {} };

  contentWindow.document.open();
  contentWindow.document.write(
    await (await fetch("https://krunker.io/")).text()
  );
  contentWindow.document.close();*/

  const load = document.createElement("div");
  load.id = "loadingBg1";
  contentWindow.document.body.append(load);

  contentWindow.WebAssembly = WebAssembly;

  interface LoaderModule {
    default: (module?: unknown) => void;
  }

  class FastXMLHttpRequest {
    async #send() {
      this.#readyState = 4;
      this.#statusText = "OK";
      this.#status = 200;

      if (this.#url.includes("generate-token")) {
        this.#response = await options.generateToken();
      } else if (this.#url.startsWith("./skins")) {
        const splitID = Number((this.#url?.match(/skins(\d+).jspck/) || [])[1]);

        if (isNaN(splitID))
          throw new Error(`Unrecognized XMLHttpRequest resource: ${this.#url}`);

        this.#response = new Uint8Array(await skinsDataBin[splitID]).buffer;
      } else {
        const splitID = Number(
          (this.#url?.match(/core.dat.split-(\d+)\?/) || [])[1]
        );

        if (isNaN(splitID))
          throw new Error(`Unrecognized XMLHttpRequest resource: ${this.#url}`);

        this.#response = new Uint8Array(await coreDataBin[splitID]).buffer;
      }

      setTimeout(() => {
        if (this.onload) this.onload(new ProgressEvent("load"));
      });
    }
    #url = "";
    #readyState = 0;
    #statusText = "";
    #status = 0;
    #response = new ArrayBuffer(0);
    get readyState() {
      return this.#readyState;
    }
    get statusText() {
      return this.#statusText;
    }
    get status() {
      return this.#status;
    }
    onload?: (event: ProgressEvent) => void;
    setRequestHeader(name: string, value: string) {
      if (name !== "GET" || value !== "cheat") {
        throw new Error("BAD HEADER");
      }
    }
    open(_method: string, url: string) {
      this.#url = url;
    }
    get response() {
      return this.#response;
    }
    send() {
      this.#send();
    }
  }

  const loader = {} as LoaderModule;
  // we can hook things in the loader without messing with the context
  // eval(js) to preserve the line #
  new contentWindow.Function(
    "js",
    "esmExports",
    "XMLHttpRequest",
    "fetch",
    `eval(js)`
  )(await loaderModuleJSContent, loader, FastXMLHttpRequest, () =>
    Promise.resolve()
  );

  hookContext(contentWindow, (context) => {
    const { newFunction } = options;
    if (!newFunction) return;

    const { Function } = context;
    const { apply } = Function.prototype;
    const applyCall = Function.prototype.call.bind(apply);

    context.Function.prototype.apply = mirrorAttributes(
      (
        {
          apply(thisArg, argArray) {
            if (this === Function)
              return newFunction(argArray, (...newArgArray: string[]) =>
                applyCall(this, thisArg, newArgArray)
              );

            return applyCall(this, thisArg, argArray);
          },
        } as { apply: typeof apply }
      ).apply,
      apply
    );
  });

  loader.default();
}
