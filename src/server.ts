import "source-map-support/register.js";
import db from "./db";
import type { KruSource } from "./electronker/inject";
import type { KruEnv } from "./electronker/kruEnv";
import createKruEnv from "./electronker/kruEnv";
import { linkvertiseKey, port, skipUpdates } from "./env";
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
import { getImportantData, incrementToken, isTokenValid } from "./token";
import updateBin, { binDir } from "./updateBin";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import AsyncExitHook from "async-exit-hook";
import fastify from "fastify";
import { access, unlink } from "node:fs/promises";
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

      await parseGame(kruEnv);
    }
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

    await parseGame(kruEnv);
  }

  testPassed = await testKru(kruEnv);
  didTest = true;

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
  allowedHeaders: ["x-token"],
  exposedHeaders: ["x-token"],
});

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
    const tokens = req.body as [lv: string, tmp: string];
    const lvToken = tokens[0];
    const tmpToken = tokens[1];

    const data = getImportantData(req);
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
    AND NOW() > created_at + INTERVAL '4 seconds' -- at least 4 seconds old
RETURNING *;`,
      [tmpToken, data.ipAddress, data.userAgent]
    );

    // todo: check if temp token is at least 30 seconds old
    // and do a timer/periodic refresh on the client
    // Please wait ... seconds...`

    if (lvToken !== linkvertiseKey) return res.status(402).send();
    if (result.rowCount !== 1) return res.status(400).send();

    const {
      rows: [{ current_token }],
    } = await db.query<{ current_token: string }>(
      `INSERT INTO lv_token_data (linkvertise_token, ip_address, useragent) VALUES ($1, $2, $3) RETURNING current_token;`,
      [lvToken, data.ipAddress, data.userAgent]
    );

    return current_token;
  }
);

/*server.post(
  "/hash",
  {
    schema: {
      body: {
        type: "string",
      },
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
    if (!context) return reply.status(425).send();

    const xToken = req.headers["x-token"] as string;

    if (!(await isTokenValid(xToken, getImportantData(req))))
      return reply.status(402).send();

    const {
      rows: [{ original_last_diy }],
    } = await db.query<{ original_last_diy: boolean }>(
      "WITH updated AS (UPDATE lv_token_data SET last_diy = NOT last_diy WHERE current_token = $1 OR previous_token = $1 RETURNING last_diy) SELECT NOT last_diy AS original_last_diy FROM updated;",
      [xToken]
    );

    if (!original_last_diy) return reply.status(429).send();

    const hashed = await context.run(
      new TextEncoder().encode(request.body as string),
      {
        name: "hashToken",
      }
    );

    const newToken = await rotateToken(xToken, getImportantData(request));

    reply.header("x-token", newToken);

    reply.send(hashed);
  }
);*/

// Validate the token
/*server.post(
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
);*/

server.listen(
  {
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
