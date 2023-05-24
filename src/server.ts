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
  gameSourceWatcher,
  gameSkinsWatcher,
  sketchWatcher,
  getGameSkinsChecksum,
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
    console.log("Up to date.");
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

setInterval(updateContext, 60e3 * 30);

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
    const searchRes = await db.query<{ value: string }>(
      "SELECT value FROM temp_access_tokens WHERE ip_address = $1 AND created_at >= NOW() - INTERVAL '8 minutes';",
      [data.ipAddress]
    );

    // If a valid token exists, redirect to that
    if (searchRes.rowCount === 1)
      return res.redirect(307, `./key/${searchRes.rows[0].value}`);

    const insertRes = await db.query<{ value: string }>(
      "INSERT INTO temp_access_tokens (ip_address, useragent) VALUES ($1, $2) RETURNING value;",
      [data.ipAddress, data.userAgent]
    );

    if (insertRes.rowCount !== 1) return res.status(500).send();

    res.redirect(307, `./key/${insertRes.rows[0].value}`);
  }
);

interface SketchVersion {
  outdated: boolean;
  latestVersion: string;
  updateURL: string;
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

    const gameSourceChecksum = getGameSourceChecksum();
    if (gameSourceChecksum === undefined) return reply.status(425).send();
    const sketchVersion = getSketchVersion();
    if (!sketchVersion) return reply.status(425).send();
    const reqVersion = new SemVer(body.currentVersion);
    const myVersion = new SemVer(sketchVersion);

    reply.send({
      outdated: reqVersion.compare(myVersion) === -1,
      latestVersion: sketchVersion,
      // test didn't pass = not updated
      sketchUpdated:
        skipUpdates || !didTest || testPassed
          ? gameSourceChecksum === null
            ? false
            : gameSourceChecksum === body.supportedGame
          : false,
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
  const result = await db.query<{ value: string }>(
    "INSERT INTO temp_tokens (ip_address, useragent) VALUES ($1, $2) RETURNING value;",
    [data.ipAddress, data.userAgent]
  );

  if (result.rowCount !== 1) throw new Error("Fatal error");

  const { value } = result.rows[0];

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
      const result = await db.query<{
        value: string;
      }>(
        `UPDATE temp_tokens SET done = TRUE
WHERE
    value = $1
    AND ip_address = $2
    AND useragent = $3
    AND NOT done
    AND NOW() < created_at + INTERVAL '10 minutes' -- within 10 minutes old
    AND NOW() > created_at + INTERVAL '2 seconds' -- at least 2 seconds old
RETURNING *;`,
        [tmpToken, data.ipAddress, data.userAgent]
      );

      if (result.rowCount !== 1) return res.status(400).send();

      // todo: check if temp token is at least 30 seconds old
      // and do a timer/periodic refresh on the client
      // Please wait ... seconds...`

      const accessKeyResult = await db.query<{
        value: string;
      }>(
        `UPDATE temp_access_tokens SET done = TRUE
WHERE
    value = $1
    AND ip_address = $2
    AND NOT done
RETURNING *;`,
        [accessKey, data.ipAddress]
      );

      if (accessKeyResult.rowCount !== 1) return res.status(400).send();
    }

    const {
      rows: [{ current_token }],
    } = await db.query<{ current_token: string }>(
      `INSERT INTO lv_token_data (linkvertise_token, ip_address, useragent, lifetime) VALUES ($1, $2, $3, $4) RETURNING current_token;`,
      [accessKey, data.ipAddress, data.userAgent, lifetime]
    );

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
  await db.end();
  await gameSourceWatcher.close();
  await gameSkinsWatcher.close();
  await sketchWatcher.close();
});
