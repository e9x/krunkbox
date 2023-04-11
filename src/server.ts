import { PORT } from "./env.js";
import test from "./test.js";
import updateBin, { binDir } from "./updateBin.js";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastify from "fastify";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Piscina from "piscina";

export interface ContextWorker extends Piscina {
  run(task: undefined, runOptions: { name: "game" }): Promise<string>;
  run(task: ArrayBuffer, runOptions: { name: "hashToken" }): Promise<string>;
}

export interface ParseWorker extends Piscina {
  run(task: string, runOptions: { name: "parse" }): Promise<void>;
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

  await parse.run(await context.run(undefined, { name: "game" }), {
    name: "parse",
  });
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
  }
}

updateContext();

setInterval(updateContext, 60e3 * 60 * 6);

const server = fastify({ logger: { level: "error" } });

server.register(fastifyStatic, {
  root: fileURLToPath(binDir),
  serve: false,
});

server.register(fastifyCors);

server.get("/source", (_request, reply) => {
  reply.sendFile("game.min.js");
});

async function validToken(token: string) {
  const res = await fetch(`https://redirect-api.work.ink/tokenValid/${token}`);
  if (!res.ok) throw new Error(`Not OK: ${res.status}`);
  const body = (await res.json()) as { valid: boolean };
  return body.valid;
}

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
    if (!(await validToken(request.headers["x-token"] as string)))
      return reply.status(402).send();
    if (!context) return reply.status(425).send();
    const hashed = await context.run(
      new TextEncoder().encode(request.body as string),
      {
        name: "hashToken",
      }
    );
    reply.send(hashed);
  }
);

server.post(
  "/valid",
  {
    schema: {
      body: {
        type: "string",
      },
    },
  },
  async (request, reply) => {
    reply.status((await validToken(request.body as string)) ? 204 : 402).send();
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
