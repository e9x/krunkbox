import { development } from "./env";
import { coreDir, skinsDir, loaderModuleJS, loaderWasmPath } from "./updateBin";
import { readFile, readdir } from "node:fs/promises";
import puppeteer from "puppeteer";
import type { KruSource, KruCount } from "~client/inject";

export default async function createKruEnv() {
  const coreDataBin = await Promise.all(
    (await readdir(coreDir)).map(
      async (file) => await readFile(new URL(file, coreDir))
    )
  );

  const skinsDataBin = await Promise.all(
    (await readdir(skinsDir)).map(
      async (file) => await readFile(new URL(file, skinsDir))
    )
  );
  const browser = await puppeteer.launch({
    headless: "new",
    devtools: development,
  });

  const page = await browser.newPage();

  page.setRequestInterception(true);

  page.on("request", async (req) => {
    const url = new URL(req.url());

    if (url.hostname !== "krunker.io") {
      console.trace(url.href);
      req.abort();
      return;
    }

    switch (url.pathname) {
      case "/":
        req.respond({
          body: Buffer.alloc(0),
          contentType: "text/html",
          status: 200,
        });
        break;
      case "/favicon.ico":
        req.abort();
        break;
      case "/loader.js":
        {
          // const spoofLoaderModuleJS = `file://${loaderModuleJS}`;
          const spoofLoaderModuleJS = "https://krunker.io/pkg/loader.mjs?t="; // should the build be here?
          const loaderModuleJSContent = await readFile(loaderModuleJS, "utf-8");

          const body =
            loaderModuleJSContent
              .replace(
                /import\.meta/g,
                `(${JSON.stringify({
                  url: spoofLoaderModuleJS,
                })})`
              )
              .replace(/export default/g, "esmExports.default = ") +
            "\n//# sourceURL=" +
            spoofLoaderModuleJS;

          req.respond({
            body: Buffer.from(body),
            contentType: "application/javascript",
          });
        }
        break;
      case "/loader.wasm":
        req.respond({
          body: await readFile(loaderWasmPath),
          contentType: "application/wasm",
        });
        break;
      case "/skin":
        req.respond({
          body: skinsDataBin[Number(url.searchParams.get("i"))],
          contentType: "application/octet-stream",
        });
        break;
      case "/core":
        req.respond({
          body: coreDataBin[Number(url.searchParams.get("i"))],
          contentType: "application/octet-stream",
        });
        break;
      default:
        console.trace(url);
        req.abort();
        break;
    }
  });

  await page.goto("https://krunker.io/", { waitUntil: "domcontentloaded" });

  // wait for devtools
  await new Promise((r) => setTimeout(r, 1e3));

  const exports = await page.evaluateHandle(
    (count, preload) => {
      const module = {
        // eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
        "count",
        "preload",
        "eval(preload)"
      )(module, module.exports, require, "", "", count, preload);

      return module.exports;
    },
    {
      coreDataBin: coreDataBin.length,
      skinsDataBin: skinsDataBin.length,
    } as KruCount,
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
