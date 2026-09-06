BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_uq ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_account_date_idx ON password_reset_tokens (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_pending_expiry_idx ON password_reset_tokens (expires_at) WHERE used_at IS NULL;

COMMIT;
