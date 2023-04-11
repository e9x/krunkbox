import type { ContextWorker } from "./server.js";

export default async function (context: ContextWorker) {
  console.time("hash");
  const hashed = await context.run(Buffer.from("test").buffer, {
    name: "hashToken",
  });
  console.timeEnd("hash");

  console.log("hash:", hashed);
}
