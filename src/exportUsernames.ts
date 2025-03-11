import { analytics_user, db } from "./db";

let out = "";

for (const user of db
  .prepare<[], analytics_user>(`SELECT * FROM usersv2 WHERE level >= 12;`)
  .all())
  out += user.username + "\n";

console.log(out);

db.close();
