import createKruEnv from "./scrape";
import testKru from "./testKru";
import { compatibleChecksumsWatcher, sketchWatcher } from "./sketchData";

async function main() {
  // prepare environment for testing and extracting the source
  const kruEnv = await createKruEnv();
  await testKru(kruEnv);
  await kruEnv.collect();
}

main().finally(async () => {
  await compatibleChecksumsWatcher.close();
  await sketchWatcher.close();
});
