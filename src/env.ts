/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-empty-function */
export type HashedData = number[];

/**
 * Init object cannot contain any void fields to prevent Object property hooks...
 */
export interface InitData {
  coreDataBin: ArrayBuffer[];
  performanceNow: () => number;
  TextDecoder: typeof TextDecoder;
  WebAssembly: typeof WebAssembly;
  URL: typeof URL;
  console: typeof console;
  logs: boolean;
  fetch: typeof fetch;
  generateToken: () => Promise<ArrayBuffer> | ArrayBuffer;
  contentWindow: any;
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

  class Request {}

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
    return function (c: { prototype: any }) {
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
    /*addEventListener(event: any, callback: (arg0: {}) => void, opts: any) {
      console.log(this, { event, callback, opts });
    }*/
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
    #style: Record<string, any> = {};
    get style() {
      return this.#style;
    }
    set style(value: Record<string, any>) {
      this.#style = value;
    }
  }

  const contentWindows = new WeakMap<HTMLIFrameElement, any>();

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

  const performance = {
    now() {
      return initData.performanceNow();
    },
  };

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
  window.performance = performance;
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
  window.Request = Request;
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
  initData.contentWindow.Request = Request;
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

  const hookContext = (context: typeof globalThis, id: string) => {
    const oldToString = context.Function.prototype.toString;
    const oldFunction = context.Function;

    function toString(this: Function) {
      const spoofedString = functionStrings.get(this);

      if (spoofedString) return spoofedString;

      const toString = oldToString.call(this);

      /*if (
        !toString.includes("[native code]") &&
        !toString.includes("methodCaller")
      )
        console.error(toString);*/

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

    Object.defineProperty(toString, Symbol.toStringTag, {
      configurable: true,
      enumerable: false,
      value: `toString (${id})`,
      writable: false,
    });

    mirrorAttributes(oldToString, toString);

    context.Function = Function as typeof globalThis.Function;
    context.Function.prototype.toString = toString;

    const oldOwnKeys = context.Reflect.ownKeys;

    function ownKeys(target: object) {
      const keys = oldOwnKeys(target);

      if (target === document.documentElement)
        // prettier-ignore
        return [];
      if (target === document)
        // prettier-ignore
        return ["location"];
      if (target === HTMLHtmlElement.prototype)
        // prettier-ignore
        return ["version", "constructor", Symbol.toStringTag];
      else if (target === HTMLDocument.prototype)
        // prettier-ignore
        return ["constructor", Symbol.toStringTag];
      else if (target === HTMLElement.prototype)
        // prettier-ignore
        return ["title", "lang", "translate", "dir", "hidden", "accessKey", "draggable", "spellcheck", "autocapitalize", "contentEditable", "enterKeyHint", "isContentEditable", "inputMode", "virtualKeyboardPolicy", "offsetParent", "offsetTop", "offsetLeft", "offsetWidth", "offsetHeight", "innerText", "outerText", "onbeforexrselect", "onabort", "onbeforeinput", "onblur", "oncancel", "oncanplay", "oncanplaythrough", "onchange", "onclick", "onclose", "oncontextlost", "oncontextmenu", "oncontextrestored", "oncuechange", "ondblclick", "ondrag", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondragstart", "ondrop", "ondurationchange", "onemptied", "onended", "onerror", "onfocus", "onformdata", "oninput", "oninvalid", "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata", "onloadedmetadata", "onloadstart", "onmousedown", "onmouseenter", "onmouseleave", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onmousewheel", "onpause", "onplay", "onplaying", "onprogress", "onratechange", "onreset", "onresize", "onscroll", "onsecuritypolicyviolation", "onseeked", "onseeking", "onselect", "onslotchange", "onstalled", "onsubmit", "onsuspend", "ontimeupdate", "ontoggle", "onvolumechange", "onwaiting", "onwebkitanimationend", "onwebkitanimationiteration", "onwebkitanimationstart", "onwebkittransitionend", "onwheel", "onauxclick", "ongotpointercapture", "onlostpointercapture", "onpointerdown", "onpointermove", "onpointerrawupdate", "onpointerup", "onpointercancel", "onpointerover", "onpointerout", "onpointerenter", "onpointerleave", "onselectstart", "onselectionchange", "onanimationend", "onanimationiteration", "onanimationstart", "ontransitionrun", "ontransitionstart", "ontransitionend", "ontransitioncancel", "oncopy", "oncut", "onpaste", "dataset", "nonce", "autofocus", "tabIndex", "style", "attributeStyleMap", "attachInternals", "blur", "click", "focus", "inert", "oncontentvisibilityautostatechange", "constructor", "onbeforematch", Symbol.toStringTag];
      else if (target === Node.prototype)
        // prettier-ignore
        return ["nodeType", "nodeName", "baseURI", "isConnected", "ownerDocument", "parentNode", "parentElement", "childNodes", "firstChild", "lastChild", "previousSibling", "nextSibling", "nodeValue", "textContent", "ELEMENT_NODE", "ATTRIBUTE_NODE", "TEXT_NODE", "CDATA_SECTION_NODE", "ENTITY_REFERENCE_NODE", "ENTITY_NODE", "PROCESSING_INSTRUCTION_NODE", "COMMENT_NODE", "DOCUMENT_NODE", "DOCUMENT_TYPE_NODE", "DOCUMENT_FRAGMENT_NODE", "NOTATION_NODE", "DOCUMENT_POSITION_DISCONNECTED", "DOCUMENT_POSITION_PRECEDING", "DOCUMENT_POSITION_FOLLOWING", "DOCUMENT_POSITION_CONTAINS", "DOCUMENT_POSITION_CONTAINED_BY", "DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC", "appendChild", "cloneNode", "compareDocumentPosition", "contains", "getRootNode", "hasChildNodes", "insertBefore", "isDefaultNamespace", "isEqualNode", "isSameNode", "lookupNamespaceURI", "lookupPrefix", "normalize", "removeChild", "replaceChild", "constructor", Symbol.toStringTag];
      else if (target === EventTarget.prototype)
        // prettier-ignore
        return ["addEventListener", "dispatchEvent", "removeEventListener", "constructor", Symbol.toStringTag];
      else if (target === Document.prototype)
        // prettier-ignore
        return ["implementation", "URL", "documentURI", "compatMode", "characterSet", "charset", "inputEncoding", "contentType", "doctype", "documentElement", "xmlEncoding", "xmlVersion", "xmlStandalone", "domain", "referrer", "cookie", "lastModified", "readyState", "title", "dir", "body", "head", "images", "embeds", "plugins", "links", "forms", "scripts", "currentScript", "defaultView", "designMode", "onreadystatechange", "anchors", "applets", "fgColor", "linkColor", "vlinkColor", "alinkColor", "bgColor", "all", "scrollingElement", "onpointerlockchange", "onpointerlockerror", "hidden", "visibilityState", "wasDiscarded", "featurePolicy", "webkitVisibilityState", "webkitHidden", "onbeforecopy", "onbeforecut", "onbeforepaste", "onfreeze", "onresume", "onsearch", "onvisibilitychange", "fullscreenEnabled", "fullscreen", "onfullscreenchange", "onfullscreenerror", "webkitIsFullScreen", "webkitCurrentFullScreenElement", "webkitFullscreenEnabled", "webkitFullscreenElement", "onwebkitfullscreenchange", "onwebkitfullscreenerror", "rootElement", "pictureInPictureEnabled", "pictureInPictureElement", "onbeforexrselect", "onabort", "onbeforeinput", "onblur", "oncancel", "oncanplay", "oncanplaythrough", "onchange", "onclick", "onclose", "oncontextlost", "oncontextmenu", "oncontextrestored", "oncuechange", "ondblclick", "ondrag", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondragstart", "ondrop", "ondurationchange", "onemptied", "onended", "onerror", "onfocus", "onformdata", "oninput", "oninvalid", "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata", "onloadedmetadata", "onloadstart", "onmousedown", "onmouseenter", "onmouseleave", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onmousewheel", "onpause", "onplay", "onplaying", "onprogress", "onratechange", "onreset", "onresize", "onscroll", "onsecuritypolicyviolation", "onseeked", "onseeking", "onselect", "onslotchange", "onstalled", "onsubmit", "onsuspend", "ontimeupdate", "ontoggle", "onvolumechange", "onwaiting", "onwebkitanimationend", "onwebkitanimationiteration", "onwebkitanimationstart", "onwebkittransitionend", "onwheel", "onauxclick", "ongotpointercapture", "onlostpointercapture", "onpointerdown", "onpointermove", "onpointerrawupdate", "onpointerup", "onpointercancel", "onpointerover", "onpointerout", "onpointerenter", "onpointerleave", "onselectstart", "onselectionchange", "onanimationend", "onanimationiteration", "onanimationstart", "ontransitionrun", "ontransitionstart", "ontransitionend", "ontransitioncancel", "oncopy", "oncut", "onpaste", "children", "firstElementChild", "lastElementChild", "childElementCount", "activeElement", "styleSheets", "pointerLockElement", "fullscreenElement", "adoptedStyleSheets", "fonts", "adoptNode", "append", "captureEvents", "caretRangeFromPoint", "clear", "close", "createAttribute", "createAttributeNS", "createCDATASection", "createComment", "createDocumentFragment", "createElement", "createElementNS", "createEvent", "createExpression", "createNSResolver", "createNodeIterator", "createProcessingInstruction", "createRange", "createTextNode", "createTreeWalker", "elementFromPoint", "elementsFromPoint", "evaluate", "execCommand", "exitFullscreen", "exitPictureInPicture", "exitPointerLock", "getElementById", "getElementsByClassName", "getElementsByName", "getElementsByTagName", "getElementsByTagNameNS", "getSelection", "hasFocus", "importNode", "open", "prepend", "queryCommandEnabled", "queryCommandIndeterm", "queryCommandState", "queryCommandSupported", "queryCommandValue", "querySelector", "querySelectorAll", "releaseEvents", "replaceChildren", "webkitCancelFullScreen", "webkitExitFullscreen", "write", "writeln", "constructor", "prerendering", "onprerenderingchange", "fragmentDirective", "onbeforematch", "timeline", "oncontentvisibilityautostatechange", "getAnimations", "startViewTransition", Symbol.toStringTag, Symbol.unscopables];
      else if (target === Element.prototype)
        // prettier-ignore
        return ["namespaceURI", "prefix", "localName", "tagName", "id", "className", "classList", "slot", "attributes", "shadowRoot", "part", "assignedSlot", "innerHTML", "outerHTML", "scrollTop", "scrollLeft", "scrollWidth", "scrollHeight", "clientTop", "clientLeft", "clientWidth", "clientHeight", "onbeforecopy", "onbeforecut", "onbeforepaste", "onsearch", "elementTiming", "onfullscreenchange", "onfullscreenerror", "onwebkitfullscreenchange", "onwebkitfullscreenerror", "role", "ariaAtomic", "ariaAutoComplete", "ariaBusy", "ariaBrailleLabel", "ariaBrailleRoleDescription", "ariaChecked", "ariaColCount", "ariaColIndex", "ariaColSpan", "ariaCurrent", "ariaDescription", "ariaDisabled", "ariaExpanded", "ariaHasPopup", "ariaHidden", "ariaInvalid", "ariaKeyShortcuts", "ariaLabel", "ariaLevel", "ariaLive", "ariaModal", "ariaMultiLine", "ariaMultiSelectable", "ariaOrientation", "ariaPlaceholder", "ariaPosInSet", "ariaPressed", "ariaReadOnly", "ariaRelevant", "ariaRequired", "ariaRoleDescription", "ariaRowCount", "ariaRowIndex", "ariaRowSpan", "ariaSelected", "ariaSetSize", "ariaSort", "ariaValueMax", "ariaValueMin", "ariaValueNow", "ariaValueText", "children", "firstElementChild", "lastElementChild", "childElementCount", "previousElementSibling", "nextElementSibling", "after", "animate", "append", "attachShadow", "before", "closest", "computedStyleMap", "getAttribute", "getAttributeNS", "getAttributeNames", "getAttributeNode", "getAttributeNodeNS", "getBoundingClientRect", "getClientRects", "getElementsByClassName", "getElementsByTagName", "getElementsByTagNameNS", "getInnerHTML", "hasAttribute", "hasAttributeNS", "hasAttributes", "hasPointerCapture", "insertAdjacentElement", "insertAdjacentHTML", "insertAdjacentText", "matches", "prepend", "querySelector", "querySelectorAll", "releasePointerCapture", "remove", "removeAttribute", "removeAttributeNS", "removeAttributeNode", "replaceChildren", "replaceWith", "requestFullscreen", "requestPointerLock", "scroll", "scrollBy", "scrollIntoView", "scrollIntoViewIfNeeded", "scrollTo", "setAttribute", "setAttributeNS", "setAttributeNode", "setAttributeNodeNS", "setPointerCapture", "toggleAttribute", "webkitMatchesSelector", "webkitRequestFullScreen", "webkitRequestFullscreen", "checkVisibility", "getAnimations", "constructor", "setHTML", Symbol.toStringTag, Symbol.unscopables];

      /*let canNew = false;

      try {
        new target();
        canNew = true;
      } catch (err) {}

      console.log(
        "ownKeys:",
        target,
        keys,
        "proto of target:",
        Reflect.getPrototypeOf(target),
        { canNew },
        target === document.documentElement
      );*/

      return keys;
    }

    context.Reflect.ownKeys = ownKeys;
    Object.setPrototypeOf(ownKeys, context.Function.prototype);
    mirrorAttributes(ownKeys, oldOwnKeys);
  };

  functionStrings.set(window.fetch, "function fetch() { [native code] }");
  functionStrings.set(
    initData.contentWindow.fetch,
    "function fetch() { [native code] }"
  );

  functionStrings.set(
    Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      "contentWindow"
    )!.get!,
    "function get contentWindow() { [native code] }"
  );

  functionStrings.set(
    Node.prototype.appendChild,
    "function appendChild() { [native code] }"
  );

  functionStrings.set(
    HTMLCanvasElement.prototype.getContext,
    "function getContext() { [native code] }"
  );

  functionStrings.set(
    TextDecoder.prototype.decode,
    "function decode() { [native code] }"
  );

  functionStrings.set(
    Response.prototype.arrayBuffer,
    "function arrayBuffer() { [native code] }"
  );

  functionStrings.set(
    Response.prototype.text,
    "function text() { [native code] }"
  );

  functionStrings.set(
    EventTarget.prototype.addEventListener,
    "function addEventListener() { [native code] }"
  );

  functionStrings.set(
    Response.prototype.json,
    "function json() { [native code] }"
  );

  // console.log(Function.prototype.toString.toString());
  hookContext(window, "main");
  hookContext(initData.contentWindow, "contentWindow");
  // console.log(Function.prototype.toString.toString());
}
