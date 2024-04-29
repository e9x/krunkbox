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
import { DBUser, db } from "./db";

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
          unlink(gameSkinsPath),
        ]);
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
        access(gameSkinsPath),
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

type SketchAnalyticsPlayerDat = [username: string, level: number];
type User = [id: string, username: string, level: number];
type UserHashMap = { [id: string]: SketchAnalyticsPlayerDat };
const users = new Map<string, SketchAnalyticsPlayerDat>();

for (const user of (await db.query<DBUser>(`SELECT * FROM usersv2;`)).rows)
  users.set(user.id, [user.username, user.level]);

// keep the old api up
server.post("/tm", async (req, reply) => {
  reply.send();
});

server.post("/to", async (req, reply) => {
  // const ip = req.headers["cf-connecting-ip"]?.toString() || req.ip;
  const body = req.body as UserHashMap;

  if (typeof body !== "object") return reply.status(400);

  const updateUsers: User[] = [];
  const newUsers: User[] = [];

  for (const id in body) {
    const newVal = body[id];

    if (
      !isFinite(Number(id)) ||
      !Array.isArray(newVal) ||
      newVal.length !== 2 ||
      typeof newVal[0] !== "string" ||
      typeof newVal[1] !== "number" ||
      !isFinite(newVal[1]) ||
      updateUsers.length + newUsers.length > 32
    )
      return reply.status(400);

    if (/^(Local User|Guest_\d+|Player_\d+|Anonymous_\d+)$/.test(newVal[0]))
      continue;

    const saved = users.get(id);

    if (saved) {
      let update = false;

      // check if any vals were updated
      for (let i = 0; i < saved.length; i++)
        if (saved[i] !== newVal[i]) {
          saved[i] = newVal[i];
          update = true;
        }

      if (update) updateUsers.push([id, newVal[0], newVal[1]]);
    } else {
      newUsers.push([id, newVal[0], newVal[1]]);
      users.set(id, newVal);
    }
  }

  if (newUsers.length) {
    const values: any[] = [];
    const seenI = values.push(new Date());
    const newUsersArray =
      "values " +
      newUsers
        .map((u) => {
          const idI = values.push(u[0]);
          const usernameI = values.push(u[1]);
          const levelI = values.push(u[2]);
          return `($${idI},$${usernameI},$${levelI},$${seenI})`;
        })
        .join(",");
    const q = `INSERT INTO usersv2 (id, username, level, seen) ${newUsersArray};`;
    // console.log({ q, values });
    await db.query(q, values);
  }

  // just update each row individually, don't expect too many users to be updated at once
  for (const u of updateUsers) {
    const values: any[] = [];
    const seenI = values.push(new Date());
    const idI = values.push(u[0]);
    const usernameI = values.push(u[1]);
    const levelI = values.push(u[2]);
    const q = `UPDATE usersv2 SET username = ${usernameI}, level = ${levelI}, seen = ${seenI} WHERE id = ${idI};`;
    // console.log({ q, values });
    await db.query(q, values);
  }

  reply.send();
});

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
