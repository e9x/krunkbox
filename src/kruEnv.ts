import { headlessBrowser } from "./env";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import type { KruSource } from "~client/inject";

export default async function createKruEnv() {
  const browser = await puppeteer.launch({
    headless: headlessBrowser,
    devtools: !headlessBrowser,
  });

  // use new tab
  const [page] = await browser.pages();

  page.setRequestInterception(true);

  page.on("request", (req) => {
    const url = new URL(req.url());

    if (
      ["font", "image", "stylesheet"].includes(req.resourceType()) ||
      url.hostname !== "krunker.io"
    ) {
      req.abort();
      return;
    }
    req.continue();
  });

  await page.goto("https://krunker.io/", { waitUntil: "domcontentloaded" });

  // wait for devtools
  // await new Promise((r) => setTimeout(r, 1e3));

  const exports = await page.evaluateHandle(
    (preload) => {
      const module = {
        exports: {} as typeof import("~client/exports"),
      };

      function require() {
        throw new Error("Unsupported");
      }

      new Function(
        "module",
        "exports",
        "require",
        "__dirname",
        "__filename",
        "preload",
        "eval(preload)"
      )(module, module.exports, require, "", "", preload);

      return module.exports;
    },
    await readFile(new URL("./preload.js", import.meta.url), "utf-8")
  );

  return {
    collect: async () => {
      await page.close();
      await browser.close();
    },
    hashToken(token: string) {
      return exports.evaluate(
        (exports, token) => exports.hashToken(token),
        token
      );
    },
    source() {
      return exports.evaluate((exports) => exports.source());
    },
  } as KruEnv;
}

export interface KruEnv {
  collect(): Promise<void>;
  hashToken(token: string): Promise<string>;
  source(): Promise<KruSource>;
}
