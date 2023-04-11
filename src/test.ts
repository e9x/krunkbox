import type { ContextWorker } from "./server.js";

export default async function (context: ContextWorker) {
  console.time("hash");
  const hashed = await context.run(
    new Uint8Array([25, 30, 17, 17, 27, 16, 16, 29, 16, 24]).buffer,
    {
      name: "hashToken",
    }
  );
  console.timeEnd("hash");

  console.log("hash:", hashed);
}
