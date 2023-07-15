import {
  purgeTempAccessTokens,
  purgeTempTokens,
  purgeTokens,
} from "./purgeTokens.js";

const tokens = await purgeTokens();
console.log("Purged", tokens, "tokens.");

const tempTokens = await purgeTempTokens();
console.log("Purged", tempTokens, "temporary tokens.");

const tempAccessTokens = await purgeTempAccessTokens();
console.log("Purged", tempAccessTokens, "temporary access tokens.");
