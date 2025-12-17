/*
  # Allow Public Writes to Contract Metadata Cache

  1. Changes
    - Add INSERT policy for public (anon) role
    - Add UPDATE policy for public (anon) role
    - This allows the frontend to cache contract metadata

  2. Security Rationale
    - Contract metadata is public blockchain data
    - The table is just a performance cache
    - No sensitive or user-specific data
    - Multiple users can safely cache the same contract
    - Primary key constraint prevents duplicates

  3. Notes
    - Existing SELECT policy allows public reads
    - Service role retains full access
    - Cache improves app performance for all users
*/

-- Allow public to insert new contract metadata
CREATE POLICY "Allow public insert of contract metadata"
  ON contract_metadata FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow public to update existing contract metadata
CREATE POLICY "Allow public update of contract metadata"
  ON contract_metadata FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);