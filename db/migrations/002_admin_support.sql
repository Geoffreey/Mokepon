BEGIN;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role varchar(16) NOT NULL DEFAULT 'player';
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_role_check CHECK (role IN ('player','admin'));
CREATE INDEX IF NOT EXISTS accounts_admins_idx ON accounts (role) WHERE role='admin';

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS audit_events_actor_date_idx ON audit_events (actor_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS support_notes (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  note varchar(1000) NOT NULL CHECK (char_length(trim(note)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_notes_account_date_idx ON support_notes (account_id, created_at DESC);

COMMIT;
