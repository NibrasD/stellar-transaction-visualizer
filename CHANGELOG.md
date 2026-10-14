# Changelog

All notable changes to the Stellar Transaction Visualizer project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-14

### Security
- **Supabase Policies**: Revoked public `INSERT` and `UPDATE` permissions on `contract_metadata` table; writes are now strictly protected and restricted to authenticated backend/service role.
- **Edge Function Hardening**: Added strict 56-character StrKey validation for `contractId`, whitelist validation for `tokenFunction`, CORS origin restriction, and multi-endpoint RPC fallback resilience.
- **Client Sanitization**: Disabled unauthenticated client-side direct upserts to Supabase metadata store.

### Added
- **Dual Module SDK (ESM & CJS)**: Built bundled outputs (`dist/sdk/index.js` and `dist/sdk/index.cjs`) along with full declaration files (`dist/sdk/index.d.ts`), enabling zero-config usage in both Node.js (`require` and `import`) and modern frontend bundlers.
- **Export Alignment**: Exported `simulateTransaction`, `createOperationNodes`, `createOperationEdges`, and `simpleContractMetadataService` directly from the SDK root.
- **Automated Test Suite**: Added Vitest test suite covering instance isolation, ScVal decoding, operation edge construction, and network configuration.
- **Continuous Integration**: Added GitHub Actions CI workflow for automated type checking, testing, and building.

### Fixed
- **TypeScript Strictness**: Resolved ~195 compilation errors across the codebase, including StrKey Buffer encoding, Soroban simulation response unpacking, balance change summaries, and operation edge typing.
- **SDK State Encapsulation**: Refactored `StellarTransactionVisualizer` class to maintain isolated network configuration and Horizon instances per class instance, eliminating cross-instance race conditions.
- **Redundant Horizon Requests**: Eliminated duplicate HTTP roundtrips when transaction XDR metadata is already provided by Horizon.
- **Network Defaults**: Harmonized network configuration defaults to Testnet across visualizer and SDK classes.
- **Removed Deprecated Dependencies**: Dropped `soroban-client` in favor of `@stellar/stellar-sdk`.

### Removed
- Removed 2.2MB duplicate JSON dataset (`api/projects_enriched.json`).
- Removed fake mock contract IDs (`Mainnet_Contract_Op1`, etc.) from core services.

## [0.1.0] - Initial Release
- Initial release of Stellar Transaction Visualizer with classic operations and Soroban smart contract support.
