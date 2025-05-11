import { headlessBrowser } from "./env";
import { readFile } from "node:fs/promises";
import puppeteer, { type Page, type Browser, HandleFor } from "puppeteer";
import type { KruSource } from "~client/inject";

export default async function createKruEnv() {
  let browser: Browser | undefined = await puppeteer.launch({
    headless: headlessBrowser,
    devtools: !headlessBrowser,
    browser: "firefox",
    // just made $100k off chromium command line switches 🤑
    args: [
      "--no-sandbox",
      "--blink-settings=imagesEnabled=false",
      "--mute-audio",
      "--disable-gpu",
    ],
  });

  // use new tab
  const [page] = await browser.pages();

  page.setRequestInterception(true);

  page.on("request", async (req) => {
    const url = new URL(req.url());

    if (
      // ["font", "image", "stylesheet"].includes(req.resourceType()) ||
      !["krunker.io", "matchmaker.krunker.io"].includes(url.hostname) &&
      !/^.*?(?:\/|\.m?js|\.wasm|\.jspck|core.dat.*?)(?:\?.*?)?$/.test(url.href)
    ) {
      console.log("Blocking", url.href);
      req.abort();
      return;
    }

    // 91.107.140.0

    // const res = await fetch(url);

    // req.respond({
    //   body: Buffer.from(await res.arrayBuffer()),
    //   contentType: res.headers.get("content-type") || "",
    //   status: res.status,
    //   headers: {
    //     "Access-Control-Allow-Origin": "*",
    //   },
    // });
    req.continue();
  });

  await page.goto("https://krunker.io/", {
    //waitUntil: "domcontentloaded",
    waitUntil: "load",
    timeout: 0,
  });

  // wait for devtools
  // await new Promise((r) => setTimeout(r, 1e3));

  let preload: HandleFor<typeof import("~client/exports")> | undefined =
    await page.evaluateHandle(
      (preload: string) => {
        const module = {
          exports: {} as typeof import("~client/exports"),
        };

        const world = {
          module,
          exports: module.exports,
          require() {
            throw new Error("unsupported");
          },
          __dirname: "",
          __filename: "",
          preload,
        };

        new Function(...Object.keys(world), "eval(preload)")(
          ...Object.values(world)
        );

        return module.exports;
      },
      await readFile(new URL("./preload.js", import.meta.url), "utf-8")
    );

  return {
    collect: async () => {
      if (!browser) throw new Error("collected");
      await browser.close();
      browser = undefined;
      preload = undefined;
    },
    hashToken(token: string) {
      if (!preload) throw new Error("collected");
      return preload.evaluate(
        (preload, token) => preload.hashToken(token),
        token
      );
    },
    source() {
      if (!preload) throw new Error("collected");
      return preload.evaluate((preload) => preload.source());
    },
  } as KruEnv;
}

export interface KruEnv {
  collect(): Promise<void>;
  hashToken(token: string): Promise<string>;
  source(): Promise<KruSource>;
}
