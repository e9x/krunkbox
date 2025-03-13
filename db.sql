CREATE TABLE usersv2 (
  id TEXT NOT NULL PRIMARY KEY,
  username TEXT NOT NULL,
  level INT NOT NULL,
  game TEXT,
  seen DATETIME
);

-- free =      valid until uses exceeds 45
-- pro  =      valid until born + duration
-- unlimited = valid

CREATE TABLE sketch_keys (
  code TEXT NOT NULL PRIMARY KEY UNIQUE, -- might be work.ink token
  reason TEXT, -- why do u exist?
  init DATETIME NOT NULL,
  born DATETIME, -- first used
  duration INTEGER, -- don't specify if work.ink
  type INTEGER NOT NULL, -- 0 free, 1 pro, 2, unlimited
  uses INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE api_tokens (
  token TEXT NOT NULL PRIMARY KEY UNIQUE,
  code TEXT NOT NULL,
  born DATETIME NOT NULL,
  ip TEXT NOT NULL, -- creation ip//// binding this to an ip would be annoying as fuck
  FOREIGN KEY (code) REFERENCES sketch_keys (code) 
);

CREATE TABLE key_users (
  code TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  account_username TEXT NOT NULL,
  last_token TEXT NOT NULL,
  last_ip TEXT NOT NULL,
  born DATETIME NOT NULL,
  seen DATETIME NOT NULL,
  record INTEGER NOT NULL
);
