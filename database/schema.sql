CREATE TABLE IF NOT EXISTS swaps (
  id BIGSERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  log_index BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  user_address TEXT NOT NULL,
  token_in TEXT NOT NULL,
  amount_in TEXT NOT NULL,
  amount_out TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS swaps_tx_log_idx
  ON swaps (tx_hash, log_index);
