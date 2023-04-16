import "source-map-support/register.js";
import db from "./db.js";
import { DEVELOPMENT, PORT } from "./env.js";
import { tokenShouldPurge } from "./purgeTokens.js";
import test from "./test.js";
import updateBin, { binDir } from "./updateBin.js";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import AsyncExitHook from "async-exit-hook";
import type { FastifyRequest } from "fastify";
import fastify from "fastify";
import { access, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import Piscina from "piscina";

export interface ContextWorker extends Piscina {
  run(task: undefined, runOptions: { name: "game" }): Promise<string>;
  run(task: ArrayBuffer, runOptions: { name: "hashToken" }): Promise<string>;
}

export interface ParseWorker extends Piscina {
  run(task: string): Promise<void>;
}

const parse: ParseWorker = new Piscina({
  maxThreads: 1,
  filename: new URL("./parseWorker.js", import.meta.url).toString(),
});

let context: ContextWorker | undefined;

async function createContext() {
  if (context) await context.destroy();

  context = new Piscina({
    maxThreads: 1, // DEBUG
    filename: new URL("./contextWorker.js", import.meta.url).toString(),
  });
}

async function parseGame() {
  if (!context) throw new Error("No context");

  await parse.run(await context.run(undefined, { name: "game" }));
}

async function updateContext() {
  const updated = await updateBin();

  console.log("Game updated?", updated);

  if (updated["core dat"] || updated["loader js"] || updated["loader wasm"]) {
    console.log("Updated");

    await createContext();

    if (updated["core dat"]) {
      try {
        await unlink(new URL("./game.min.js", binDir));
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }

      await parseGame();
    }

    test(context!);
  } else {
    if (!context) await createContext();
    console.log("Up-to-date");
    test(context!);
  }

  try {
    await access(new URL("./game.debug.js", binDir));
    await access(new URL("./game.min.js", binDir));
    await access(new URL("./vars.json", binDir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    // minify the source if we don't have it for some reason

    await parseGame();
  }
}

updateContext();

setInterval(updateContext, 60e3 * 60 * 6);

const server = fastify({ logger: { level: "error" } });

server.register(fastifyStatic, {
  root: fileURLToPath(binDir),
  serve: false,
});

server.register(fastifyCors, {
  allowedHeaders: ["x-token"],
  exposedHeaders: ["x-token"],
});

server.get("/source", (_request, reply) => {
  reply.sendFile("game.min.js");
});

server.get("/vars", (_request, reply) => {
  reply.sendFile("vars.json");
});

interface ImportantData {
  ipAddress: string;
  userAgent: string;
}

function getImportantData(request: FastifyRequest): ImportantData {
  return {
    ipAddress: request.headers["cf-connecting-ip"]?.toString() || request.ip,
    userAgent: request.headers["user-agent"]?.toString() || "",
  };
}

enum WorkInkError {
  DuplicateToken,
}
async function validWorkInkToken(token: string) {
  if (!token) return false;
  if (DEVELOPMENT && token === "DEBUG") return true;

  const res = await fetch(`https://redirect-api.work.ink/tokenValid/${token}`);
  if (!res.ok) throw new Error(`Not OK: ${res.status}`);
  const body = (await res.json()) as { valid: boolean };

  return body.valid;
}

async function processWorkInk(token: string, importantData: ImportantData) {
  if (!(await validWorkInkToken(token))) return;

  try {
    const {
      rows: [{ current_token }],
    } = await db.query<{ current_token: string }>(
      `INSERT INTO token_data (workink_token, ip_address) VALUES ($1, $2) RETURNING current_token;`,
      [token, importantData.ipAddress]
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
async function rotateToken(
  xToken: string,
  importantData: ImportantData,
  incrementUses = false
) {
  if (!(await isTokenValid(xToken, importantData))) return;

  const {
    rows: [found],
  } = await db.query<{ current_token: string }>(
    "WITH updated AS (UPDATE token_data SET previous_token = current_token, current_token = encode(gen_random_bytes(16), 'base64'), uses = uses + $1 WHERE (previous_token = $2 OR current_token = $2) AND ip_address = $3 RETURNING *) SELECT * FROM updated;",
    [incrementUses ? 1 : 0, xToken, importantData.ipAddress]
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
  async (request, reply) => {
    const token = await processWorkInk(
      request.body as string,
      getImportantData(request)
    );

    if (token === WorkInkError.DuplicateToken) return reply.status(422).send();
    else if (!token) return reply.status(402).send();

    reply.send(token);
  }
);

server.post(
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
  async (request, reply) => {
    if (!context) return reply.status(425).send();

    if (
      !(await isTokenValid(
        request.headers["x-token"] as string,
        getImportantData(request)
      ))
    )
      return reply.status(402).send();

    const hashed = await context.run(
      new TextEncoder().encode(request.body as string),
      {
        name: "hashToken",
      }
    );

    const newToken = await rotateToken(
      request.headers["x-token"] as string,
      getImportantData(request),
      true
    );

    reply.header("x-token", newToken);

    reply.send(hashed);
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
  async (request, reply) => {
    if (
      !(await isTokenValid(request.body as string, getImportantData(request)))
    )
      reply.status(402).send();

    const newToken = await rotateToken(
      request.body as string,
      getImportantData(request)
    );

    return reply.send(newToken);
  }
);

server.listen(
  {
    port: PORT,
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
});
