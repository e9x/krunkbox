import "source-map-support/register.js";
import db from "./db";
import type { KruSource } from "./electronker/inject";
import type { KruEnv } from "./electronker/kruEnv";
import createKruEnv from "./electronker/kruEnv";
import { development, host, linkvertiseKey, port, skipUpdates } from "./env";
import {
  getGameSource,
  getGameSourceChecksum,
  getGameSkins,
  getSketchScript,
  getSketchVersion,
  sketchWatcher,
  getGameSkinsChecksum,
  getCompatibleChecksums,
  compatibleChecksumsWatcher,
  updateGameData,
} from "./sketchData.js";
import {
  gameSkinsPath,
  gameSourceDebugPath,
  gameSourcePath,
  userscriptName,
} from "./sketchDataPaths";
import testKru from "./test.js";
import {
  getImportantData,
  incrementToken,
  isTokenValid,
  rotateToken,
} from "./token";
import updateBin, { binDir } from "./updateBin";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import AsyncExitHook from "async-exit-hook";
import fastify from "fastify";
import Handlebars from "handlebars";
import { access, readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Piscina from "piscina";
import { SemVer } from "semver";

export interface ParseWorker extends Piscina {
  run(task: KruSource): Promise<void>;
}

const parse: ParseWorker = new Piscina({
  maxThreads: 1,
  filename: new URL("./parseWorker.js", import.meta.url).toString(),
});

async function parseGame(kruEnv: KruEnv) {
  await parse.run(await kruEnv.source());
  await updateGameData();
}

let didTest = false;
let testPassed = false;

async function updateContext() {
  if (skipUpdates) {
    console.log("DEBUG: Skipping updates");
    return;
  }

  let doTest = false;

  const updated = await updateBin();

  // prepare environment for testing and extracting the source
  const kruEnv = await createKruEnv();

  if (updated.core || updated.loader_js || updated.loader_wasm) {
    console.log("Game updated.");

    if (updated.core || updated.skins) {
      try {
        await unlink(gameSourceDebugPath);
        await unlink(gameSourcePath);
        await unlink(gameSkinsPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }

      try {
        await parseGame(kruEnv);
      } catch (err) {
        console.error(err);
        console.error("Failure parsing game.");
        await kruEnv.collect();
        return;
      }
    }

    doTest = true;
  } else {
    if (development) console.debug("Up to date.");
  }

  try {
    await access(gameSourceDebugPath);
    await access(gameSourcePath);
    await access(gameSkinsPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    // minify the source if we don't have it for some reason

    try {
      await parseGame(kruEnv);
    } catch (err) {
      console.error(err);
      console.error("Failure parsing game.");
      await kruEnv.collect();
      return;
    }

    doTest = true;
  }

  if (doTest) {
    testPassed = await testKru(kruEnv);
    didTest = true;
  } else {
    // we have to assume these values
    testPassed = true;
    didTest = true;
  }

  await kruEnv.collect();
}

updateContext();

setInterval(updateContext, 60e3 * 4);

const server = fastify({ logger: { level: "error" } });

server.register(fastifyStatic, {
  root: fileURLToPath(binDir),
  serve: false,
});

server.register(fastifyCors, {
  allowedHeaders: ["x-token", "content-type"],
  exposedHeaders: ["x-token"],
});

server.get(
  "/key/:key",
  {
    schema: {
      params: {
        type: "object",
        required: ["key"],
        properties: {
          key: { type: "string" },
        },
      },
    },
  },
  async (req, res) => {
    const redirectPage = Handlebars.compile(
      await readFile(
        new URL("../redirect.handlebars", import.meta.url),
        "utf-8"
      )
    );

    res.header("content-type", "text/html");

    res.send(
      "<!DOCTYPE html>" +
        redirectPage({
          accessKey: (req.params as { key: string }).key,
        })
    );
  }
);

server.get(
  "/redirect",
  {
    schema: {
      querystring: {
        type: "object",
        required: ["lv"],
        properties: {
          lv: { type: "string" },
        },
      },
    },
  },
  async (req, res) => {
    const data = getImportantData(req);

    const { lv } = req.query as { lv: string };

    if (lv !== linkvertiseKey) return res.status(400).send();

    // Search for an existing temp_access_token that's no older than 10 minutes
    // useragent and whether it's been used doesn't matter
    // prevent spam!
    const searchRes = await db.temp_access_tokens.findMany({
      where: {
        ip_address: data.ipAddress,
        created_at: {
          gte: new Date(Date.now() - 8 * 60 * 1000), // 8 minutes ago
        },
      },
      select: {
        value: true,
      },
    });

    // If a valid token exists, redirect to that
    if (searchRes.length === 1) {
      return res.redirect(307, `./key/${searchRes[0].value}`);
    }

    const insertRes = await db.temp_access_tokens.create({
      data: {
        ip_address: data.ipAddress,
        useragent: data.userAgent,
      },
      select: {
        value: true,
      },
    });

    if (!insertRes) {
      return res.status(500).send();
    }

    res.redirect(307, `./key/${insertRes.value}`);
  }
);

interface SketchVersion {
  outdated: boolean;
  latestVersion: string;
  updateURL: string;
}

function sketchUpdated(supportedGame?: string) {
  if (!supportedGame) return;

  if (!skipUpdates && didTest && !testPassed) return false;

  const gameSourceChecksum = getGameSourceChecksum();
  if (typeof gameSourceChecksum !== "string") return false;

  const compat = getCompatibleChecksums();

  if (
    gameSourceChecksum !== supportedGame &&
    (!compat ||
      !(supportedGame in compat) ||
      !compat[supportedGame].includes(gameSourceChecksum))
  )
    return false;

  return true;
}

server.post(
  "/sketchVersion",
  {
    schema: {
      body: {
        type: "object",
        required: ["currentVersion"],
        properties: {
          currentVersion: { type: "string" },
          currentGame: { type: "string" },
          supportedGame: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["outdated", "latestVersion", "updateURL"],
          properties: {
            outdated: { type: "boolean" },
            sketchUpdated: { type: "boolean" },
            latestVersion: { type: "string" },
            updateURL: { type: "string" },
          },
        },
      },
    },
  },
  (req, reply) => {
    const body = req.body as {
      currentVersion: string;
      // we should probably source the current game version from the userscript
      // no harm in trusting the client on this one though
      supportedGame?: string;
      currentGame?: string;
    };

    const sketchVersion = getSketchVersion();
    if (!sketchVersion) return reply.status(425).send();
    const reqVersion = new SemVer(body.currentVersion);
    const myVersion = new SemVer(sketchVersion);

    reply.send({
      outdated: reqVersion.compare(myVersion) === -1,
      latestVersion: sketchVersion,
      // test didn't pass = not updated
      sketchUpdated: sketchUpdated(body.supportedGame),
      // client will interpret as relative to API url
      updateURL: `${userscriptName}?${Date.now()}`,
    } as SketchVersion);
  }
);

server.get(`/${userscriptName}`, (req, reply) => {
  const sketchScript = getSketchScript();

  // we should just try again ON THE SERVER because we can't just show users 425...
  if (!sketchScript) return reply.status(404).send();

  reply.header(
    "content-disposition",
    `attachment; filename="${userscriptName}"`
  );

  reply.header("content-type", "application/javascript");
  return sketchScript;
});

server.get(
  "/source",
  {
    schema: {
      headers: {
        type: "object",
        required: ["x-token"],
        properties: {
          "x-token": { type: "string" },
        },
      },
    },
  },
  async (req, reply) => {
    const gameScript = getGameSource();

    if (!gameScript) return reply.status(404).send();

    const xToken = req.headers["x-token"] as string;

    if (!(await isTokenValid(xToken, getImportantData(req))))
      return reply.status(402).send();

    await incrementToken(xToken, getImportantData(req));

    const etag = `"${getGameSourceChecksum()}"`;

    reply.header("content-type", "application/javascript");
    reply.header("etag", etag);

    if (req.headers["if-none-match"] === etag) {
      reply.status(304);
      return;
    }

    return gameScript;
  }
);

server.get(
  "/skins",
  {
    schema: {
      headers: {
        type: "object",
        required: ["x-token"],
        properties: {
          "x-token": { type: "string" },
        },
      },
    },
  },
  async (req, reply) => {
    const gameSkins = getGameSkins();

    if (!gameSkins) return reply.status(404).send();

    const xToken = req.headers["x-token"] as string;

    if (!(await isTokenValid(xToken, getImportantData(req))))
      return reply.status(402).send();

    await incrementToken(xToken, getImportantData(req));

    const etag = `"${getGameSkinsChecksum()}"`;

    reply.header("content-type", "application/octet-stream");
    reply.header("etag", etag);

    if (req.headers["if-none-match"] === etag) {
      reply.status(304);
      return;
    }

    return gameSkins;
  }
);

server.get("/hi", async (req, reply) => {
  // todo: check if there's more than 2 temp tokens that are valid (eg within 10 minutes)
  // if so, 429
  const data = getImportantData(req);
  const result = await db.temp_tokens.create({
    data: {
      ip_address: data.ipAddress,
      useragent: data.userAgent,
    },
    select: {
      value: true,
    },
  });

  if (!result) throw new Error("Fatal error");

  const { value } = result;

  reply.send(value);
});

server.post(
  "/hi",
  {
    schema: {
      body: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: {
          type: "string",
        },
      },
    },
  },
  async (req, res) => {
    const tokens = req.body as [accessKey: string, tmpToken: string];
    const accessKey = tokens[0];
    const tmpToken = tokens[1];

    const lifetime = development && accessKey === "DEBUG";

    const data = getImportantData(req);

    if (!lifetime) {
      const updateTempTokens = await db.temp_tokens.updateMany({
        where: {
          value: tmpToken,
          ip_address: data.ipAddress,
          useragent: data.userAgent,
          done: false,
          created_at: {
            lt: new Date(Date.now() - 10 * 60 * 1000), // within 10 minutes old
            gt: new Date(Date.now() - 2 * 1000), // at least 2 seconds old
          },
        },
        data: {
          done: true,
        },
      });

      if (updateTempTokens.count !== 1) {
        return res.status(400).send();
      }

      const updateAccessTokens = await db.temp_access_tokens.updateMany({
        where: {
          value: accessKey,
          ip_address: data.ipAddress,
          done: false,
        },
        data: {
          done: true,
        },
      });

      if (updateAccessTokens.count !== 1) {
        return res.status(400).send();
      }
    }

    const { current_token } = await db.lv_token_data.create({
      data: {
        linkvertise_token: accessKey,
        ip_address: data.ipAddress,
        useragent: data.userAgent,
        lifetime,
      },
      select: {
        current_token: true,
      },
    });

    return current_token;
  }
);

// Validate the token
server.post(
  "/me",
  {
    schema: {
      body: {
        type: "string",
      },
    },
  },
  async (req, reply) => {
    if (!(await isTokenValid(req.body as string, getImportantData(req))))
      reply.status(402).send();

    const newToken = await rotateToken(
      req.body as string,
      getImportantData(req)
    );

    return reply.send(newToken);
  }
);

server.listen(
  {
    ...(host ? { host } : {}),
    port,
  },
  (err, url) => {
    if (err) {
      console.error(err);
      process.exit();
    }
    console.log("Live at", url);
  }
);

AsyncExitHook(async () => {
  await server.close();
  await compatibleChecksumsWatcher.close();
  await sketchWatcher.close();
});
