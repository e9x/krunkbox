import "source-map-support/register.js";
import { host, port } from "./env";
import { sketchWatcher, compatibleChecksumsWatcher } from "./sketchData.js";
import AsyncExitHook from "async-exit-hook";
import { db } from "../db";
import http from "node:http";
import { routerTpLinkArcherAx3000, updateInterval } from "./router";

const server = http.createServer();

server.on("request", (req, res) => {
  //@ts-ignore
  routerTpLinkArcherAx3000(req, res).catch((err) => {
    console.log("Oh nooo😨", err);
    res.end();
  });
});

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
