CREATE TABLE usersv2 (
  id TEXT NOT NULL PRIMARY KEY,
  username TEXT NOT NULL,
  level INT NOT NULL,
  seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE token_data (
    id INTEGER PRIMARY KEY,
    current_token TEXT NOT NULL,
    previous_token TEXT,
    workink_token TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uses INTEGER NOT NULL DEFAULT 0,
    last_diy INTEGER NOT NULL DEFAULT 0,
    lifetime INTEGER NOT NULL DEFAULT 0,
    UNIQUE (previous_token),
    UNIQUE (current_token),
    UNIQUE (workink_token)
);