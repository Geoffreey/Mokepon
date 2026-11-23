BEGIN;
CREATE TABLE arcade_runs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  level_id varchar(24) NOT NULL CHECK (level_id IN ('selva','ruinas','volcan')),
  guardian varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  reward jsonb
);
CREATE INDEX arcade_runs_account_created ON arcade_runs(account_id,created_at DESC);
CREATE TABLE arcade_progress (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  level_id varchar(24) NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id,level_id)
);
COMMIT;
