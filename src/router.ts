import type { KruEnv } from "./scrape";
import createKruEnv from "./scrape";
import { development, skipUpdates, workinkURL, discordWebhook } from "./env";
import { scripts, updateGameData } from "./sketchData.js";
import {
  gameSkinsPath,
  gameSourceDebugPath,
  gameSourcePath,
  userscriptName,
  ccChecksumsPath,
  ccDir,
} from "./sketchDataPaths";
import testKru from "./testKru";
import type { Updated } from "./updateBin";
import updateBin from "./updateBin";
import { compareWithLastCC, type CCComparisonResult } from "./ccCompare";
import {
  access,
  readFile,
  unlink,
  writeFile,
  appendFile,
  mkdir,
} from "node:fs/promises";
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
import {
  randomBytes,
  verify,
  createPublicKey,
  KeyObject,
  createHash,
} from "node:crypto";

const doFreeKeys = false;

let proxyRSAKey: KeyObject | null = null;

export interface CCDeobWorker extends Piscina {
  run(source: string): Promise<string>;
}

const ccDeob: CCDeobWorker = new Piscina({
  maxThreads: 2,
  resourceLimits: { maxOldGenerationSizeMb: 1000 },
  filename: new URL("./ccDeobWorker.js", import.meta.url).toString(),
});

const seenCCChecksums = new Set<string>();

async function loadCCChecksums() {
  try {
    const data = await readFile(ccChecksumsPath, "utf-8");
    for (const hash of data.split("\n")) {
      const h = hash.trim();
      if (h) seenCCChecksums.add(h);
    }
    console.log(
      "krunkbox: Loaded",
      seenCCChecksums.size,
      "CC packet checksums.",
    );
  } catch (err) {
    if ((err as any).code !== "ENOENT") console.error(err);
  }
}
loadCCChecksums();

function notifyDiscordCC(
  checksum: string,
  raw: string,
  deobfuscated: string,
  comparison: CCComparisonResult | null,
) {
  const formData = new FormData();

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "Checksum", value: `\`${checksum}\``, inline: false },
  ];

  if (comparison) {
    const pct = (comparison.similarity * 100).toFixed(1);
    const b = comparison.breakdown;
    fields.push(
      {
        name: "Similarity to Previous",
        value: `**${pct}%** (vs \`${comparison.previousFile}\`)`,
        inline: false,
      },
      {
        name: "Node Type Distribution",
        value: `${(b.nodeTypeDistribution * 100).toFixed(1)}%`,
        inline: true,
      },
      {
        name: "String Literals",
        value: `${(b.stringLiterals * 100).toFixed(1)}%`,
        inline: true,
      },
      {
        name: "Identifiers",
        value: `${(b.identifiers * 100).toFixed(1)}%`,
        inline: true,
      },
      {
        name: "Structure",
        value: `${(b.structure * 100).toFixed(1)}%`,
        inline: true,
      },
      {
        name: "Numeric Literals",
        value: `${(b.numericLiterals * 100).toFixed(1)}%`,
        inline: true,
      },
      {
        name: "Function Count",
        value: `${(b.functionCountDelta * 100).toFixed(1)}%`,
        inline: true,
      },
    );
  } else {
    fields.push({
      name: "Similarity",
      value: "No previous CC to compare",
      inline: false,
    });
  }

  const payload = {
    username: "cc-watcher",
    embeds: [
      {
        title: "\uD83D\uDCE6 New Unique CC Packet Received",
        color: 0xff005c,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
  formData.append("payload_json", JSON.stringify(payload));
  formData.append("file", new Blob([raw]), "cc_packet.raw.js");
  formData.append("file2", new Blob([deobfuscated]), "cc_packet.deob.js");
  fetch(discordWebhook, { method: "POST", body: formData }).catch((err: any) =>
    console.error("cc webhook error:", err),
  );
}

async function loadProxyKey(keyPath: string = "proxy_key.pem") {
  try {
    const keyData = await readFile(keyPath);
    proxyRSAKey = createPublicKey(keyData);
    console.log("krunkbox: Proxy RSA key loaded.");
  } catch (err) {
    console.error(
      "krunkbox: Failed to load proxy key. Ensure key exists at path:",
      keyPath,
    );
  }
}
loadProxyKey();

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
  "utf-8",
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
  //   console.log({
  //     skipUpdates,
  //     didTest,
  //     testPassed,
  //     supportedGame,
  //     gameSourceChecksum: scripts?.game?.checksum,
  //   });

  if (!supportedGame) return;

  if (!skipUpdates && didTest && !testPassed) return false;

  if (alwaysUpToDate) return true;

  if (!scripts.game || !scripts.compat) return false;

  if (scripts.game.checksum === supportedGame) return true;

  const xn = scripts.compat[supportedGame];

  if (!xn || !xn.includes(scripts.game.checksum)) return false;

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

function getRandomATTIP() {
  return "73.250.99.3";
  //  const octet3 = Math.floor(Math.random() * 256);
  //  const octet4 = Math.floor(Math.random() * 256);
  //  return `99.65.${octet3}.${octet4}`;
}

async function routerTpLinkArcherAx3000(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const { pathname } = new URL(req.url!, "ThugShake://skibidi.toilet:9999");
  const importantData = getImportantData(req);
  res.setHeader("access-control-request-method", "GET, POST, OPTIONS");
  // https://krunker.io
  // console.log(Object.keys(req.headers));
  //res.setHeader("access-control-allow-origin", "https://krunker.io");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader(
    "access-control-allow-headers",
    "cache-control, content-type, x-token, accept",
  );
  res.setHeader("cache-control", "no-cache");
  res.setHeader("access-control-expose-headers", "etag, x-src");
  res.setHeader("access-control-max-age", "86400");

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
          id,
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
            1,
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
  } else if (pathname === "/auth") {
    const timeString = req.headers["x-proxy-integrity-time"];
    const signatureHex = req.headers["x-proxy-integrity-sig"];
    let isSignatureValid = false;

    const authorization = req.headers["authorization"];

    if (
      proxyRSAKey &&
      typeof timeString === "string" &&
      typeof signatureHex === "string"
    ) {
      try {
        const signature = Buffer.from(signatureHex, "hex");
        isSignatureValid = verify(
          "sha256",
          Buffer.from(timeString),
          proxyRSAKey,
          signature,
        );
        console.log({ authorization, isSignatureValid, timeString, signature });
      } catch (e) {
        isSignatureValid = false;
      }
    }

    if (!proxyRSAKey || !isSignatureValid) {
      // res.writeHead(403);
      // res.end("Proxy authentication failed");
      console.warn("/proxy: failed to verify request signature");
      // return;
    }

    // if (
    //   !authorization ||
    //   typeof authorization !== "string" ||
    //   !authorization.startsWith("Bearer ") ||
    //   authorization.substring(7) === ""
    // ) {
    //   res.writeHead(403);
    //   res.end("Proxy authentication failed");
    //   console.warn("/proxy: no authorization provided");
    //   return;
    // }

    const spoofedIP = getRandomATTIP();

    sendJSON(res, 200, {
      ok: true,
      userID: "bruh",
      spoofedIP,
    });
    return;
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
      `attachment; filename="${userscriptName}"`,
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
  } else if (pathname === "/cc" && req.method === "POST") {
    const creds = secureEndpoint(req, res);
    if (!creds) return;

    const body = await readBody(req);
    const checksum = createHash("sha512").update(body).digest("hex");

    if (!seenCCChecksums.has(checksum)) {
      console.log(
        `krunkbox: New unique CC packet! ${checksum.slice(0, 12)}...`,
      );
      seenCCChecksums.add(checksum);

      let rawCode = body.toString();
      rawCode = rawCode.slice(1, -1);

      // Deobfuscate on worker
      console.time(`deob_cc_${checksum.slice(0, 8)}`);
      const deobfuscated = await ccDeob.run(rawCode);
      console.timeEnd(`deob_cc_${checksum.slice(0, 8)}`);

      // Compare with previous CC script before saving the new one
      let comparison: CCComparisonResult | null = null;
      try {
        comparison = await compareWithLastCC(deobfuscated);
        if (comparison) {
          console.log(
            `krunkbox: CC similarity to ${comparison.previousFile}: ${(comparison.similarity * 100).toFixed(1)}%`,
          );
        }
      } catch (err) {
        console.error(
          "krunkbox: CC comparison failed:",
          (err as Error).message,
        );
      }

      if (!comparison || comparison.similarity < 0.99) {
        notifyDiscordCC(checksum, rawCode, deobfuscated, comparison);
      } else {
        console.log(
          `krunkbox: CC similarity ${(comparison.similarity * 100).toFixed(1)}% >= 99%, skipping webhook.`,
        );
      }

      // Atomic append is much safer and faster than a full JSON rewrite
      appendFile(ccChecksumsPath, checksum + "\n", "utf-8").catch((err: any) =>
        console.error("failed to save cc checksum:", err),
      );

      // Save deobfuscated version
      await mkdir(ccDir, { recursive: true }).catch(() => {});
      const filename = `cc_${checksum.slice(0, 12)}.deob.js`;
      await writeFile(new URL(filename, ccDir), deobfuscated);
    } else {
      console.log(
        `krunkbox: Received duplicate CC packet. Skipping notification.`,
      );
    }

    res.setHeader("Content-Type", "text/plain");
    res.writeHead(200);
    res.end(body);
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
        `<!DOCTYPE HTML><html><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0; url=https://www.google.com/search?q=i+am+in+your+walls" /></head></html>`,
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
  "SELECT * FROM sketch_keys WHERE code = ?;",
);

const getApiToken = db.prepare<[token: string], api_token>(
  "SELECT * FROM api_tokens WHERE token = ?;",
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
  "UPDATE sketch_keys SET uses = uses + 1 WHERE code = ?;",
);

const insertApiToken = db.prepare<
  [token: string, code: string, born: number, ip: string]
>("INSERT INTO api_tokens (token,code,born,ip) VALUES (?,?,?,?);");

const giveBirth = db.prepare<[born: number, code: string]>(
  "UPDATE sketch_keys SET born = ? WHERE code = ?;",
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
  "UPDATE key_users SET record = record + 1, seen = ?, last_ip = ? WHERE last_token = ? AND account_id = ?;",
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
  "INSERT INTO key_users (code,account_id,account_username,last_token,last_ip,born,seen,record) VALUES (?,?,?,?,?,?,?,?);",
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
  },
);

interface SketchVersion {
  outdated: boolean;
  latestVersion: string;
  updateURL: string;
}

const alwaysUpToDate = false;

export interface ParseWorker extends Piscina {
  run(task: KruSource): Promise<void>;
}

const parse: ParseWorker = new Piscina({
  maxThreads: 2,
  resourceLimits: { maxOldGenerationSizeMb: 2000 },
  filename: new URL("./parseWorker.js", import.meta.url).toString(),
});

async function parseGame(kruEnv: KruEnv) {
  await parse.run(await kruEnv.source());
  // notify=true: files are fully written, safe to send webhook
  await updateGameData(true);
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
  res: http.ServerResponse,
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
