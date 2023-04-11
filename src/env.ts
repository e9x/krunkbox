/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-empty-function */

/**
 * Init object cannot contain any void fields to prevent Object property hooks...
 */
export interface InitData {
  coreDataBin: ArrayBuffer[];
  TextDecoder: typeof TextDecoder;
  WebAssembly: typeof WebAssembly;
  URL: typeof URL;
  console: typeof console;
  logs: boolean;
  fetch: typeof fetch;
  generateToken: () => Promise<ArrayBuffer> | ArrayBuffer;
  contentWindow: typeof window;
  // Hook new functions
  newFunction?: (args: string[]) => string[];
  resolve?: (data: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, no-var
declare var window: any;

export default async function setupWindow(initData: InitData) {
  Object.defineProperty(globalThis, "window", {
    configurable: false,
    value: globalThis,
  });

  const { WebAssembly, URL, console } = initData;

  class Response {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      console.log("New response", { body, init });
      throw new Error("Unsupported");
    }
    json() {
      return undefined;
    }
    arrayBuffer() {
      return new ArrayBuffer(0);
    }
    text() {
      return "";
    }
  }

  // return some data from the script
  if (initData.resolve) {
    const resolve = initData.resolve;
    window.resolve = (data: string) => resolve(data);
  }

  type Key =
    | "log"
    | "warn"
    | "error"
    | "trace"
    | "info"
    | "debug"
    | "time"
    | "timeEnd";

  const keys: Key[] = [
    "log",
    "warn",
    "error",
    "trace",
    "info",
    "debug",
    "time",
    "timeEnd",
  ];

  type FakeConsole = {
    [T in Key]: (typeof console)[T];
  };

  const fakeConsole = keys.reduce((fakeConsole, key) => {
    fakeConsole[key] = (...args: Parameters<(typeof console)[Key]>) => {
      try {
        console[key](...args);
      } catch (err) {
        console.error("Failure logging:", err);
      }
    };

    return fakeConsole;
  }, {} as Partial<FakeConsole>) as FakeConsole;

  function requestAnimationFrame() {
    return 0;
  }

  const location = {
    hostname: "krunker.io",
  };

  function tag(tag: string) {
    return function (c: { prototype: unknown }) {
      // Symbol.toStringTag is context dependant...?!
      Object.defineProperty(c.prototype, Symbol.toStringTag, {
        configurable: true,
        enumerable: false,
        value: tag,
        writable: false,
      });
    };
  }

  class XMLHttpRequest {
    #url?: string;
    setRequestHeader(name: string, value: string) {
      if (name !== "GET")
        throw new Error(`Unexpected header '${name}' with value '${value}'`);
    }
    async #send() {
      this.readyState = 4;
      this.statusText = "OK";
      this.status = 200;

      if (this.#url === "https://matchmaker.krunker.io/generate-token") {
        this.response = new Uint8Array(await initData.generateToken());
      } else {
        const splitID = Number(
          (this.#url?.match(/core.dat.split-(\d+)\?/) || [])[1]
        );

        if (isNaN(splitID))
          throw new Error(`Unrecognized XMLHttpRequest resource: ${this.#url}`);

        this.response = new Uint8Array(initData.coreDataBin[splitID]).buffer;
      }

      if (this.onload) this.onload();
    }
    readyState?: number;
    statusText?: string;
    status?: number;
    response?: ArrayBuffer;
    onload?: () => void;
    send() {
      this.#send();
    }
    open(method: string, url: string) {
      this.#url = url;
    }
  }

  @tag("WebSocket")
  class WebSocket {
    send() {}
  }

  @tag("CanvasRenderingContext2D")
  class CanvasRenderingContext2D {
    clearRect() {}
    scale() {}
    save() {}
    arcTo() {}
    fillText() {}
  }

  @tag("EventTarget")
  class EventTarget {
    addEventListener() {}
  }

  @tag("Node")
  class Node extends EventTarget {
    // InitData["contentWindow"]
    appendChild(node: Node) {
      this.append(node);
      return node;
    }
    append(...nodes: Node[]) {
      for (const node of nodes) {
        if (node instanceof HTMLIFrameElement) {
          contentWindows.set(node, initData.contentWindow);
          iframe = node;
          return node;
        }
      }
    }
    removeChild(node: Node) {
      // hack:
      if (node instanceof Element) node.remove();
      return node;
    }
  }

  @tag("Element")
  class Element extends Node {
    #id: string | undefined;
    get id() {
      return this.#id || "";
    }
    set id(value: string | undefined) {
      this.#id = value || "";
    }
    remove() {
      if (this instanceof HTMLIFrameElement) {
        iframe = undefined;
        contentWindows.delete(this);
      }
    }
    get innerHTML() {
      return "";
    }
  }

  @tag("HTMLElement")
  class HTMLElement extends Element {
    #style: Record<string, unknown> = {};
    get style() {
      return this.#style;
    }
    set style(value: Record<string, unknown>) {
      this.#style = value;
    }
  }

  const contentWindows = new WeakMap<HTMLIFrameElement, unknown>();

  @tag("HTMLIFrameElement")
  class HTMLIFrameElement extends HTMLElement {
    get contentWindow() {
      return contentWindows.get(this) ?? null;
    }
  }

  @tag("HTMLCanvasElement")
  class HTMLCanvasElement extends HTMLElement {
    context = new CanvasRenderingContext2D();
    getContext() {
      return this.context;
    }
  }

  @tag("HTMLDivElement")
  class HTMLDivElement extends HTMLElement {}

  let iframe: InstanceType<typeof HTMLIFrameElement> | undefined;

  @tag("HTMLHtmlElement")
  class HTMLHtmlElement extends HTMLElement {
    get version() {
      return "";
    }
  }

  @tag("Document")
  class Document {
    #documentElement = new HTMLHtmlElement();
    #body = new HTMLBodyElement();
    get documentElement() {
      return this.#documentElement;
    }
    get body() {
      return this.#body;
    }
    getElementById(id: string) {
      if (id === "loadingBg1")
        return {
          set innerHTML(html: string) {
            const [, id] = html.match(/id='(\w+)'/) || [];
            if (!id) throw new Error("Cannot find IFRAME ID");

            iframe = new HTMLIFrameElement();
            iframe.id = id;
            iframe.style.display = "none";
            document.body.appendChild(iframe);
          },
        };
      else if (id === iframe?.id) return iframe;
      else throw new Error(`Unrecognized ID ${id}`);
    }
    write() {}
    createElement(kind: string): InstanceType<typeof HTMLElement> {
      switch (kind) {
        case "iframe":
          return new HTMLIFrameElement();
        case "canvas":
          return new HTMLCanvasElement();
        case "div":
          return new HTMLDivElement();
        default:
          throw kind;
      }
    }
  }

  @tag("HTMLBodyElement")
  class HTMLBodyElement extends HTMLElement {}

  Object.defineProperty(HTMLBodyElement.prototype, Symbol.toStringTag, {
    configurable: true,
    enumerable: false,
    value: "HTMLBodyElement",
    writable: false,
  });

  @tag("HTMLDocument")
  class HTMLDocument extends Document {}

  const document = new HTMLDocument();

  const getFetch = () =>
    function fetch(input: RequestInfo | URL) {
      // can return literally anything and it will be passed to our patched instantiateStreaming
      if (String(input).includes("loader.wasm")) return Promise.resolve();
      throw new Error(`Unsupported request: ${input}`);
    };

  const fetch = getFetch();

  const localStorage = { logs: initData.logs };

  @tag("TextDecoder")
  class TextDecoder {
    #decoder: InstanceType<InitData["TextDecoder"]>;
    constructor(type: string) {
      this.#decoder = new initData.TextDecoder(type);
    }
    decode(data: Uint8Array) {
      return this.#decoder.decode(data);
    }
  }

  function setTimeout() {}

  window.fetch = fetch;
  window.console = fakeConsole;
  window.WebSocket = WebSocket;
  window.CanvasRenderingContext2D = CanvasRenderingContext2D;
  window.location = location;
  window.document = document;
  window.localStorage = localStorage;
  window.requestAnimationFrame = requestAnimationFrame;
  window.Node = Node;
  window.Element = Element;
  window.HTMLElement = HTMLElement;
  window.HTMLBodyElement = HTMLBodyElement;
  window.HTMLIFrameElement = HTMLIFrameElement;
  window.HTMLCanvasElement = HTMLCanvasElement;
  window.HTMLDivElement = HTMLDivElement;
  window.XMLHttpRequest = XMLHttpRequest;
  window.TextDecoder = TextDecoder;
  window.WebAssembly = WebAssembly;
  window.URL = URL;
  window.Response = Response;
  window.setTimeout = setTimeout;

  Object.defineProperty(Object.prototype, "Context", {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    set(value) {},
    configurable: false,
    enumerable: false,
  });

  initData.contentWindow.Node = Node;
  initData.contentWindow.Element = Element;
  initData.contentWindow.HTMLBodyElement = HTMLBodyElement;
  initData.contentWindow.HTMLCanvasElement = HTMLCanvasElement;
  initData.contentWindow.TextDecoder = TextDecoder;
  initData.contentWindow.Response = Response;
  initData.contentWindow.fetch = getFetch();

  const functionStrings = new WeakMap<Function, string>();

  const mirrorAttributes = <From extends Function, To extends Function>(
    from: From,
    to: To
  ): To => {
    functionStrings.set(to, from.toString());

    Reflect.defineProperty(to, "length", {
      configurable: true,
      enumerable: false,
      value: from.length,
      writable: false,
    });

    Reflect.defineProperty(to, "name", {
      configurable: true,
      enumerable: false,
      value: from.name,
      writable: false,
    });

    return to;
  };

  function hookContext(context: typeof globalThis) {
    const oldToString = context.Function.prototype.toString;
    const oldFunction = context.Function;

    function toString(this: Function) {
      const spoofedString = functionStrings.get(this);

      if (spoofedString) return spoofedString;

      const toString = oldToString.call(this);

      return toString;
    }

    Object.setPrototypeOf(toString, context.Function.prototype);

    function Function(...args: string[]) {
      if (initData.newFunction) args = initData.newFunction(args);
      if (new.target) return new oldFunction(...args);
      else return oldFunction(...args);
    }

    mirrorAttributes(oldFunction, Function);

    Function.prototype = oldFunction.prototype;

    Reflect.defineProperty(context.Function.prototype, "constructor", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: Function,
    });

    Object.setPrototypeOf(Function, oldFunction.prototype);

    Object.setPrototypeOf(toString, oldFunction.prototype);

    mirrorAttributes(oldToString, toString);

    context.Function = Function as typeof globalThis.Function;
    context.Function.prototype.toString = toString;
  }

  functionStrings.set(
    Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      "contentWindow"
    )!.get!,
    "function get contentWindow() { [native code] }"
  );

  // console.log(Function.prototype.toString.toString());
  hookContext(window);
  hookContext(initData.contentWindow);
  // console.log(Function.prototype.toString.toString());

  return {
    getRenamed: () => {
      const found = new Map<string, string>();

      for (const key in window)
        if (window[key] === setTimeout && key !== "setTimeout")
          found.set("setTimeout", key);
        else if (
          window[key] === requestAnimationFrame &&
          key !== "requestAnimationFrame"
        )
          found.set("requestAnimationFrame", key);

      return found;
    },
  };
}
