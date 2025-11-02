# Changelog

All notable changes to the Stellar Transaction Visualizer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-10-01

### Added

#### Core Features
- **Transaction Fetching**: Comprehensive transaction details from Stellar Horizon API
- **Network Support**: Seamless switching between Mainnet and Testnet
- **Operation Visualization**: Convert all Stellar operations into visual flow diagrams
- **Transaction Simulation**: Pre-execution simulation with resource usage analysis (Testnet)

#### Smart Contract Support
- **Contract ID Extraction**: Automatic extraction from `invoke_host_function` operations using 5 different methods:
  - Direct field extraction from operation response
  - Parameters array parsing with XDR decoding
  - Host function XDR analysis
  - Soroban RPC integration
  - Transaction envelope analysis
- **Contract Search**: Find all transactions for a specific contract ID
- **Function Detection**: Identify and highlight special functions (plant, harvest, swap, etc.)
- **Event Parsing**: Extract and display contract events from transaction metadata

#### Visual Enhancements
- **Special Function Icons**:
  - 🌱 Sprout icon for "plant" operations
  - 🌾 Wheat icon for "harvest" operations
  - 🔄 Swap icon for exchange operations
- **Operation Details**: Enhanced visualization for all operation types:
  - Payment operations with amounts and assets
  - Path payments with trading paths and intermediate hops
  - DEX operations with selling/buying details and prices
  - Account operations with balance and sequence info
  - Trust operations with asset and flag details
- **Contract Call Boxes**: Highlighted displays for contract interactions
- **Error Indicators**: Clear visual feedback for failed operations

#### Path Payment Improvements
- **Strict Send Visualization**:
  - Exact send amount with asset details
  - Minimum destination amount
  - Trading path with all intermediate assets
- **Strict Receive Visualization**:
  - Maximum send amount
  - Exact receive amount with asset details
  - Complete path visualization

#### API Enhancements
- `fetchTransaction(hash)`: Fetch detailed transaction information
- `fetchContractTransactions(contractId)`: Search by contract ID
- `setNetwork(config)`: Configure network settings
- `createOperationNodes(transaction)`: Generate visual nodes
- `createOperationEdges(transaction)`: Create operation flow
- `simulateTransaction(hash)`: Simulate execution (Testnet)

#### Developer Experience
- **TypeScript Support**: Full type definitions for all functions
- **Comprehensive Documentation**:
  - README with quick start guide
  - SDK_DOCUMENTATION.md with detailed API reference
  - Code examples for common use cases
- **React Components**: Pre-built UI components for easy integration
- **Error Handling**: Detailed error messages and analysis
- **Debug Logging**: Extensive console logging for troubleshooting

### Technical Improvements

#### Contract ID Extraction
- Method 0: Direct field extraction from operation object
- Method 0.5: Parameters array with base64 XDR decoding
- Method 1: Host function XDR parsing
- Method 2: Parameter value extraction
- Method 3: Soroban RPC transaction fetching
- Method 4: Transaction envelope analysis
- Fallback: Graceful degradation with descriptive placeholders

#### Performance
- Efficient XDR parsing with error handling
- Cached network configuration
- Optimized React Flow rendering
- Minimal re-renders with proper memoization

#### Reliability
- Multiple fallback methods for data extraction
- Comprehensive error catching
- Network error handling
- Transaction validation

### Documentation

#### README.md
- Quick start guide
- Installation instructions
- Basic usage examples
- Feature overview
- Smart contract capabilities
- Development guide

#### SDK_DOCUMENTATION.md
- Complete API reference
- Detailed function documentation
- Advanced usage patterns
- Smart contract integration guide
- Error handling best practices
- TypeScript type definitions
- Real-world examples

### Build & Distribution

- Web application build with Vite
- SDK distribution with TypeScript declarations
- Optimized bundle size
- ES modules support
- CommonJS compatibility

### Browser Compatibility

- Chrome/Edge: Latest 2 versions ✅
- Firefox: Latest 2 versions ✅
- Safari: Latest 2 versions ✅

### Known Limitations

- Contract ID extraction on Mainnet has limited XDR access from Horizon API
  - Fallback identifiers provided (e.g., "Mainnet_Contract_Op1")
  - Full extraction works on Testnet
- Transaction simulation only available on Testnet
- Large transaction visualizations may impact performance

### Dependencies

#### Core
- `@stellar/stellar-sdk` ^11.1.0
- `react` ^18.2.0
- `react-dom` ^18.2.0

#### UI
- `reactflow` ^11.10.4
- `lucide-react` ^0.294.0
- `@radix-ui/react-tabs` ^1.0.4
- `@radix-ui/react-switch` ^1.0.3
- `@radix-ui/react-tooltip` ^1.0.7

### Development Dependencies
- TypeScript ^5.2.2
- Vite ^5.0.0
- Tailwind CSS ^3.3.5
- ESLint ^8.53.0

## Upcoming Features

### Planned for 0.2.0
- [ ] Enhanced contract analytics dashboard
- [ ] Transaction comparison tool
- [ ] Export functionality (JSON, CSV)
- [ ] Custom operation filters
- [ ] Performance optimizations for large transactions
- [ ] WebSocket streaming for real-time updates

### Under Consideration
- [ ] Historical transaction analysis
- [ ] Contract interaction diagrams
- [ ] Gas usage predictions
- [ ] Integration with popular wallets
- [ ] GraphQL API support
- [ ] Multi-transaction batching visualization

## Migration Guide

### From Previous Versions

This is the initial release (0.1.0), so no migration is necessary.

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/stellar/transaction-visualizer/issues
- Stellar Discord: https://discord.gg/stellar
- Stack Exchange: https://stellar.stackexchange.com

## License

MIT © Stellar Development Foundation

---

**Note**: This changelog follows semantic versioning. For breaking changes, we will bump the major version.
