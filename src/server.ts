import type { HashedData } from "./env.js";
import test from "./test.js";
import updateBin from "./updateBin.js";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { expand } from "dotenv-expand";
import { config } from "dotenv-flow";
import fastify from "fastify";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Piscina from "piscina";

expand(config());

export interface ContextWorker extends Piscina {
  run(task: undefined, runOptions: { name: "game" }): Promise<string>;
  run(
    task: ArrayBuffer,
    runOptions: { name: "hashToken" }
  ): Promise<HashedData>;
}

export interface ParseWorker extends Piscina {
  run(task: string, runOptions: { name: "parse" }): Promise<void>;
}

const parse: ParseWorker = new Piscina({
  maxThreads: 1,
  filename: new URL("./parseWorker.js", import.meta.url).toString(),
});

let context: ContextWorker | undefined;

async function parseGame() {
  if (!context) throw new Error("No context");

  await parse.run(await context.run(undefined, { name: "game" }), {
    name: "parse",
  });
}

async function updateContext() {
  const updated = await updateBin();

  if (
    updated["core dat"] ||
    updated["loader js"] ||
    updated["loader wasm"] ||
    !context
  ) {
    console.log("update!! !");

    if (context) context.destroy();

    context = new Piscina({
      maxThreads: 1, // DEBUG
      filename: new URL("./contextWorker.js", import.meta.url).toString(),
    });

    if (updated && updated["core dat"]) {
      try {
        await unlink(new URL("../bin/game.min.js", import.meta.url));
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }

      await parseGame();
    }

    if (updated) {
      console.log("Updated");
    } else {
      console.log("Up-to-date");
    }

    test(context);
  }
}

updateContext();

setInterval(updateContext, 60e3 * 60 * 6);

const server = fastify();

server.register(fastifyStatic, {
  root: fileURLToPath(new URL("../bin/", import.meta.url)),
  serve: false,
});

server.register(fastifyCors);

server.route({
  method: "GET",
  url: "/source",
  handler(_request, reply) {
    reply.sendFile("game.min.js");
  },
});

server.route({
  method: "POST",
  url: "/hashToken",
  async handler(request, reply) {
    if (!Buffer.isBuffer(request.body))
      return reply.status(400).send("bad body");

    reply.send(await context?.run(request.body.buffer, { name: "hashToken" }));
  },
});

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 80;

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
