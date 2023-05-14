import db from "./db.js";
import { purgeTempTokens, purgeTokens } from "./purgeTokens.js";
import AsyncExitHook from "async-exit-hook";

const tokens = await purgeTokens();
console.log("Purged", tokens, "tokens.");

const tempTokens = await purgeTempTokens();
console.log("Purged", tempTokens, "temporary tokens.");

AsyncExitHook(async () => {
  await db.end();
});

await db.end();
