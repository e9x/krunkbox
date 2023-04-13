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

// TODO: use GM storage instead of localStorage
(() => {
  "use strict";

  async function main() {
    /**
     * @type {API|undefined}
     */
    let api;

    while (!api) {
      const apiToken = await getToken(workInkURL);

      if (!apiToken) return; // aborted

      try {
        api = new API(apiToken);
        if (!(await api.valid())) api = undefined;
      } catch (err) {
        // server error, try again in some
        console.log("Server error, trying again in 3s");
        await sleep(3e3);
      }
    }

    const token = await (
      await fetch("https://matchmaker.krunker.io/generate-token")
    ).arrayBuffer();

    /**
     * @type {string|undefined}
     */
    let hashed;

    while (!hashed) {
      const gotHashed = await api.hash(token);

      // this shouldn't happen
      if (gotHashed === APIError.BadToken) throw new Error("Bad token!");

      if (gotHashed === APIError.Early) {
        console.log("Too early, trying again in 3s");
        await sleep(3e3);
      }

      hashed = gotHashed;
    }

    const seekGame = await fetch(
      `https://matchmaker.krunker.io/seek-game?${new URLSearchParams({
        hostname: "krunker.io",
        region: "de-fra",
        autoChangeGame: "false",
        validationToken: hashed
          .split("")
          .map((c) => String.fromCharCode(c.charCodeAt(0) - 10))
          .join(""),
        dataQuery: JSON.stringify({ v: "5pliwbJakrvPpOnR5pA5V7dPpSeq8f28" }),
      })}`
    );

    console.log(
      "Response from seek-game:",
      seekGame.status,
      await seekGame.json().catch(() => Symbol("INVALID JSON"))
    );
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
    Early: 1,
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
   * @property {() => Promise<text>} text
   */

  /**
   *
   * @param {string} url
   * @param {GMFetchOptions} [opts]
   * @returns {Promise<GMFetchResponse>}
   */
  function gmFetch(url, opts) {
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
      const res = await gmFetch(new URL("hi", apiURL).toString(), {
        method: "POST",
        body: token,
        headers: {
          "content-type": "text/plain",
        },
      });

      console.log(res);

      if (res.status === 402) return WorkInkErrors.BadToken;
      if (res.status === 422) return WorkInkErrors.DuplicateToken;

      if (!res.ok) throw new Error("Unknown error");

      return await res.text();
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
      const res = await gmFetch(new URL("hash", apiURL).toString(), {
        method: "POST",
        body: token,
        headers: {
          "x-token": this.token,
          "content-type": "text/plain",
        },
      });

      if (res.status === 425) return APIError.Early;
      if (res.status === 402) return APIError.BadToken;

      // x-token should be available if eg fastify crashes
      // but if we don't get x-token, just don't change it
      this.token = res.headers.get("x-token") || this.token;

      if (!res.ok) throw new Error("Unknown error");

      return await res.text();
    }
    /**
     * Validates the token. Should be called before making any requests to Krunker's matchmaker
     */
    async valid() {
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

      if (!res.ok) throw new Error("Unknown error");

      this.token = await res.text();

      return true;
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
    let token = GM_getValue("token");

    while (!token) {
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
