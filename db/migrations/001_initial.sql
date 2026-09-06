BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  username varchar(24) NOT NULL,
  display_name varchar(20) NOT NULL,
  email varchar(254) NOT NULL,
  password_salt text NOT NULL,
  password_hash char(128) NOT NULL,
  active boolean NOT NULL DEFAULT false,
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  battles_count integer NOT NULL DEFAULT 0 CHECK (battles_count >= 0),
  wins_count integer NOT NULL DEFAULT 0 CHECK (wins_count >= 0),
  losses_count integer NOT NULL DEFAULT 0 CHECK (losses_count >= 0),
  draws_count integer NOT NULL DEFAULT 0 CHECK (draws_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_username_normalized CHECK (username = lower(username)),
  CONSTRAINT accounts_email_normalized CHECK (email = lower(email)),
  CONSTRAINT accounts_results_total CHECK (battles_count = wins_count + losses_count + draws_count)
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_uq ON accounts (username);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_uq ON accounts (email);
CREATE INDEX IF NOT EXISTS accounts_leaderboard_idx ON accounts (points DESC, wins_count DESC) WHERE active;

CREATE TABLE IF NOT EXISTS account_activations (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  code_hash char(64) NOT NULL,
  resend_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_activations_expiry_idx ON account_activations (expires_at);

CREATE TABLE IF NOT EXISTS account_sessions (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_sessions_token_uq ON account_sessions (token_hash);
CREATE INDEX IF NOT EXISTS account_sessions_account_expiry_idx ON account_sessions (account_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx ON account_sessions (expires_at);

CREATE TABLE IF NOT EXISTS battles (
  id uuid PRIMARY KEY,
  player_one_id uuid NOT NULL REFERENCES accounts(id),
  player_two_id uuid NOT NULL REFERENCES accounts(id),
  player_one_guardian varchar(20),
  player_two_guardian varchar(20),
  player_one_rounds smallint NOT NULL CHECK (player_one_rounds BETWEEN 0 AND 5),
  player_two_rounds smallint NOT NULL CHECK (player_two_rounds BETWEEN 0 AND 5),
  played_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT battles_distinct_players CHECK (player_one_id <> player_two_id)
);
CREATE INDEX IF NOT EXISTS battles_player_one_date_idx ON battles (player_one_id, played_at DESC);
CREATE INDEX IF NOT EXISTS battles_player_two_date_idx ON battles (player_two_id, played_at DESC);

CREATE TABLE IF NOT EXISTS battle_results (
  battle_id uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  opponent_id uuid NOT NULL REFERENCES accounts(id),
  result varchar(8) NOT NULL CHECK (result IN ('victoria', 'derrota', 'empate')),
  points_awarded smallint NOT NULL CHECK (points_awarded IN (5, 10, 30)),
  rounds_for smallint NOT NULL CHECK (rounds_for BETWEEN 0 AND 5),
  rounds_against smallint NOT NULL CHECK (rounds_against BETWEEN 0 AND 5),
  PRIMARY KEY (battle_id, account_id),
  CONSTRAINT battle_results_distinct_players CHECK (account_id <> opponent_id)
);
CREATE INDEX IF NOT EXISTS battle_results_history_idx ON battle_results (account_id, battle_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event varchar(64) NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  username varchar(24),
  ip varchar(64) NOT NULL,
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent varchar(300) NOT NULL DEFAULT '',
  success boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS audit_events_account_date_idx ON audit_events (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_event_date_idx ON audit_events (event, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_failures_idx ON audit_events (occurred_at DESC) WHERE NOT success;

COMMIT;
