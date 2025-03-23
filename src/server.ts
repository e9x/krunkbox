import "source-map-support/register.js";
import { host, port } from "./env";
import { sketchWatcher, compatibleChecksumsWatcher } from "./sketchData.js";
import AsyncExitHook from "async-exit-hook";
import { db } from "../db";
import http from "node:http";
import { sketchRoutes, updateInterval } from "./router";

const server = http.createServer();

sketchRoutes(server);

server.on("listening", () => {
  console.log(`REEZY SEASON @ http://${host}:${port}`);
});

server.listen({
  ...(host ? { host } : {}),
  port,
});

AsyncExitHook(async () => {
  db.close();
  await compatibleChecksumsWatcher.close();
  await sketchWatcher.close();
  clearInterval(updateInterval);
});

console.log("todo: purge");
