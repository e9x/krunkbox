CREATE TABLE users(
  id TEXT PRIMARY KEY,
  username TEXT,
  --ip INET,
  UNIQUE(id, username)
);
