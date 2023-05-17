-- Enable the pgcrypto extension for generating random bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE token_data (
    id SERIAL PRIMARY KEY,
    current_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'base64'),
    previous_token TEXT,
    workink_token TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uses INTEGER NOT NULL DEFAULT 0,
    last_diy BOOLEAN NOT NULL DEFAULT FALSE,
    lifetime BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (previous_token),
    UNIQUE (current_token),
    UNIQUE (workink_token)
);

CREATE TABLE lv_token_data (
    id SERIAL PRIMARY KEY,
    current_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'base64'),
    previous_token TEXT,
    linkvertise_token TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    useragent TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uses INTEGER NOT NULL DEFAULT 0,
    last_diy BOOLEAN NOT NULL DEFAULT FALSE,
    lifetime BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (previous_token),
    UNIQUE (current_token)
);

CREATE TABLE temp_tokens (
    id SERIAL PRIMARY KEY,
    value TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'base64'),
    ip_address TEXT NOT NULL,
    useragent TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    done BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (value)
);

CREATE TABLE temp_access_tokens (
    id SERIAL PRIMARY KEY,
    value TEXT NOT NULL DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    useragent TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    done BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (value)
);
