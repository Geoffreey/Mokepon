BEGIN;

CREATE TABLE combat_economy_events (
  id uuid PRIMARY KEY,
  source_type text NOT NULL CHECK (source_type IN ('machine','pvp')),
  source_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  opponent_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('victoria','derrota','empate')),
  jade_delta integer NOT NULL DEFAULT 0,
  obsidian_delta integer NOT NULL DEFAULT 0,
  gold_delta integer NOT NULL DEFAULT 0,
  capped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, account_id)
);

CREATE INDEX combat_economy_daily_idx ON combat_economy_events (account_id, source_type, created_at DESC);

COMMIT;
