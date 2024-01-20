import { dispatcher } from "./env";
import type { KruEnv } from "./kruEnv";
import { getGameSource } from "./sketchData";

export default async function testKru(kruEnv: KruEnv) {
  console.group("Test");

  try {
    const token = await (
      await fetch("https://matchmaker.krunker.io/generate-token", {
        dispatcher,
      })
    ).text();

    /*const token = new TextDecoder().decode(
      new Uint8Array([25, 30, 17, 17, 27, 16, 16, 29, 16, 24])
    );*/

    console.time("Hash");
    const hash = await kruEnv.hashToken(token);
    console.timeEnd("Hash");

    console.log("Hash:", new TextEncoder().encode(hash));

    // hash = hash.slice(0, 2) + "as" + hash.slice(4);

    const [, version] = getGameSource()?.match(/.exports="(.*?)"/) || [];

    if (!version) {
      console.error("Failure finding game version");
      return false;
    }

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
        dataQuery: JSON.stringify({ v: version }),
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
          "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Linux"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        dispatcher,
      }
    );

    // 400 = no data query/the hash was already used
    console.log(
      "Response from seek-game:",
      r.status,
      await r.json().catch(() => Symbol("INVALID JSON"))
    );

    if (r.status == 520) {
      console.error("Hash is poisoned");
      return false;
    }

    return true;
  } finally {
    console.groupEnd();
  }
}
