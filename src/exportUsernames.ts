import { DBUser, db } from "./db";

db.connect();

let out = "";

for (const user of (await db.query<DBUser>(`SELECT * FROM usersv2;`)).rows)
  out += user.username + "\n";

console.log(out);

await db.end();
