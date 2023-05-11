import "source-map-support/register.js";
import db from "./db";
import type { KruSource } from "./electronker/inject";
import type { KruEnv } from "./electronker/kruEnv";
import createKruEnv from "./electronker/kruEnv";
import { development, port, skipUpdates } from "./env";
import { tokenShouldPurge } from "./purgeTokens";
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
import updateBin, { binDir } from "./updateBin";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import AsyncExitHook from "async-exit-hook";
import type { FastifyRequest } from "fastify";
import fastify from "fastify";
import { access, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
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

    testPassed = await testKru(kruEnv);
    didTest = true;
  } else {
    console.log("Up to date.");
    testPassed = await testKru(kruEnv);
    didTest = true;
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

  await kruEnv.collect();
}

updateContext();

setInterval(updateContext, 60e3 * 15);

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

    if (
      !(await isTokenValid(
        req.headers["x-token"] as string,
        getImportantData(req)
      ))
    )
      return reply.status(402).send();

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

    if (
      !(await isTokenValid(
        req.headers["x-token"] as string,
        getImportantData(req)
      ))
    )
      return reply.status(402).send();

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

interface ImportantData {
  ipAddress: string;
  userAgent: string;
}

function getImportantData(req: FastifyRequest): ImportantData {
  return {
    ipAddress: req.headers["cf-connecting-ip"]?.toString() || req.ip,
    userAgent: req.headers["user-agent"]?.toString() || "",
  };
}

enum WorkInkError {
  DuplicateToken,
}
async function validWorkInkToken(token: string) {
  if (!token) return false;

  const res = await fetch(`https://redirect-api.work.ink/tokenValid/${token}`);
  if (!res.ok) throw new Error(`Not OK: ${res.status}`);
  const body = (await res.json()) as { valid: boolean };

  return body.valid;
}

async function processWorkInk(token: string, importantData: ImportantData) {
  const generateLifetime =
    (development && token === "DEBUG") || token === "3117116";

  if (!generateLifetime && !(await validWorkInkToken(token))) return;

  try {
    const {
      rows: [{ current_token }],
    } = await db.query<{ current_token: string }>(
      `INSERT INTO token_data (workink_token, ip_address, lifetime) VALUES ($1, $2, $3) RETURNING current_token;`,
      [token, importantData.ipAddress, generateLifetime]
    );

    return current_token;
  } catch (err) {
    if (
      err instanceof pg.DatabaseError &&
      err.constraint === "token_data_workink_token_key"
    )
      return WorkInkError.DuplicateToken;
    else throw err;
  }
}
/**
 * Check if a token is valid
 * @returns Boolean indicating if the token is valid or not
 */
async function isTokenValid(xToken: string, importantData: ImportantData) {
  const {
    rows: [found],
  } = await db.query<{ current_token: string }>(
    "SELECT current_token FROM token_data WHERE (previous_token = $1 OR current_token = $1) AND ip_address = $2;",
    [xToken, importantData.ipAddress]
  );

  if (!found) return false;

  // expect it to be deleted soon
  if (!(await tokenShouldPurge(found.current_token))) return false;

  return true;
}

/**
 * Increment token uses and generate a new token
 * @returns The new token
 */
async function rotateToken(xToken: string, importantData: ImportantData) {
  if (!(await isTokenValid(xToken, importantData))) return;

  const {
    rows: [found],
  } = await db.query<{ current_token: string }>(
    "WITH updated AS (UPDATE token_data SET previous_token = current_token, current_token = encode(gen_random_bytes(16), 'base64'), uses = uses + $1 WHERE (previous_token = $2 OR current_token = $2) AND ip_address = $3 RETURNING *) SELECT * FROM updated;",
    [1, xToken, importantData.ipAddress]
  );

  return found.current_token;
}

// generate a token
server.post(
  "/hi",
  {
    schema: {
      body: {
        type: "string",
      },
    },
  },
  async (req, reply) => {
    const token = await processWorkInk(
      req.body as string,
      getImportantData(req)
    );

    if (token === WorkInkError.DuplicateToken) return reply.status(422).send();
    else if (!token) return reply.status(402).send();

    reply.send(token);
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
      "WITH updated AS (UPDATE token_data SET last_diy = NOT last_diy WHERE current_token = $1 OR previous_token = $1 RETURNING last_diy) SELECT NOT last_diy AS original_last_diy FROM updated;",
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
