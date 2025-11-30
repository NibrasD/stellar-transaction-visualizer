# Stellar Transaction Visualizer

A powerful visualization tool and SDK for Stellar blockchain transactions with advanced Soroban smart contract support.

[![npm version](https://img.shields.io/npm/v/@nibrasd/transaction-visualizer.svg)](https://www.npmjs.com/package/@nibrasd/transaction-visualizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-NibrasD%2Fstellar--transaction--visualizer-blue)](https://github.com/NibrasD/stellar-transaction-visualizer)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Features](#features)
- [Configuration](#configuration)
- [Integration Options](#integration-options)
- [SDK API Overview](#sdk-api-overview)
- [Examples](#examples)
- [Documentation](#documentation)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Prerequisites

Before installing, ensure you have:

- **Node.js** >= 16.x
- **npm** >= 8.x (or **yarn** >= 1.22.x)
- **@stellar/stellar-sdk** >= 11.x (peer dependency)

## Installation

Install via npm:

```bash
npm install @nibrasd/transaction-visualizer
```

Or using yarn:

```bash
yarn add @nibrasd/transaction-visualizer
```

### Peer Dependencies

This package requires React as a peer dependency:

```bash
npm install react react-dom
```

**Note:** If you're only using the SDK functions (without React components), you can skip installing React.

## Quick Start

### Basic Usage

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

// Initialize with network configuration
const visualizer = new StellarTransactionVisualizer({
  isTestnet: true
});

// Fetch and analyze a transaction
try {
  const tx = await visualizer.getTransactionDetails('YOUR_TX_HASH');

  console.log('Status:', tx.status);
  console.log('Operations:', tx.operations.length);
  console.log('Smart Contracts:', visualizer.getSorobanOperations(tx).length);
} catch (error) {
  console.error('Failed to fetch transaction:', error);
}
```

### Standalone Functions

```typescript
import { fetchTransaction, setNetwork } from '@nibrasd/transaction-visualizer';

// Configure network
setNetwork({
  isTestnet: true,
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
});

// Fetch transaction with error handling
try {
  const transaction = await fetchTransaction('YOUR_TX_HASH');
  console.log('Transaction fetched:', transaction);
} catch (error) {
  console.error('Error:', error.message);
}
```

## Features

### Transaction Analysis
- Visualize all Stellar operation types
- Detailed operation breakdown with amounts, accounts, and assets
- Error detection and analysis
- Transaction status tracking
- Real-time transaction monitoring

### Smart Contract Support
- Extract and display contract IDs from invoke_host_function operations
- Identify plant, harvest, and custom contract functions
- Contract event visualization
- **Cross-contract call detection and visualization**
- State changes and TTL extension tracking
- Resource usage breakdown (fees, CPU, memory)

### Advanced Visualization
- Interactive flow diagrams showing operation sequences
- Color-coded operation types for quick identification
- Special icons for contract operations (plant 🌱, harvest 🌾)
- Path payment visualization with trading paths

### Transaction Simulation & Contract Testing
- Simulate transactions before submission (Testnet only)
- **Contract simulator with smart argument parsing**
  - Automatic Stellar address detection (G... and C... addresses)
  - Intelligent type conversion (u32, u64, i64)
  - Support for complex types (arrays, objects)
- Resource usage analysis
- Comprehensive debugging information
- Operation-level breakdowns

### Network Support
- Mainnet and Testnet compatibility
- Easy network switching
- Custom network configuration

## Configuration

### Configuration Options

All configuration options for `StellarTransactionVisualizer`:

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `isTestnet` | `boolean` | No | `false` | Use testnet network |
| `networkUrl` | `string` | No | Auto-detected | Custom Horizon URL |
| `networkPassphrase` | `string` | No | Auto-detected | Network passphrase |

### Network Configuration Examples

**Testnet Configuration:**
```typescript
const visualizer = new StellarTransactionVisualizer({
  isTestnet: true,
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
});
```

**Mainnet Configuration:**
```typescript
const visualizer = new StellarTransactionVisualizer({
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
});
```

**Default Configuration (Mainnet):**
```typescript
const visualizer = new StellarTransactionVisualizer();
// Automatically uses Mainnet with default settings
```

### Changing Network at Runtime

```typescript
const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

// Switch to mainnet
visualizer.setNetwork({
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
});
```

## Integration Options

This project can be integrated into your product in multiple ways:

### 1. NPM Package (Recommended)

Install and use in your React/JavaScript application:

```bash
npm install @nibrasd/transaction-visualizer
```

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';
```

### 2. Embedded Widget

Deploy the web app and embed it as an iframe:

```html
<!-- Basic embed -->
<iframe
  src="YOUR_DEPLOYMENT_URL?tx=TRANSACTION_HASH"
  width="100%"
  height="800px"
  frameborder="0"
  sandbox="allow-scripts allow-same-origin"
></iframe>
```

**Security Considerations:**
- Always deploy to HTTPS
- Use appropriate `sandbox` attributes
- Validate transaction hashes before embedding
- Consider CSP (Content Security Policy) headers

**URL Parameters:**
- `tx` - Transaction hash (required)
- `network` - Network type: `testnet` or `mainnet` (optional, default: `mainnet`)

Example:
```html
<iframe src="https://your-domain.com?tx=abc123&network=testnet"></iframe>
```

### 3. Direct SDK

Use the SDK functions directly without UI components for custom implementations:

```typescript
import {
  fetchTransaction,
  setNetwork,
  decodeScVal
} from '@nibrasd/transaction-visualizer';
```

**See integration examples:**
- [Quick Start Guide](./examples/quick-start.md) - Get started in 5 minutes
- [Complete Examples](./INTEGRATION_EXAMPLES.md) - Node.js, React, Next.js, Express
- [API Documentation](./SDK_DOCUMENTATION.md) - Full API reference

## SDK API Overview

### Class-based API (Recommended)

```typescript
const visualizer = new StellarTransactionVisualizer(config);

// Core methods
visualizer.getTransactionDetails(hash)      // Fetch and analyze transaction
visualizer.getSorobanOperations(tx)        // Extract smart contract operations
visualizer.getContractEvents(tx)           // Get contract events
visualizer.getStateChanges(tx)             // Get state changes
visualizer.getCrossContractCalls(tx)       // Get cross-contract calls
visualizer.getTransactionEffects(tx)       // Get transaction effects
visualizer.decodeScVal(scVal)              // Decode Soroban values
visualizer.setNetwork(config)              // Change network
```

### Standalone Functions

```typescript
import {
  fetchTransaction,      // Fetch transaction details
  setNetwork,           // Configure network
  decodeScVal,          // Decode Soroban values
  simulateTransaction   // Simulate transaction (testnet only)
} from '@nibrasd/transaction-visualizer';
```

**Full API documentation:** [SDK_DOCUMENTATION.md](./SDK_DOCUMENTATION.md)

## Examples

### Transaction Monitoring

```typescript
import { fetchTransaction, setNetwork } from '@nibrasd/transaction-visualizer';
import * as StellarSdk from '@stellar/stellar-sdk';

// Configure network
setNetwork({ isTestnet: true });

async function monitorAccount(accountId: string) {
  const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');

  let stream: any;

  try {
    stream = server
      .transactions()
      .forAccount(accountId)
      .cursor('now')
      .stream({
        onmessage: async (tx: any) => {
          try {
            const details = await fetchTransaction(tx.hash);
            console.log('New transaction:', {
              hash: tx.hash,
              status: details.status,
              operations: details.operations.length
            });
          } catch (error) {
            console.error('Error processing transaction:', error);
          }
        },
        onerror: (error: any) => {
          console.error('Stream error:', error);
        }
      });

    console.log('Monitoring account:', accountId);

    // Stop stream after 1 hour
    setTimeout(() => {
      if (stream) {
        stream();
        console.log('Stopped monitoring');
      }
    }, 3600000);

  } catch (error) {
    console.error('Failed to start monitoring:', error);
  }
}

// Usage
monitorAccount('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
```

### Path Payment Analysis

```typescript
import { fetchTransaction } from '@nibrasd/transaction-visualizer';

async function analyzePathPayment(txHash: string) {
  try {
    const tx = await fetchTransaction(txHash);

    tx.operations.forEach((operation, index) => {
      if (operation.type === 'path_payment_strict_send') {
        console.log(`\nPath Payment #${index + 1}:`);
        console.log('Send:', operation.sendAmount, operation.send_asset_code || 'XLM');
        console.log('Receive (min):', operation.destMin, operation.dest_asset_code || 'XLM');
        console.log('Path hops:', operation.path?.length || 0);

        if (operation.path && operation.path.length > 0) {
          console.log('Trading path:');
          operation.path.forEach((asset: any, i: number) => {
            console.log(`  ${i + 1}. ${asset.asset_code || 'XLM'}`);
          });
        }
      }
    });
  } catch (error) {
    console.error('Failed to analyze path payment:', error);
  }
}
```

### Smart Contract Analysis

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

async function analyzeSmartContract(txHash: string) {
  const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

  try {
    const tx = await visualizer.getTransactionDetails(txHash);
    const sorobanOps = visualizer.getSorobanOperations(tx);

    if (sorobanOps.length === 0) {
      console.log('No smart contract operations found');
      return;
    }

    console.log(`Found ${sorobanOps.length} smart contract operation(s)\n`);

    sorobanOps.forEach((op, index) => {
      console.log(`Contract Operation #${index + 1}:`);
      console.log('Contract ID:', op.contractId || 'Unknown');
      console.log('Function:', op.functionName || 'Unknown');

      if (op.resourceUsage) {
        console.log('\nResource Usage:');
        console.log('CPU Instructions:', op.resourceUsage.cpuInstructions);
        console.log('Memory (bytes):', op.resourceUsage.memoryBytes);
        console.log('Refundable Fee:', op.resourceUsage.refundableFee, 'stroops');
        console.log('Non-refundable Fee:', op.resourceUsage.nonRefundableFee, 'stroops');
      }

      if (op.crossContractCalls && op.crossContractCalls.length > 0) {
        console.log('\nCross-contract calls:');
        op.crossContractCalls.forEach(call => {
          console.log(`  ${call.fromContract} → ${call.toContract}`);
          console.log(`  Function: ${call.functionName || 'Unknown'}`);
          console.log(`  Status: ${call.success ? 'Success' : 'Failed'}`);
        });
      }

      console.log('\n---\n');
    });

    // Get contract events
    const events = visualizer.getContractEvents(tx);
    if (events.length > 0) {
      console.log(`Contract Events: ${events.length}`);
      events.forEach((event, i) => {
        console.log(`Event #${i + 1}:`, event);
      });
    }

  } catch (error) {
    console.error('Failed to analyze smart contract:', error);
  }
}
```

### Transaction Simulation

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

async function simulateContractCall() {
  const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

  try {
    const result = await visualizer.simulateTransaction({
      contractId: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      functionName: 'transfer',
      args: [
        'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // from
        'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // to
        '1000000' // amount (1 XLM in stroops)
      ],
      sourceAccount: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    });

    console.log('Simulation result:', result);
    console.log('Estimated fee:', result.minResourceFee);
    console.log('Success:', result.success);

  } catch (error) {
    console.error('Simulation failed:', error);
  }
}
```

## Operation Support

The visualizer supports all Stellar operations:

### Payments
- `payment` - Direct payments
- `path_payment_strict_send` - Path payments (strict send)
- `path_payment_strict_receive` - Path payments (strict receive)

### Account Management
- `create_account` - Account creation
- `account_merge` - Account merging
- `set_options` - Account configuration
- `bump_sequence` - Sequence number bumping

### Assets & Trust
- `change_trust` - Trustline creation/modification
- `allow_trust` - Trustline authorization
- `set_trust_line_flags` - Flag management
- `clawback` - Asset clawback

### Trading (DEX)
- `manage_sell_offer` - Create/update sell offers
- `manage_buy_offer` - Create/update buy offers
- `create_passive_sell_offer` - Passive offers

### Smart Contracts (Soroban)
- `invoke_host_function` - Contract invocations
- Special function detection (plant, harvest, swap, transfer)
- Contract ID extraction
- Event parsing
- Cross-contract call detection

### Sponsorship
- `begin_sponsoring_future_reserves`
- `end_sponsoring_future_reserves`
- `revoke_sponsorship`

## Documentation

📚 **[API Documentation](./SDK_DOCUMENTATION.md)** - Comprehensive API reference and examples

📚 **[Quick Reference](./QUICK_REFERENCE.md)** - Quick lookup for common patterns

📚 **[Integration Examples](./INTEGRATION_EXAMPLES.md)** - Real-world integration examples

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type {
  TransactionDetails,
  SorobanOperation,
  ContractEvent,
  NetworkConfig,
  ResourceUsage,
  CrossContractCall
} from '@nibrasd/transaction-visualizer';
```

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/NibrasD/stellar-transaction-visualizer.git
cd stellar-transaction-visualizer

# Install dependencies
npm install
```

### Build

```bash
# Build SDK for distribution
npm run build:sdk

# Build web application
npm run build:web

# Build everything (SDK + web app)
npm run build

# Run development server
npm run dev
```

### Project Structure

```
stellar-transaction-visualizer/
├── src/
│   ├── components/          # React components
│   │   ├── TransactionFlow.tsx
│   │   ├── OperationNode.tsx
│   │   ├── TransactionSearch.tsx
│   │   └── SimulationPanel.tsx
│   ├── services/
│   │   └── stellar.ts      # Core SDK functions
│   ├── types/
│   │   └── stellar.ts      # TypeScript definitions
│   └── sdk/
│       └── index.ts        # SDK entry point
├── examples/               # Integration examples
├── dist/                   # Build output
├── package.json
└── README.md
```

## Testing

### Run Tests

```bash
# Run all tests
npm test

# Run linter
npm run lint

# Run type checking
npm run type-check
```

### Testing Framework

This project uses:
- **ESLint** for code linting
- **TypeScript** for type checking
- Testing integration examples available in `/examples`

### Writing Tests

When contributing, ensure your code:
1. Passes TypeScript compilation
2. Follows ESLint rules
3. Includes proper error handling
4. Has examples in documentation

### Getting Help

If you encounter issues not covered here:

1. Check [GitHub Issues](https://github.com/NibrasD/stellar-transaction-visualizer/issues)
2. Review [API Documentation](./SDK_DOCUMENTATION.md)

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome/Edge | ✅ Latest 2 versions |
| Firefox | ✅ Latest 2 versions |
| Safari | ✅ Latest 2 versions |
| Mobile Safari | ✅ iOS 13+ |
| Chrome Mobile | ✅ Android 8+ |

## Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
   - Write clean, documented code
   - Follow existing code style
   - Add tests if applicable
4. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
5. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
6. **Open a Pull Request**

### Contribution Guidelines

- Follow TypeScript best practices
- Maintain test coverage
- Update documentation for new features
- Keep commits atomic and well-described
- Be respectful and constructive

## Resources

- [Stellar Documentation](https://developers.stellar.org)
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [Stellar Laboratory](https://laboratory.stellar.org)
- [Full API Documentation](./SDK_DOCUMENTATION.md)

## License

MIT License © 2025 NibrasD

## Support

- **GitHub Issues:** [Report bugs or request features](https://github.com/NibrasD/stellar-transaction-visualizer/issues)

## Acknowledgments

Built with:
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [React Flow](https://reactflow.dev)
- [Vite](https://vitejs.dev)
- [TypeScript](https://www.typescriptlang.org)

---

**⭐ If you find this project helpful, please consider giving it a star on [GitHub](https://github.com/NibrasD/stellar-transaction-visualizer)!**
