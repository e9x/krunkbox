import "source-map-support/register.js";
import type { KruEnv } from "./kruEnv";
import createKruEnv from "./kruEnv";
import { host, port, skipUpdates } from "./env";
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
  getSketchChecksum,
} from "./sketchData.js";
import {
  gameSkinsPath,
  gameSourceDebugPath,
  gameSourcePath,
  userscriptName,
} from "./sketchDataPaths";
import testKru from "./testKru";
import type { Updated } from "./updateBin";
import updateBin from "./updateBin";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import AsyncExitHook from "async-exit-hook";
import fastify from "fastify";
import { access, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Piscina from "piscina";
import { SemVer } from "semver";
import type { KruSource } from "~client/inject";
import { binDir } from "./kruPaths";
import { db } from "./db";

export interface ParseWorker extends Piscina {
  run(task: KruSource): Promise<void>;
}

const parse: ParseWorker = new Piscina({
  maxThreads: 1,
  resourceLimits: { maxOldGenerationSizeMb: 2000 },
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

  const updated = (await updateBin().catch((err) => {
    console.error("Failure updating");
    console.error(err);
    return false;
  })) as false | Partial<Updated>;

  if (!updated) return;

  // prepare environment for testing and extracting the source
  const kruEnv = await createKruEnv();

  let doParseGame = false;

  if (updated.core || updated.loader_js || updated.loader_wasm) {
    console.log("Game updated.");

    if (updated.core || updated.skins) {
      try {
        await Promise.all([
          unlink(gameSourceDebugPath),
          unlink(gameSourcePath),
          unlink(gameSkinsPath)
        ]);;
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }

      doParseGame = true;
    }

    doTest = true;
  } else {
    // if (development)
    console.debug("Up to date.");
  }

  if (!doParseGame)
    try {
      await Promise.all([
        access(gameSourceDebugPath),
        access(gameSourcePath),
        access(gameSkinsPath)
      ]);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      // minify the source if we don't have it for some reason
      doParseGame = true;
      doTest = true;
    }

  if (doParseGame) {
    try {
      await parseGame(kruEnv);
    } catch (err) {
      console.error(err);
      console.error("Failure parsing game.");
      await kruEnv.collect();
      return;
    }
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

const updateInterval = setInterval(updateContext, 60e3 * 10);

const server = fastify({ logger: { level: "error" } });

server.register(fastifyStatic, {
  root: fileURLToPath(binDir),
  serve: false,
});

server.register(fastifyCors, {
  allowedHeaders: ["content-type"],
});

interface SketchVersion {
  outdated: boolean;
  latestVersion: string;
  updateURL: string;
}

const alwaysUpToDate = true;

function sketchUpdated(supportedGame?: string) {
  if (!supportedGame) return;

  if (!skipUpdates && didTest && !testPassed) return false;

  if (alwaysUpToDate) return true;

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

  const etag = `"${getSketchChecksum()}"`;

  reply.header(
    "content-disposition",
    `attachment; filename="${userscriptName}"`
  );

  reply.header("content-type", "application/javascript");
  reply.header("etag", etag);

  if (req.headers["if-none-match"] === etag) {
    reply.status(304);
    return;
  }

  return sketchScript;
});

server.get("/source", async (req, reply) => {
  const gameScript = getGameSource();

  if (!gameScript) return reply.status(404).send();

  const etag = `"${getGameSourceChecksum()}"`;

  reply.header("content-type", "application/javascript");
  reply.header("etag", etag);

  if (req.headers["if-none-match"] === etag) {
    reply.status(304);
    return;
  }

  return gameScript;
});

server.get("/skins", async (req, reply) => {
  const gameSkins = getGameSkins();

  if (!gameSkins) return reply.status(404).send();

  const etag = `"${getGameSkinsChecksum()}"`;

  reply.header("content-type", "application/octet-stream");
  reply.header("etag", etag);

  if (req.headers["if-none-match"] === etag) {
    reply.status(304);
    return;
  }

  return gameSkins;
});

db.connect();

// ANALYTICS

interface DBUser {
  id: string;
  username: string;
}

type User = [id: string, username: string];
type UserHashMap = { [id: string]: string };

const users: UserHashMap = Object.create(null);

for (const user of (await db.query<DBUser>(`SELECT * FROM users;`)).rows)
  users[user.id] = user.username;

console.log(users);

server.post(
  "/tm",
  {
    schema: {
      body: {
        title: "String pair",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
    },
  },
  async (req, reply) => {
    const ip = req.headers["cf-connecting-ip"]?.toString() || req.ip;
    const body = req.body as UserHashMap;
    const updateUsers: User[] = [];
    const newUsers: User[] = [];

    for (const id in body) {
      const idN = Number(id);
      if (!isFinite(idN)) continue;

      if (id in users) {
        console.log([ip, users[id], body[id]], "new username");
        // new username
        if (users[id] !== body[id]) {
          updateUsers.push([id, body[id]]);
          users[id] = body[id];
        }
      } else {
        newUsers.push([id, body[id]]);
        users[id] = body[id];
      }
    }

    if (newUsers.length) {
      const values: string[] = [];
      const queryValues =
        "values " +
        newUsers
          .map((u) => {
            const idI = values.push(u[0]);
            const userI = values.push(u[1]);
            return `($${idI},$${userI})`;
          })
          .join(",");
      const q = `INSERT INTO users (id, username) ${queryValues};`;
      // console.log({ q, queryValues, values });
      await db.query(q, values);
    }

    if (updateUsers.length) {
      const values: string[] = [];
      const queryValues =
        "values " +
        updateUsers
          .map((u) => {
            const idI = values.push(u[0]);
            const userI = values.push(u[1]);
            return `($${idI},$${userI})`;
          })
          .join(",");
      const q = `UPDATE users AS u SET username = c.username FROM (${queryValues} AS c(id, username) WHERE c.id = u.id;`;
      // console.log({ q, queryValues, values });
      await db.query(q, values);
    }

    reply.send();
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
  await compatibleChecksumsWatcher.close();
  await sketchWatcher.close();
  clearInterval(updateInterval);
});
