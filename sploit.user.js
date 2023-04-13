// ==UserScript==
// @name         Sploit
// @namespace    https://sys32.dev/
// @version      2.0.0-alpha
// @description  try to take over the world!
// @author       You
// @match        https://krunker.io/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=krunker.io
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      imsoware.sys32.dev
// @connect      [::1]
// @run-at       document-start
// ==/UserScript==

/* eslint-env es6 */
/* eslint: eslint:recommended */
/* globals GM_xmlhttpRequest, GM_deleteValue, GM_getValue, GM_setValue, GM_openInTab */
/* eslint-disable no-constant-condition */

// TODO: use GM storage instead of localStorage
(() => {
  "use strict";

  function main() {
    const gamePromise = getGame();

    waitForGameLoad().then(() => {
      gamePromise.then((load) => {
        load();
      });
    });
  }

  async function getGame() {
    /**
     * @type {API|undefined}
     */
    let api;

    const savedToken = GM_getValue("token");

    if (savedToken) api = new API(savedToken);

    while (!api) {
      const apiToken = await getToken(workInkURL);

      if (!apiToken) return; // aborted

      api = new API(apiToken);
      if (!(await api.valid())) {
        console.log("API was invalid when using", apiToken);
        api = undefined;
      }
    }

    const [token, source] = await Promise.all([
      fetchToken(api),
      api.source(api),
    ]);

    if (token === APIError.BadToken || source === APIError.BadToken)
      throw new Error("Bad token!");

    const dataArg = "_" + Math.random().toString(36).slice(2);

    try {
      const { src, data } = hook(dataArg, source);

      /**
       * @type {(WP_MMToken: string, dataArg: typeof data) => void}
       */
      const game = new Function("WP_MMToken", dataArg, src);

      return () => game(token, data);
    } catch (err) {
      console.error("Failure loading...", { source });
      throw err;
    }
  }

  /**
   *
   * @param {string} dataArg
   * @param {string} src
   * @returns
   */
  function hook(dataArg, src) {
    // hook __webpack_require__, specifically the part where it returns module.exports and when it's generating the exports, not caching it
    // the hook is ran once per module
    src = src.replace(
      /,(\w+)\.l=!!\[],\1\.exports}/,
      (match, module) => `,${module}.l=true,${dataArg}(${module})}`
    );

    return {
      data: (module) => {
        console.log(module);
        return module.exports;
      },
      src,
    };
  }

  /**
   *
   * @param {API} api
   */
  async function fetchToken(api) {
    const token = await (
      await fetch("https://matchmaker.krunker.io/generate-token")
    ).arrayBuffer();

    return await api.hash(token);
  }

  /**
   *
   * @returns {Promise<void>}
   */
  function waitForGameLoad() {
    return new Promise((resolve) => {
      var observer = new MutationObserver((mutations, observer) => {
        for (let mutation of mutations) {
          for (let node of mutation.addedNodes) {
            if (
              node.tagName == "SCRIPT" &&
              node.textContent.includes("Yendis Entertainment")
            ) {
              console.info("Got the WASM loader script:", node);

              // Clear the script's textContent to prevent loading.
              node.textContent = "";

              console.info("WASM loader removed");

              // Resolve the promise to indicate the game is ready to load.
              resolve();

              // The observer no longer needs to check for new elements because the WASM loading has been stopped.
              observer.disconnect();
            }
          }
        }
      });

      observer.observe(document, {
        childList: true,
        subtree: true,
      });
    });
  }

  const apiURL = "http://[::1]:3001/";
  const workInkURL = "https://work.ink/4lH/krunker";

  /**
   * @readonly
   * @enum {number}
   */
  const WorkInkErrors = {
    BadToken: 0,
    DuplicateToken: 1,
  };

  /**
   * @readonly
   * @enum {number}
   */
  const APIError = {
    BadToken: 0,
  };

  /**
   * @typedef {Object} GMFetchOptions
   * @property {string} [method]
   * @property {string} [body]
   * @property {Record<string, string>} [headers]
   */

  /**
   * @typedef {Object} GMFetchResponse
   * @property {number} status
   * @property {string} statusText
   * @property {boolean} ok
   * @property {Headers} headers
   * @property {() => Promise<string>} text
   */

  /**
   *
   * @param {string} url
   * @param {GMFetchOptions} [opts]
   * @returns {Promise<GMFetchResponse>}
   */
  function gmFetch(url, opts = {}) {
    // return fetch(url, opts);
    return new Promise((resolve, reject) =>
      GM_xmlhttpRequest({
        url,
        method: opts.method,
        data: opts.body,
        headers: opts.headers,
        onerror: (e) => reject(e.error),
        onload: (res) =>
          resolve({
            status: res.status,
            statusText: res.statusText,
            ok: res.status >= 200 && res.status < 300,
            text: () => Promise.resolve(res.responseText),
            headers: res.responseHeaders
              .split("\r\n")
              .filter(Boolean) // empty lines
              .reduce((headers, line) => {
                const [name, ...value] = line.split(": ");
                headers.set(name, value.join(": "));
                return headers;
              }, new Headers()),
          }),
      })
    );
  }

  class API {
    /**
     * @type {string|undefined}
     */
    #token;

    /**
     *
     * @param {string} token
     */
    static async processWorkInk(token) {
      while (true) {
        const res = await gmFetch(new URL("hi", apiURL).toString(), {
          method: "POST",
          body: token,
          headers: {
            "content-type": "text/plain",
          },
        });

        if (res.status === 402) return WorkInkErrors.BadToken;
        if (res.status === 422) return WorkInkErrors.DuplicateToken;

        if (!res.ok) {
          // server error, try again in some
          console.log("Server error, trying again in 3s");
          await sleep(3e3);
          continue;
        }

        return await res.text();
      }
    }
    /**
     *
     * @param {string} token
     */
    constructor(token) {
      this.token = token;
    }
    get token() {
      if (!this.#token) throw new Error("No token available");
      return this.#token;
    }
    set token(value) {
      this.#token = value;
      if (value === undefined) GM_deleteValue("token");
      else GM_setValue("token", value);
    }
    /**
     *
     * Hash a token
     * @param {string} token
     */
    async hash(token) {
      while (true) {
        const res = await gmFetch(new URL("hash", apiURL).toString(), {
          method: "POST",
          body: token,
          headers: {
            "x-token": this.token,
            "content-type": "text/plain",
          },
        });

        if (res.status === 425) {
          console.log("Too early, trying again in 3s");
          await sleep(3e3);
          continue;
        }

        if (res.status === 402) return APIError.BadToken;

        // x-token should be available if eg fastify crashes
        // but if we don't get x-token, just don't change it
        this.token = res.headers.get("x-token") || this.token;

        if (!res.ok) throw new Error("Unknown error");

        return await res.text();
      }
    }
    /**
     * Validates the token. Should be called before making any requests to Krunker's matchmaker
     */
    async valid() {
      while (true) {
        const res = await gmFetch(new URL("me", apiURL), {
          method: "POST",
          body: this.token,
          headers: {
            "content-type": "text/plain",
          },
        });

        if (res.status === 402) {
          this.token = undefined;
          return false;
        }

        if (!res.ok) {
          // server error, try again in some
          console.log("Server error, trying again in 3s");
          await sleep(3e3);
          continue;
        }

        this.token = await res.text();

        return true;
      }
    }
    async source() {
      while (true) {
        const res = await gmFetch(new URL("source", apiURL));

        // has not been minified/processed yet
        if (res.status === 404) {
          console.log("Too early, trying again in 3s");
          await sleep(3e3);
          continue;
        }

        if (!res.ok) {
          // server error, try again in some
          console.log("Server error, trying again in 3s");
          await sleep(3e3);
          continue;
        }

        return await res.text();
      }
    }
  }

  /**
   *
   * @param {string} workInk
   */
  async function getToken(workInk) {
    /**
     * @type {string|undefined}
     */
    let token;

    while (!token) {
      console.log("hbecause thius is retarded heres the token", { token });
      GM_openInTab(workInk);
      console.trace("Prompt for access key...");
      const key = prompt("Enter access key here");
      // cancel
      if (key === undefined) return;
      const res = await API.processWorkInk(key);
      if (res === WorkInkErrors.BadToken) alert("Bad token. Try again.");
      else if (res === WorkInkErrors.DuplicateToken)
        alert("Token already used. Try again.");
      else {
        console.log("Got token:", res);
        token = res;
        break;
      }
    }

    return token;
  }

  /**
   *
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(() => resolve(), ms));
  }

  main();
})();
