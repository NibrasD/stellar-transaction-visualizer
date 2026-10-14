/*
  # Revoke Public Writes to Contract Metadata Cache & Enforce Security

  1. Security Changes
    - Drop public INSERT policy (prevents anonymous users from poisoning cache)
    - Drop public UPDATE policy (prevents anonymous users from modifying token symbols/specs)
    - Ensure public only has SELECT access (read-only)
    - Ensure service_role has full management permissions (Edge Function writes via service role)

  2. Security Rationale
    - Public writes allowed any unauthenticated client to overwrite `token_symbol`, `spec`, and `functions`
    - In a financial transaction visualizer, spoofed token metadata (e.g., impersonating USDC) is a critical vulnerability
    - Writes must now occur only through authenticated Edge Functions using the Supabase Service Role key
*/

-- Revoke public write policies
DROP POLICY IF EXISTS "Allow public insert of contract metadata" ON contract_metadata;
DROP POLICY IF EXISTS "Allow public update of contract metadata" ON contract_metadata;

-- Ensure read-only access for public
DROP POLICY IF EXISTS "Allow public read access to contract metadata" ON contract_metadata;
CREATE POLICY "Allow public read access to contract metadata"
  ON contract_metadata FOR SELECT
  TO public
  USING (true);

-- Ensure service role has full access
DROP POLICY IF EXISTS "Allow service role to manage contract metadata" ON contract_metadata;
CREATE POLICY "Allow service role to manage contract metadata"
  ON contract_metadata FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
