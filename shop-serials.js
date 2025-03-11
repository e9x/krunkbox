#!/usr/bin/env node
// maintainer: openai gpt4.5-preview
import crypto from "node:crypto";
import ms from "ms";
import { db, sketch_key_type } from "./db.js";
import { writeFile } from "node:fs/promises";

const init = Date.now();
const duration = ms("30d");

const outFile = "serials-" + init + ".txt";
const genAmount = 100;
const serials = [];

const insertSketchKey = db.prepare(
  "INSERT INTO sketch_keys (code,reason,init,born,duration,type) VALUES (?,?,?,?,?,?);"
);

db.transaction(() => {
  console.log("generating", genAmount, "serials");
  for (let i = 0; i < genAmount; i++) {
    /** @type {import("./db").sketch_key} */
    const key = {
      code: crypto.randomUUID(),
      reason: "shop bulk serial",
      init,
      born: null,
      duration,
      type: sketch_key_type.pro,
      uses: 0,
    };

    // print final object
    serials.push(key.code);

    insertSketchKey.run(
      key.code,
      key.reason,
      key.init,
      key.born,
      key.duration,
      key.type
    );
  }
})();

console.log("done");
await writeFile(outFile, serials.join("\n") + "\n");
