BEGIN;
CREATE TABLE casino_plays (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_round_id uuid NOT NULL, game text NOT NULL CHECK (game = 'dados-ajaw'),
  currency text NOT NULL CHECK (currency IN ('jade','obsidian','gold')),
  bet integer NOT NULL CHECK (bet > 0), choice text NOT NULL CHECK (choice IN ('bajo','siete','alto')),
  die_one smallint NOT NULL CHECK (die_one BETWEEN 1 AND 6), die_two smallint NOT NULL CHECK (die_two BETWEEN 1 AND 6),
  payout integer NOT NULL CHECK (payout >= 0), net integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, client_round_id)
);
CREATE INDEX casino_plays_account_created_idx ON casino_plays(account_id, created_at DESC);
COMMIT;
