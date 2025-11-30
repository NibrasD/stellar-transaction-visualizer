# Stellar Transaction Visualizer SDK

A comprehensive TypeScript SDK for visualizing and analyzing Stellar blockchain transactions, with advanced support for Soroban smart contracts.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Features](#core-features)
- [API Reference](#api-reference)
- [Advanced Usage](#advanced-usage)
- [Smart Contract Support](#smart-contract-support)
- [Examples](#examples)
- [TypeScript Support](#typescript-support)

## Installation

```bash
npm install @nibrasd/transaction-visualizer
```

### Peer Dependencies

```json
{
  "@stellar/stellar-sdk": "^11.1.0",
  "react": ">=16.8.0",
  "react-dom": ">=16.8.0"
}
```

## Quick Start

### Basic Transaction Visualization

```typescript
import {
  fetchTransaction,
  createOperationNodes,
  createOperationEdges
} from '@nibrasd/transaction-visualizer';

// Fetch and visualize a transaction
const txDetails = await fetchTransaction('YOUR_TX_HASH');
const nodes = createOperationNodes(txDetails);
const edges = createOperationEdges(txDetails);

console.log('Transaction operations:', nodes);
console.log('Operation flow:', edges);
```

### React Component Integration

```tsx
import { TransactionFlow } from '@nibrasd/transaction-visualizer';

function MyApp() {
  return (
    <TransactionFlow
      transaction={txDetails}
      onNodeClick={(node) => console.log('Clicked:', node)}
    />
  );
}
```

## Core Features

### 1. Transaction Fetching

Fetch detailed transaction information from Stellar Horizon API:

```typescript
import { fetchTransaction } from '@nibrasd/transaction-visualizer';

const transaction = await fetchTransaction(
  'YOUR_TRANSACTION_HASH'
);

// Returns: TransactionDetails object
// - hash: Transaction hash
// - sourceAccount: Source account address
// - fee: Transaction fee
// - operations: Array of operations
// - status: 'success' | 'failed' | 'pending'
// - sorobanOperations: Smart contract operations
// - events: Contract events
```

### 2. Network Configuration

Switch between Stellar networks:

```typescript
import { setNetwork } from '@nibrasd/transaction-visualizer';

// Mainnet
setNetwork({
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
});

// Testnet
setNetwork({
  isTestnet: true,
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
});
```

### 3. Operation Visualization

Create visual node representations of operations:

```typescript
import { createOperationNodes, createOperationEdges } from '@nibrasd/transaction-visualizer';

// Create nodes for each operation
const nodes = createOperationNodes(transaction);
// Each node contains:
// - id: Unique identifier
// - type: 'operationNode'
// - data: Operation details (type, amounts, accounts, etc.)
// - position: { x, y } coordinates for layout

// Create edges showing operation flow
const edges = createOperationEdges(transaction);
// Each edge connects operations in sequence
```

## API Reference

### Core Functions

#### `fetchTransaction(hash: string): Promise<TransactionDetails>`

Fetches comprehensive transaction details from Horizon API.

**Parameters:**
- `hash` (string): The transaction hash

**Returns:** Promise resolving to TransactionDetails object

**Throws:** Error if transaction not found or network error

**Example:**
```typescript
try {
  const tx = await fetchTransaction(
    'a1b2c3d4e5f6...'
  );
  console.log(`Transaction fee: ${tx.fee}`);
  console.log(`Operations: ${tx.operations.length}`);
} catch (error) {
  console.error('Failed to fetch:', error);
}
```

#### `setNetwork(config: NetworkConfig): void`

Configures the network for all API calls.

**Parameters:**
- `config` (NetworkConfig): Network configuration object
  - `isTestnet` (boolean): Whether to use testnet
  - `networkUrl` (string): Horizon API URL
  - `networkPassphrase` (string): Network passphrase

**Example:**
```typescript
// Custom network (use your own Horizon instance)
setNetwork({
  isTestnet: false,
  networkUrl: 'https://your-custom-horizon-server.com',
  networkPassphrase: 'Your Custom Network Passphrase'
});
```

#### `createOperationNodes(transaction: TransactionDetails): Node[]`

Converts transaction operations into visual nodes.

**Returns:** Array of ReactFlow Node objects

#### `createOperationEdges(transaction: TransactionDetails): Edge[]`

Creates edges connecting operation nodes.

**Returns:** Array of ReactFlow Edge objects

## Advanced Usage

### Error Handling

```typescript
import { fetchTransaction } from '@nibrasd/transaction-visualizer';

async function safelyFetchTransaction(hash: string) {
  try {
    const tx = await fetchTransaction(hash);

    if (tx.status === 'failed') {
      console.error('Transaction failed:', tx.errorMessage);
      tx.operationErrors?.forEach((err, idx) => {
        console.error(`Op ${idx}: ${err}`);
      });
    }

    return tx;
  } catch (error) {
    if (error.message.includes('not found')) {
      console.error('Transaction does not exist');
    } else if (error.message.includes('network')) {
      console.error('Network error - retry later');
    }
    throw error;
  }
}
```

### Custom Operation Filtering

```typescript
function filterPaymentOperations(transaction: TransactionDetails) {
  return transaction.operations.filter(op =>
    op.type === 'payment' ||
    op.type === 'path_payment_strict_send' ||
    op.type === 'path_payment_strict_receive'
  );
}

function getTotalPaymentAmount(transaction: TransactionDetails) {
  const payments = filterPaymentOperations(transaction);
  return payments.reduce((total, op) => {
    const amount = parseFloat(op.amount || '0');
    return total + amount;
  }, 0);
}
```

### Working with Smart Contracts

```typescript
function extractContractCalls(transaction: TransactionDetails) {
  return transaction.sorobanOperations?.map(op => ({
    contractId: op.contractId,
    function: op.functionName,
    arguments: op.args,
    result: op.result,
    success: !op.error
  })) || [];
}

// Example: Find all "harvest" operations
function findHarvestOperations(transaction: TransactionDetails) {
  return transaction.sorobanOperations?.filter(
    op => op.functionName === 'harvest'
  ) || [];
}
```

## Smart Contract Support

### Contract ID Extraction

The SDK automatically extracts contract IDs from invoke_host_function operations:

```typescript
const tx = await fetchTransaction('TX_HASH');
const contractOps = tx.operations.filter(
  op => op.type === 'invoke_host_function'
);

contractOps.forEach(op => {
  console.log('Contract ID:', op.contractId);
  console.log('Function:', op.functionName);
});
```

### Special Function Detection

The SDK recognizes common DeFi operations:

- **Plant**: Staking/depositing assets
- **Harvest**: Collecting rewards/yields
- **Swap**: Token exchanges
- **Transfer**: Asset transfers

```typescript
// Check if transaction contains harvest operations
function hasHarvestOperation(tx: TransactionDetails): boolean {
  return tx.sorobanOperations?.some(
    op => op.functionName === 'harvest'
  ) || false;
}
```

### Contract Event Handling

```typescript
// Extract contract events
function getContractEvents(transaction: TransactionDetails) {
  return transaction.events?.map(event => ({
    contract: event.contractId,
    type: event.type,
    data: event.data
  })) || [];
}

// Filter events by contract
function getEventsForContract(
  transaction: TransactionDetails,
  contractId: string
) {
  return transaction.events?.filter(
    event => event.contractId === contractId
  ) || [];
}
```

## Examples

### Example 1: Transaction Explorer

```typescript
import {
  fetchTransaction,
  createOperationNodes
} from '@nibrasd/transaction-visualizer';

async function exploreTransaction(hash: string) {
  const tx = await fetchTransaction(hash);

  console.log('Transaction Details:');
  console.log('==================');
  console.log(`Hash: ${tx.hash}`);
  console.log(`Status: ${tx.status}`);
  console.log(`Fee: ${tx.fee} stroops`);
  console.log(`Operations: ${tx.operations.length}`);

  tx.operations.forEach((op, idx) => {
    console.log(`\nOperation ${idx + 1}:`);
    console.log(`  Type: ${op.type}`);

    if (op.type === 'payment') {
      console.log(`  Amount: ${op.amount} ${op.asset}`);
      console.log(`  From: ${op.from}`);
      console.log(`  To: ${op.to}`);
    } else if (op.type === 'invoke_host_function') {
      console.log(`  Contract: ${op.contractId}`);
      console.log(`  Function: ${op.functionName}`);
    }
  });
}
```

### Example 2: Real-time Monitoring

```typescript
class TransactionMonitor {
  private lastCheckedLedger = 0;

  async watchForPayments(accountId: string) {
    setInterval(async () => {
      try {
        // Fetch recent account transactions
        const server = new StellarSdk.Server(networkUrl);
        const txs = await server
          .transactions()
          .forAccount(accountId)
          .limit(10)
          .order('desc')
          .call();

        for (const tx of txs.records) {
          const details = await fetchTransaction(tx.hash);
          const payments = details.operations.filter(
            op => op.type === 'payment'
          );

          if (payments.length > 0) {
            console.log(`New payment in ${tx.hash}`);
            payments.forEach(payment => {
              console.log(`  ${payment.amount} ${payment.asset}`);
            });
          }
        }
      } catch (error) {
        console.error('Monitoring error:', error);
      }
    }, 5000); // Check every 5 seconds
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  TransactionDetails,
  NetworkConfig,
  SorobanOperation,
  ContractEvent,
  SimulationResult,
  OperationNode
} from '@nibrasd/transaction-visualizer';

// All types are fully documented
const config: NetworkConfig = {
  isTestnet: true,
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
};
```

### Key Type Definitions

```typescript
interface TransactionDetails {
  hash: string;
  sourceAccount: string;
  fee: string;
  operations: any[];
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
  operationErrors?: string[];
  sorobanOperations?: SorobanOperation[];
  events?: ContractEvent[];
  ledgerTimestamp: number;
}

interface SorobanOperation {
  type: 'soroban';
  contractId: string;
  functionName: string;
  args: any[];
  result?: any;
  error?: string;
}

interface ContractEvent {
  contractId: string;
  type: string;
  data: any;
}

interface SimulationResult {
  success: boolean;
  estimatedFee: string;
  potentialErrors: string[];
  resourceUsage: {
    cpuUsage: number;
    memoryUsage: number;
  };
}
```

## Best Practices

### 1. Network Configuration

Always set network configuration before making API calls:

```typescript
import { setNetwork } from '@nibrasd/transaction-visualizer';

// Set once at app initialization
setNetwork({
  isTestnet: process.env.NODE_ENV === 'development',
  networkUrl: process.env.HORIZON_URL,
  networkPassphrase: process.env.NETWORK_PASSPHRASE
});
```

### 2. Error Handling

Always handle errors when fetching transactions:

```typescript
try {
  const tx = await fetchTransaction(hash);
  // Process transaction
} catch (error) {
  // Handle errors appropriately
  console.error('Failed to fetch transaction:', error);
}
```

### 3. Performance

For large-scale applications, consider caching:

```typescript
const txCache = new Map<string, TransactionDetails>();

async function getCachedTransaction(hash: string) {
  if (txCache.has(hash)) {
    return txCache.get(hash)!;
  }

  const tx = await fetchTransaction(hash);
  txCache.set(hash, tx);
  return tx;
}
```


## Troubleshooting

### Common Issues

**Issue:** "Transaction not found"
- Verify the transaction hash is correct
- Ensure you're on the right network (testnet vs mainnet)
- Check if the transaction has been confirmed

**Issue:** "Network timeout"
- Check your internet connection
- Verify Horizon API URL is accessible
- Consider implementing retry logic

**Issue:** "Contract ID extraction failed"
- This is normal for mainnet transactions (limited XDR access)
- The SDK provides fallback identification methods
- Contract IDs may appear as "Mainnet_Contract_Op1" placeholders

## Support

For issues and feature requests, please visit:
- GitHub: [stellar/transaction-visualizer](https://github.com/nibrasd/stellar-transaction-visualizer)
- Documentation: [developers.stellar.org](https://developers.stellar.org)

## License

MIT License - see LICENSE file for details
