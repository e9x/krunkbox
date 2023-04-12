import db from "./db.js";
import { purgeTokens } from "./purgeTokens.js";
import AsyncExitHook from "async-exit-hook";

const tokens = await purgeTokens();
console.log("Purged", tokens, "tokens.");

AsyncExitHook(async () => {
  await db.end();
});

await db.end();
