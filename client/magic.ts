import { hookContext, mirrorAttributes } from "./hook";
import type { HookOptions } from "./hook";

localStorage.logs = "true";

export interface MagicOptions {
  newFunction?: HookOptions["newFunction"];
  generateToken: () => ArrayBuffer | Promise<ArrayBuffer>;
  resolve?: (data: string) => void;
}

declare global {
  var resolve: MagicOptions["resolve"];
  var skinfx: string;
}

/**
 * Collect and release the context resources
 * @param
 */
export type CreateOptions = (
  collect: () => void,
  helpers: { getRenamed: () => Record<string, string>; getSkins: () => string }
) => MagicOptions;

export function magic(createOptions: CreateOptions) {
  const oldKeys = Object.keys(window);

  const options = createOptions(() => {}, {
    getRenamed: () => {
      const found: Record<string, string> = Object.create(null);

      for (const key of oldKeys) {
        const value = window[key as keyof typeof window];

        if (typeof value !== "function") continue;

        for (const key2 in window) {
          if (oldKeys.includes(key2)) continue;
          if (window[key2 as keyof typeof window] === value) found[key] = key2;
        }
      }

      return found;
    },
    getSkins: () => {
      return window.skinfx || "";
    },
  });

  // return some data from the script
  if (options.resolve) {
    const resolve = options.resolve;
    window.resolve = (data: string) => resolve(data);
  }

  const { open } = XMLHttpRequest.prototype;
  // @ts-ignore
  XMLHttpRequest.prototype.open = mirrorAttributes(function (this: XMLHttpRequest, method, url, ...args) {
    // console.trace(method, url);
    url = new URL(url, location.href).href;
    if (url.includes("generate-token")) {
      this.send = () =>
        (async () => {
          Object.defineProperty(this, "readyState", {
            value: 4,
          });
          Object.defineProperty(this, "statusText", {
            value: "OK",
          });
          Object.defineProperty(this, "status", {
            value: 200,
          });
          Object.defineProperty(this, "response", {
            value: await options.generateToken(),
          });
          setTimeout(() => {
            //@ts-ignore
            this.onload(new ProgressEvent("load"));
          });
        })();
    } else return Reflect.apply(open, this, [method, url, ...args]);
  }, open);

  hookContext(window, (context) => {
    const { newFunction } = options;

    if (newFunction) {
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
    }
  });

  console.log("im done hooking");
}
