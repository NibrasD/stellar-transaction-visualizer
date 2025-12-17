/*
  # Create Contract Metadata Cache

  1. New Tables
    - `contract_metadata`
      - `contract_id` (text, primary key) - The contract address
      - `network` (text) - Network name (testnet/mainnet)
      - `spec` (jsonb) - Full contract specification from WASM
      - `functions` (jsonb) - Parsed function signatures
      - `is_token` (boolean) - Whether this is a token contract
      - `token_name` (text, nullable) - Token name if applicable
      - `token_symbol` (text, nullable) - Token symbol if applicable
      - `token_decimals` (integer, nullable) - Token decimals if applicable
      - `cached_at` (timestamptz) - When this was cached
      - `updated_at` (timestamptz) - Last update timestamp
  
  2. Indexes
    - Primary key on (contract_id, network)
    - Index on cached_at for cleanup
  
  3. Security
    - Enable RLS
    - Allow public read access (cached data is public)
    - Restrict writes to service role only
*/

CREATE TABLE IF NOT EXISTS contract_metadata (
  contract_id text NOT NULL,
  network text NOT NULL,
  spec jsonb,
  functions jsonb,
  is_token boolean DEFAULT false,
  token_name text,
  token_symbol text,
  token_decimals integer,
  cached_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (contract_id, network)
);

CREATE INDEX IF NOT EXISTS idx_contract_metadata_cached_at ON contract_metadata(cached_at);

ALTER TABLE contract_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to contract metadata"
  ON contract_metadata FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow service role to manage contract metadata"
  ON contract_metadata FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);