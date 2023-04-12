(async () => {
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
      const res = await fetch(new URL("hi", apiURL), {
        method: "POST",
        body: token,
        headers: {
          "content-type": "text/plain",
        },
      });

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
      if (value === undefined) {
        console.trace("Nuke token");
        delete localStorage.sample_token;
      } else localStorage.sample_token = value;
    }
    /**
     *
     * Hash a token
     * @param {string} token
     */
    async hash(token) {
      const res = await fetch(new URL("hash", apiURL), {
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
      console.log(
        "Got nmew token:",
        res.headers.get("x-token"),
        Object.fromEntries(res.headers)
      );
      this.token = res.headers.get("x-token") || this.token;

      if (!res.ok) throw new Error("Unknown error");

      return await res.text();
    }
    /**
     * Validates the token. Should be called before making any requests to Krunker's matchmaker
     */
    async valid() {
      const res = await fetch(new URL("me", apiURL), {
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
    let token = localStorage.sample_token;

    while (!token) {
      window.open(workInk, "_blank");
      const key = prompt("Enter access key here");
      // cancel
      if (key === undefined) return;
      const res = await API.processWorkInk(key);
      if (res === WorkInkErrors.BadToken) alert("Bad token. Try again.");
      else if (res === WorkInkErrors.DuplicateToken)
        alert("Token already used. Try again.");
      else token = res;
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

  /**
   * @type {API|undefined}
   */
  let api;

  while (!api)
    try {
      api = new API(await getToken(workInkURL));
      if (!(await api.valid())) api = undefined;
    } catch (err) {
      // server error, try again in some
      console.log("Server error, trying again in 3s");
      await sleep(3e3);
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
      region: "us-nj",
      autoChangeGame: "false",
      validationToken: hashed
        .split("")
        .map((argInstantPlease) =>
          String.fromCharCode(argInstantPlease.charCodeAt(0) - 10)
        )
        .join(""),
      dataQuery: JSON.stringify({ v: "dqk8nbmX7Juu0f4b62wtlwM6pw8ytLHG" }),
    })}`
  );

  console.log(
    "Response from seek-game:",
    seekGame.status,
    await seekGame.json().catch(() => Symbol("INVALID JSON"))
  );
})();
