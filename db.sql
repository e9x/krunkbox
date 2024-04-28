CREATE TABLE users(
  id TEXT PRIMARY KEY,
  username TEXT,
  UNIQUE(id, username)
);

CREATE TABLE usersv2(
  id TEXT NOT NULL PRIMARY KEY UNIQUE,
  username TEXT NOT NULL,
  level INT NOT NULL,
  seen TIMESTAMP DEFAULT
);
