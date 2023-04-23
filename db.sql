-- Enable the pgcrypto extension for generating random bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the token_data table
CREATE TABLE token_data (
    id SERIAL PRIMARY KEY,
    current_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'base64'),
    previous_token TEXT,
    workink_token TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uses INTEGER NOT NULL DEFAULT 0,
    lastDIY BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(previous_token),
    UNIQUE(current_token),
    UNIQUE(workink_token)
);