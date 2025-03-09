import { db } from "./db.js";
import { purgeTokens } from "./purgeTokens.js";

const tokens = purgeTokens();
console.log("Purged", tokens, "tokens.");
db.close();
