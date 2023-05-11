import type { KruEnv } from "./electronker/kruEnv";

export default async function (kruEnv: KruEnv) {
  console.group("Test");

  try {
    /*const token = await (
      await fetch("https://matchmaker.krunker.io/generate-token")
    ).arrayBuffer();*/

    const token = new TextDecoder().decode(
      new Uint8Array([25, 30, 17, 17, 27, 16, 16, 29, 16, 24])
    );

    console.time("Hash");
    const hash = await kruEnv.hashToken(token);
    console.timeEnd("Hash");

    console.log("Hash:", new TextEncoder().encode(hash));

    // hash = hash.slice(0, 2) + "as" + hash.slice(4);

    const r = await fetch(
      `https://matchmaker.krunker.io/seek-game?${new URLSearchParams({
        hostname: "krunker.io",
        region: "us-nj",
        autoChangeGame: "false",
        validationToken: hash
          .split("")
          .map((e) => String.fromCharCode(e.charCodeAt(0) - 10))
          .join(""),
        // very subject to change:
        // dataQuery: JSON.stringify({ v: "dqk8nbmX7Juu0f4b62wtlwM6pw8ytLHG" }),
      })}`,
      {
        headers: {
          accept: "*/*",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en-US,en;q=0.6;",
          "cache-control": "no-cache",
          origin: "https://krunker.io",
          pragma: "no-cache",
          referer: "https://krunker.io/",
          "sec-ch-ua":
            '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
        },
      }
    );

    // 400 = no data query/the hash was already used
    console.log(
      "Response from seek-game:",
      r.status,
      await r.json().catch(() => Symbol("INVALID JSON"))
    );

    if (r.status == 520) throw new Error("Hash is poisoned");
  } finally {
    console.groupEnd();
  }
}
