BEGIN;

CREATE TABLE IF NOT EXISTS player_wallets (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  jade integer NOT NULL DEFAULT 0 CHECK (jade >= 0),
  obsidian integer NOT NULL DEFAULT 0 CHECK (obsidian >= 0),
  gold integer NOT NULL DEFAULT 0 CHECK (gold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_progress (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mission_id varchar(40) NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, mission_id)
);

CREATE TABLE IF NOT EXISTS player_unlocks (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  unlock_type varchar(20) NOT NULL CHECK (unlock_type IN ('mascota','arena','ataque','skin')),
  unlock_id varchar(40) NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, unlock_type, unlock_id)
);

COMMIT;
