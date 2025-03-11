import "source-map-support/register.js";
import type { KruEnv } from "./kruEnv";
import createKruEnv from "./kruEnv";
import { development, host, port, skipUpdates, workinkURL } from "./env";
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
import fastify, { FastifyRequest } from "fastify";
import { access, readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Piscina from "piscina";
import { SemVer } from "semver";
import type { KruSource } from "~client/inject";
import { binDir } from "./kruPaths";
import {
  analytics_user,
  api_token,
  db,
  sketch_key,
  sketch_key_type,
  validateSketchKey,
} from "./db";
import Handlebars from "handlebars";
import { randomBytes } from "node:crypto";

console.log("krunkbox: running in:", process.env.NODE_ENV);

const server = fastify({ logger: { level: "error" } });

server.register(fastifyStatic, {
  root: fileURLToPath(binDir),
  serve: false,
});

server.register(fastifyCors, {
  allowedHeaders: ["content-type", "x-token"],
  exposedHeaders: ["x-token"],
});

const doFreeKeys = false;

console.log("krunkbox: accepting free keys:", doFreeKeys);

if (doFreeKeys)
  server.get("/slavelabor", (req, res) => {
    res.redirect(workinkURL, 307);
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

async function validWorkInkToken(token: string) {
  const res = await fetch(`https://work.ink/_api/v2/token/isValid/${token}`);
  const data = (await res.json()) as { valid: boolean };
  //console.trace(data);
  //data.valid = true;
  return data.valid;
}
const getSketchKey = db.prepare<[code: string], sketch_key>(
  "SELECT * FROM sketch_keys WHERE code = ?;"
);

const getApiToken = db.prepare<[token: string], api_token>(
  "SELECT * FROM sketch_keys WHERE code = ?;"
);

const insertSketchKey = db.prepare<
  [
    code: string,
    reason: string | null,
    init: number,
    born: number | null,
    type: number,
  ]
>("INSERT INTO sketch_keys (code,reason,init,born,type) VALUES (?,?,?,?,?);");

const incrementSketchKey = db.prepare<[code: string]>(
  "UPDATE sketch_keys SET uses = uses + 1 WHERE code = ?;"
);

const insertApiToken = db.prepare<
  [token: string, code: string, born: number, ip: string]
>("INSERT INTO api_tokens (token,code,born,ip) VALUES (?,?,?,?);");

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
    let code = req.body as string;
    code = code.trim();
    if (code.length === 0)
      return reply.send({
        success: false,
        error: ["sketch_key_validate.invalid"],
      });

    let key = getSketchKey.get(code);

    if (key) {
      // if it alr exists and we didn't redeem it for the first time
      if (key.type === sketch_key_type.free) {
        // console.log("bitch`");
        return reply.send({
          success: false,
          error: ["sketch_key_validate.used"],
        });
      }
    } else {
      if (development && code === "x3") {
        const init = Date.now();
        key = {
          code: crypto.randomUUID(),
          reason: "developer key",
          init,
          born: init,
          duration: null,
          type: sketch_key_type.unlimited,
          uses: 0,
        };
        console.log("developer key:", key);
        insertSketchKey.run(key.code, key.reason, key.init, key.born, key.type);
      } else if (await validWorkInkToken(code)) {
        if (!doFreeKeys) {
          console.error("tried to validate workink LOL", code);
          return reply.send({
            success: false,
            error: ["sketch_key_validate.invalid"],
          });
        }
        // insert into the database
        const init = Date.now();
        key = {
          code,
          reason: "work.ink key",
          init,
          born: init,
          duration: null,
          type: sketch_key_type.free,
          uses: 0,
        };
        insertSketchKey.run(key.code, key.reason, key.init, key.born, key.type);
      } else {
        return reply.send({
          success: false,
          error: ["sketch_key_validate.invalid"],
        });
      }
    }

    const importantData = getImportantData(req);

    const token: api_token = {
      token: randomBytes(16).toString("base64"),
      code: key.code,
      born: Date.now(),
      ip: importantData.ipAddress,
    };
    insertApiToken.run(token.token, token.code, token.born, token.ip);
    console.log("created api token:", token);
    reply.send({ success: true, token: token.code });
  }
);

const giveBirth = db.prepare<[born: number, code: string]>(
  "UPDATE sketch_keys SET born = ? WHERE code = ?;"
);

function resolveCreds(xToken: string) {
  const token = getApiToken.get(xToken);
  if (!token) return;
  const key = getSketchKey.get(token.code)!;
  if (key.born === null) {
    // this marks the first use
    // the key is meant to become active after it was first utilized
    // likely generated in bulk for sellpass shop or smth
    key.born = Date.now();
    giveBirth.all(key.born!, key.code);
    console.log("gave birth", key);
  }
  return { token, key };
}

// ANALYTICS

type SketchAnalyticsPlayerDat = [username: string, level: number];
type User = [id: string, username: string, level: number];
type UserHashMap = { [id: string]: SketchAnalyticsPlayerDat };
const users = new Map<string, SketchAnalyticsPlayerDat>();

for (const user of db
  .prepare<[], analytics_user>(`SELECT * FROM usersv2;`)
  .all())
  users.set(user.id, [user.username, user.level]);

// keep the old api up
server.post("/tm", async (req, reply) => {
  reply.send();
});

const updateShit = db.prepare(
  `UPDATE usersv2 SET username = ?, level = ?, seen = ? WHERE id = ?;`
);

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

  const seen = Date.now();

  if (newUsers.length) {
    const values: any[] = [];
    const newUsersArray =
      "values " +
      newUsers
        .map((u) => {
          values.push(u[0]);
          values.push(u[1]);
          values.push(u[2]);
          values.push(seen);
          return `(?,?,?,?)`;
        })
        .join(",");
    const q = `INSERT INTO usersv2 (id, username, level, seen) ${newUsersArray};`;
    // console.log({ q, values });
    db.prepare(q).run(...values);
  }

  // just update each row individually, don't expect too many users to be updated at once
  for (const u of updateUsers) {
    updateShit.run(u[1], u[2], seen, u[0]);
  }

  reply.send();
});

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

  if (updated.index_html) {
    console.log("Game updated.");

    if (updated.index_html) {
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
    const creds = resolveCreds(xToken);
    if (!creds) return reply.status(403).send();
    const validateError = validateSketchKey(creds.key);
    if (typeof validateError === "string")
      return reply.status(403).send(validateError);
    if (
      creds.key.type === sketch_key_type.free &&
      getImportantData(req).ipAddress !== creds.token.ip
    ) {
      console.log("ip diff lol");
      return reply.status(403).send("api_token.invalid_ip");
    }

    incrementSketchKey.run(creds.key.code);

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
    const creds = resolveCreds(xToken);
    if (!creds) return reply.status(403).send();
    const validateError = validateSketchKey(creds.key);
    if (typeof validateError === "string")
      return reply.status(403).send(validateError);
    if (
      creds.key.type === sketch_key_type.free &&
      getImportantData(req).ipAddress !== creds.token.ip
    ) {
      console.log("ip diff lol");
      return reply.status(403).send("api_token.invalid_ip");
    }

    incrementSketchKey.run(creds.key.code);

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
  db.close();
  await compatibleChecksumsWatcher.close();
  await sketchWatcher.close();
  clearInterval(updateInterval);
});

console.log("todo: purge");
