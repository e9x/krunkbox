#!/usr/bin/env node
// maintainer: openai gpt4.5-preview
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import crypto from "node:crypto";
import ms from "ms";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

const dbPath = fileURLToPath(new URL("./krunkbox.db", import.meta.url));

const db = new Database(dbPath, { fileMustExist: true });

const sketch_key_type = {
  free: 0,
  pro: 1,
  unlimited: 2,
};

/**
 * @typedef {Object} sketch_key
 * @property {string} code
 * @property {string|null} reason
 * @property {number} init
 * @property {number|null} born
 * @property {number|null} duration
 * @property {number} type
 * @property {number} uses
 */

// helper: ask questions
const rl = readline.createInterface({ input, output });

async function ask(question, defaultValue) {
  const answer = await rl.question(
    defaultValue ? `${question} (${defaultValue}): ` : `${question}: `
  );
  return answer.trim() || defaultValue;
}

async function yesNo(question, defaultYes = true) {
  const defaultText = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await rl.question(`${question} ${defaultText}: `))
    .trim()
    .toLowerCase();
  if (answer === "") return defaultYes;
  return ["y", "yes"].includes(answer);
}

async function main() {
  // ask for type to create
  const typeAnswer = (
    await ask("What type of key would you like? (free/pro/unlimited)", "pro")
  ).toLowerCase();
  const type =
    sketch_key_type[typeAnswer] !== undefined
      ? sketch_key_type[typeAnswer]
      : sketch_key_type.pro;

  // ask for duration if pro
  let duration = null;
  if (type === sketch_key_type.pro) {
    let durationInput;
    while (true) {
      durationInput = await ask("Duration of key? (e.g. 30d, 2h, 15m)", "30d");
      duration = ms(durationInput);
      if (typeof duration === "number") break;
      console.log(
        'Invalid duration format. Please use formats like "15d", "12h", "30m".'
      );
    }
  }

  // ask for reason
  let reason = null;
  if (await yesNo("Do you want to provide a reason for this key?", false)) {
    reason = await ask("Provide reason");
  }

  // ask if active immediately
  const activateNow = await yesNo("Activate key immediately?", true);
  const init = Date.now();
  const born = activateNow ? init : null;

  /** @type {sketch_key} */
  const key = {
    code: crypto.randomUUID(),
    reason,
    init,
    born,
    duration,
    type,
    uses: 0,
  };

  // print final object
  console.log(key);

  const insertSketchKey = db.prepare(
    "INSERT INTO sketch_keys (code,reason,init,born,duration,type) VALUES (?,?,?,?,?,?);"
  );

  insertSketchKey.run(
    key.code,
    key.reason,
    key.init,
    key.born,
    key.duration,
    key.type
  );

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
});
