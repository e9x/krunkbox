// for debugging purposes
import { game } from "./contextWorker.js";

const src = await game();

console.log(typeof src === "string" ? src.slice(0, 1000) : "Fail");
