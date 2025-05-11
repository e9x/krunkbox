import type { KruEnv } from "./scrape";
import createKruEnv from "./scrape";
import { development, skipUpdates, workinkURL } from "./env";
import { scripts, updateGameData } from "./sketchData.js";
import {
  gameSkinsPath,
  gameSourceDebugPath,
  gameSourcePath,
  userscriptName,
} from "./sketchDataPaths";
import testKru from "./testKru";
import type { Updated } from "./updateBin";
import updateBin from "./updateBin";
import { access, readFile, unlink } from "node:fs/promises";
import Piscina from "piscina";
import { SemVer } from "semver";
import type { KruSource } from "~client/inject";
import {
  analytics_user,
  api_token,
  db,
  sketch_key,
  sketch_key_type,
  validateSketchKey,
} from "../db";
import http from "node:http";
import { randomBytes } from "node:crypto";

const doFreeKeys = false;

function getImportantData(req: http.IncomingMessage): ImportantData {
  return {
    ipAddress:
      req.headers["cf-connecting-ip"]?.toString() || req.socket.remoteAddress!,
    userAgent: req.headers["user-agent"]?.toString() || "",
  };
}

async function validWorkInkToken(token: string) {
  const res = await fetch(`https://work.ink/_api/v2/token/isValid/${token}`);
  const data = (await res.json()) as { valid: boolean };
  return data.valid;
}

console.log("krunkbox: accepting free keys:", doFreeKeys);

console.log("krunkbox: running in:", process.env.NODE_ENV);

/*function cors(res: http.ServerResponse) {
  res.setHeader("access-control-request-method", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-origin", "https://krunker.io");
}*/

// server.register(fastifyCors, {
//   allowedHeaders: ["content-type", "x-token"],
//   exposedHeaders: ["x-token", "x-src"],
// });

const redirectPage = await readFile(
  new URL("../redirect.html", import.meta.url),
  "utf-8"
);

function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  return new Promise<Buffer>((resolve, reject) => {
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (err) => reject(err));
  });
}

function sendJSON(res: http.ServerResponse, status: number, body: any) {
  res.setHeader("content-type", "application/json");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

function sketchUpdated(supportedGame?: string) {
  if (!supportedGame) return;

  if (!skipUpdates && didTest && !testPassed) return false;

  if (alwaysUpToDate) return true;

  if (!scripts.game || !scripts.compat) return false;
  const gameSourceChecksum = scripts.game.checksum;

  if (
    (gameSourceChecksum !== supportedGame &&
      !(supportedGame in scripts.compat)) ||
    !scripts.compat[supportedGame].includes(gameSourceChecksum)
  )
    return false;

  return true;
}

export function sketchRoutes(server: http.Server) {
  server.on("request", (req, res) => {
    routerTpLinkArcherAx3000(req, res).catch((err) => {
      console.log("Oh nooo😨", err);
      res.end();
    });
  });
}

async function routerTpLinkArcherAx3000(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const pathname = new URL(req.url!, "ThugShake://skibidi.toilet:9999")
    .pathname;
  const importantData = getImportantData(req);
  res.setHeader("access-control-request-method", "GET, POST, OPTIONS");
  // https://krunker.io
  // console.log(Object.keys(req.headers));
  //res.setHeader("access-control-allow-origin", "https://krunker.io");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader(
    "access-control-allow-headers",
    "cache-control, content-type, x-token, accept"
  );
  res.setHeader("cache-control", "no-cache");
  res.setHeader("access-control-expose-headers", "etag, x-src");
  // res.setHeader("access-control-max-age", "86400");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (doFreeKeys && pathname === "/slavelabor" && req.method === "GET") {
    res.setHeader("location", workinkURL);
    res.writeHead(307);
    return;
  } else if (pathname === "/hi" && req.method === "POST") {
    const code = (await readBody(req)).toString();
    if (code.length === 0)
      return sendJSON(res, 200, {
        success: false,
        error: ["sketch_key_validate.invalid"],
      });

    let key = getSketchKey.get(code);

    if (key) {
      // if it alr exists and we didn't redeem it for the first time
      if (key.type === sketch_key_type.free) {
        // console.log("bitch`");
        return sendJSON(res, 200, {
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
          return sendJSON(res, 200, {
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
      } else
        return sendJSON(res, 200, {
          success: false,
          error: ["sketch_key_validate.invalid"],
        });
    }

    const token: api_token = {
      token: randomBytes(16).toString("base64"),
      code: key.code,
      born: Date.now(),
      ip: importantData.ipAddress,
    };
    insertApiToken.run(token.token, token.code, token.born, token.ip);
    sendJSON(res, 200, { success: true, token: token.token });
  } else if (pathname === "/slop" && req.method === "POST") {
    const creds = secureEndpoint(req, res);
    if (!creds) return;

    // The request body is expected to be a string of the form "id:nyaa:username".
    const parts = (await readBody(req)).toString().split(":nyaa:");
    let id: number, username: string;

    if (
      parts.length !== 2 ||
      isNaN((id = Number(parts[0]))) ||
      (username = parts[1]) === ""
    ) {
      console.error("Invalid request body", parts);
      res.writeHead(400);
      res.end();
      return;
    }

    // Log the extracted user info
    // console.log({ id, username }, creds.token);

    const seen = Date.now();
    // Begin a transaction so that the update-or-insert happens atomically.
    try {
      db.transaction(() => {
        // First try to update an existing key_users record that matches this token.
        const result = updateKeyUser.run(
          seen,
          importantData.ipAddress,
          creds.token.token,
          id
        );

        if (result.changes === 0) {
          // No key_users row existed for this token so insert a new row.
          insertKeyUser.run(
            creds.token.code,
            id,
            username,
            creds.token.token,
            importantData.ipAddress,
            seen,
            seen,
            1
          );
        }
      })();
      res.writeHead(204);
      res.end();
    } catch (e) {
      console.error("Transaction error:", e);
      res.writeHead(500);
      res.end();
    }
  } else if (pathname === "/sketchVersion" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString()) as {
      currentVersion: string;
      // we should probably source the current game version from the userscript
      // no harm in trusting the client on this one though
      supportedGame?: string;
    };

    if (
      typeof body !== "object" ||
      body === null ||
      typeof body.currentVersion !== "string" ||
      ("supportedGame" in body && typeof body.supportedGame !== "string")
    ) {
      console.error("SHOOT YOURSELF", body);
      res.writeHead(400);
      res.end("SHOOT YOURSELF");
      return;
    }

    // console.log(req.headers["user-agent"], { body, sketchVersion });

    if (!scripts.sketch) {
      res.writeHead(425);
      res.end();
      return;
    }
    const reqVersion = new SemVer(body.currentVersion);

    sendJSON(res, 200, {
      outdated: reqVersion.compare(scripts.sketch.version) === -1,
      latestVersion: scripts.sketch.version,
      // test didn't pass = not updated
      sketchUpdated: sketchUpdated(body.supportedGame),
      // client will interpret as relative to API url
      updateURL: `${userscriptName}?${Date.now()}`,
    } as SketchVersion);
  } else if (pathname === "/" + userscriptName && req.method === "GET") {
    if (!scripts.sketch) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.setHeader(
      "content-disposition",
      `attachment; filename="${userscriptName}"`
    );
    res.setHeader("content-type", "application/javascript");
    res.setHeader("content-length", scripts.sketch.source.byteLength);

    const etag = `"${scripts.sketch.checksum}"`;
    res.setHeader("etag", etag);

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }

    res.end(scripts.sketch.source);
  } else if (pathname === "/z") {
    if (!scripts.game) {
      res.writeHead(404);
      res.end();
      return;
    }

    const creds = secureEndpoint(req, res);
    if (!creds) return;
    incrementSketchKey.run(creds.key.code);

    res.setHeader("content-type", "application/javascript");
    res.setHeader("x-src", scripts.game.source.byteLength.toString());
    const etag = `"${scripts.game.mergedChecksum}"`;
    res.setHeader("etag", etag);
    res.setHeader("content-length", scripts.game.merged.byteLength);
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }

    res.writeHead(200);
    res.end(scripts.game.merged);
  } else if (pathname === "/to") {
    const creds = secureEndpoint(req, res);
    if (!creds) return;
    incrementSketchKey.run(creds.key.code);

    const body = JSON.parse((await readBody(req)).toString()) as {
      id: string;
      lol: UserHashMap;
    };

    if (
      typeof body !== "object" ||
      typeof body.id !== "string" ||
      typeof body.lol !== "object"
    ) {
      res.writeHead(400);
      res.end();
      return;
    }

    const updateUsers: User[] = [];
    const newUsers: User[] = [];

    for (const id in body.lol) {
      const newVal = body.lol[id];

      if (
        !isFinite(Number(id)) ||
        !Array.isArray(newVal) ||
        newVal.length !== 2 ||
        typeof newVal[0] !== "string" ||
        typeof newVal[1] !== "number" ||
        !isFinite(newVal[1]) ||
        updateUsers.length + newUsers.length > 32
      ) {
        res.writeHead(400);
        res.end();
        return;
      }

      if (/^(Local User|Guest_\d+|Player_\d+|Anonymous_\d+)$/.test(newVal[0]))
        continue;

      newVal.push(id);

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
        users.set(id, newVal as unknown as SketchAnalyticsPlayerDat);
      }
    }

    updateAllShit(body.id, newUsers, updateUsers);

    res.writeHead(204);
    res.end();
  } else {
    const [, accessKey] = pathname.match(accessKeyPart) || [];

    if (typeof accessKey === "string") {
      res.setHeader("content-type", "text/html");
      res.write(redirectPage.replace(/ride my meat/g, accessKey));
      res.end();
    } else {
      res.setHeader("content-type", "text/html");
      res.writeHead(404);
      res.end(
        `<!DOCTYPE HTML><html><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0; url=https://www.google.com/search?q=i+am+in+your+walls" /></head></html>`
      );
    }
  }
}

const accessKeyPart = /^\/key\/(.+)$/;

interface ImportantData {
  ipAddress: string;
  userAgent: string;
}

const getSketchKey = db.prepare<[code: string], sketch_key>(
  "SELECT * FROM sketch_keys WHERE code = ?;"
);

const getApiToken = db.prepare<[token: string], api_token>(
  "SELECT * FROM api_tokens WHERE token = ?;"
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
    giveBirth.run(key.born!, key.code);
    console.log("gave birth", key);
  }
  return { token, key };
}

// ANALYTICS

// Prepare statements for key_users
const updateKeyUser = db.prepare<
  [seen: number, last_ip: string, last_token: string, account_id: number]
>(
  "UPDATE key_users SET record = record + 1, seen = ?, last_ip = ? WHERE last_token = ? AND account_id = ?;"
);
const insertKeyUser = db.prepare<
  [
    code: string,
    account_id: number,
    account_username: string,
    last_token: string,
    last_ip: string,
    born: number,
    seen: number,
    record: number,
  ]
>(
  "INSERT INTO key_users (code,account_id,account_username,last_token,last_ip,born,seen,record) VALUES (?,?,?,?,?,?,?,?);"
);

type SketchAnalyticsPlayerDat = [username: string, level: number, game: string];
type User = [id: string, username: string, level: number];
type UserHashMap = { [id: string]: [username: string, level: number] };
const users = new Map<string, SketchAnalyticsPlayerDat>();

for (const user of db
  .prepare<[], analytics_user>(`SELECT * FROM usersv2;`)
  .all())
  users.set(user.id, [user.username, user.level, user.game]);

const updateShit = db.prepare<
  [username: string, level: number, game: string, seen: number, id: string]
>("UPDATE usersv2 SET username=?, level=?, game=?, seen =? WHERE id=?;");

const insertSHit = db.prepare<
  [id: string, username: string, level: number, game: string, seen: number]
>("INSERT INTO usersv2 (id,username,level,game,seen) VALUES (?,?,?,?,?);");

const updateAllShit = db.transaction(
  (gameId: string, newUsers: User[], updateUsers: User[]) => {
    const seen = Date.now();
    for (const nu of newUsers)
      insertSHit.run(nu[0], nu[1], nu[2], gameId, seen);
    for (const u of updateUsers) updateShit.run(u[1], u[2], gameId, seen, u[0]);
  }
);

interface SketchVersion {
  outdated: boolean;
  latestVersion: string;
  updateURL: string;
}

const alwaysUpToDate = true;

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
    let kruEnvTst = await createKruEnv();
    testPassed = await testKru(kruEnvTst);
    await kruEnvTst.collect();
    didTest = true;
  } else {
    // we have to assume these values
    testPassed = true;
    didTest = true;
  }

  await kruEnv.collect();
}

updateContext();

export const updateInterval = setInterval(updateContext, 60e3 * 10);

function secureEndpoint(
  req: http.IncomingMessage,
  res: http.ServerResponse
): { token: api_token; key: sketch_key } | undefined {
  const xToken = req.headers["x-token"] as string;
  const creds = resolveCreds(xToken);
  if (!creds) {
    res.writeHead(403);
    res.end();
    return;
  }
  const validateError = validateSketchKey(creds.key);
  if (typeof validateError === "string") {
    res.writeHead(403);
    res.end(validateError);
    return;
  }
  if (
    creds.key.type === sketch_key_type.free &&
    getImportantData(req).ipAddress !== creds.token.ip
  ) {
    console.log("ip diff lol");
    res.writeHead(403);
    res.end("api_token.invalid_ip");
    return;
  }
  return creds;
}
