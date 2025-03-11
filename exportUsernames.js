#!/usr/bin/env node
import { db } from "./db.js";

let out = "";

for (const user of db.prepare("SELECT * FROM usersv2 WHERE level >= 12;").all())
  out += user.username + "\n";

console.log(out);

db.close();
