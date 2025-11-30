# Quick Reference Card

Essential commands and patterns for the Stellar Transaction Visualizer SDK.

## Installation

```bash
npm install @nibrasd/transaction-visualizer
```

## Basic Usage

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

const visualizer = new StellarTransactionVisualizer({ isTestnet: true });
const tx = await visualizer.getTransactionDetails('TX_HASH');
```

## Main API

### Class Methods

```typescript
// Initialize
const visualizer = new StellarTransactionVisualizer(config);

// Fetch transaction
visualizer.getTransactionDetails(hash)        // → Promise<TransactionDetails>

// Extract data
visualizer.getSorobanOperations(tx)          // → SorobanOperation[]
visualizer.getContractEvents(tx)             // → ContractEvent[]
visualizer.getStateChanges(tx)               // → StateChange[]
visualizer.getCrossContractCalls(tx)         // → CrossContractCall[]
visualizer.getTransactionEffects(tx)         // → TransactionEffect[]

// Utilities
visualizer.decodeScVal(scVal)                // → any
visualizer.setNetwork(config)                // → void
```

### Standalone Functions

```typescript
import {
  fetchTransaction,      // Fetch transaction details
  setNetwork,           // Configure network
  decodeScVal,          // Decode Soroban values
  simulateTransaction   // Simulate transaction (testnet only)
} from '@nibrasd/transaction-visualizer';

setNetwork({ isTestnet: true });
const tx = await fetchTransaction('TX_HASH');
```

## Configuration

```typescript
const visualizer = new StellarTransactionVisualizer({
  isTestnet: boolean,        // Default: false
  networkUrl: string,        // Auto-detected if not provided
  networkPassphrase: string  // Auto-detected if not provided
});
```

## Common Patterns

### Pattern 1: Transaction Analysis

```typescript
const tx = await visualizer.getTransactionDetails(hash);
console.log('Status:', tx.status);
console.log('Fee:', tx.fee, 'stroops');
console.log('Fee in XLM:', (parseInt(tx.fee) / 10_000_000).toFixed(7));
console.log('Operations:', tx.operations.length);
```

### Pattern 2: Smart Contracts

```typescript
const ops = visualizer.getSorobanOperations(tx);
ops.forEach(op => {
  console.log('Contract:', op.contractId);
  console.log('Function:', op.functionName);
  console.log('Events:', op.events?.length || 0);
});
```

### Pattern 3: Events

```typescript
const events = visualizer.getContractEvents(tx);
events.forEach(event => {
  console.log('Type:', event.type);
  console.log('Contract:', event.contractId);
  console.log('Data:', visualizer.decodeScVal(event.data));
});
```

### Pattern 4: Cost Calculation (Correct)

```typescript
const ops = visualizer.getSorobanOperations(tx);

const baseFee = parseInt(tx.fee);
const additionalCosts = ops.reduce((sum, op) => {
  const nonRefundable = op.resourceUsage?.nonRefundableFee || 0;
  const rent = op.resourceUsage?.rentFee || 0;
  return sum + nonRefundable + rent;
}, 0);

const totalStroops = baseFee + additionalCosts;
const totalXLM = (totalStroops / 10_000_000).toFixed(7); // 1 XLM = 10,000,000 stroops

console.log(`Total: ${totalStroops} stroops (${totalXLM} XLM)`);
```

## Network Configuration

### Testnet

```typescript
const visualizer = new StellarTransactionVisualizer({
  isTestnet: true,
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
});
```

### Mainnet

```typescript
const visualizer = new StellarTransactionVisualizer({
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
});
```

## React Integration

### Proper Hook Implementation

```tsx
import { useState, useEffect, useMemo } from 'react';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

function useTransaction(txHash: string, isTestnet = true) {
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ✅ Create visualizer once with useMemo (not in every render!)
  const visualizer = useMemo(
    () => new StellarTransactionVisualizer({ isTestnet }),
    [isTestnet]
  );

  useEffect(() => {
    if (!txHash) return;

    let cancelled = false;

    async function fetch() {
      setLoading(true);
      setError(null);

      try {
        const tx = await visualizer.getTransactionDetails(txHash);
        if (!cancelled) setTransaction(tx);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();

    return () => {
      cancelled = true;
    };
  }, [txHash, visualizer]);

  return { transaction, loading, error };
}
```

### Component Usage

```tsx
function TransactionViewer({ txHash }: { txHash: string }) {
  const { transaction, loading, error } = useTransaction(txHash);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!transaction) return null;

  return (
    <div>
      <h2>Status: {transaction.status}</h2>
      <p>Operations: {transaction.operations.length}</p>
    </div>
  );
}
```

## Error Handling

```typescript
async function safeTransactionLookup(txHash: string) {
  try {
    const tx = await visualizer.getTransactionDetails(txHash);

    if (tx.status === 'failed') {
      console.error('Transaction failed:', tx.errorMessage);
      return null;
    }

    return tx;
  } catch (error) {
    if (error.response?.status === 404) {
      console.error('Transaction not found');
    } else if (error.response?.status === 429) {
      console.error('Rate limit exceeded');
    } else if (error.response?.status === 503) {
      console.error('Horizon server unavailable');
    } else {
      console.error('Error:', error.message);
    }
    return null;
  }
}
```

## TypeScript Types

```typescript
import type {
  TransactionDetails,
  SorobanOperation,
  ContractEvent,
  NetworkConfig,
  StateChange,
  CrossContractCall,
  ResourceUsage
} from '@nibrasd/transaction-visualizer';
```

## Key Properties

### TransactionDetails

```typescript
{
  hash: string;                          // Transaction hash
  status: 'success' | 'failed' | 'pending';
  fee: string;                           // Fee in stroops
  ledger: number;                        // Ledger number
  ledgerTimestamp: number;               // Unix timestamp
  operations: any[];                     // All operations
  sorobanOperations?: SorobanOperation[];
  events?: ContractEvent[];
  effects?: TransactionEffect[];
}
```

### SorobanOperation

```typescript
{
  contractId: string;                    // Contract address (C...)
  functionName: string;                  // Function called
  args: any[];                          // Function arguments
  events?: ContractEvent[];             // Emitted events
  stateChanges?: StateChange[];         // Storage changes
  resourceUsage?: ResourceUsage;        // Fees and resources
  crossContractCalls?: CrossContractCall[];
}
```

### ContractEvent

```typescript
{
  contractId: string;                    // Contract that emitted
  type: string;                         // Event type
  topics?: string[];                    // Event topics
  data: any;                            // Event data
}
```

### ResourceUsage

```typescript
{
  cpuInstructions: number;              // CPU used
  memoryBytes: number;                  // Memory used
  refundableFee: number;                // Refundable fee (stroops)
  nonRefundableFee: number;             // Non-refundable fee (stroops)
  rentFee: number;                      // Rent fee (stroops)
}
```

## Utility Functions

```typescript
// Validate transaction hash
function isValidTxHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/i.test(hash);
}

// Validate contract ID
function isValidContractId(id: string): boolean {
  return /^C[A-Z0-9]{55}$/.test(id);
}

// Validate account ID
function isValidAccountId(id: string): boolean {
  return /^G[A-Z0-9]{55}$/.test(id);
}

// Convert stroops to XLM
function stroopsToXLM(stroops: number | string): string {
  const num = typeof stroops === 'string' ? parseInt(stroops) : stroops;
  return (num / 10_000_000).toFixed(7);
}

// Convert XLM to stroops
function xlmToStroops(xlm: number): number {
  return Math.round(xlm * 10_000_000);
}
```

## Getting Transaction Hashes

### From Horizon API

```typescript
import * as StellarSdk from '@stellar/stellar-sdk';

const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');
const response = await server
  .transactions()
  .forAccount('ACCOUNT_ID')
  .order('desc')
  .limit(10)
  .call();

const txHashes = response.records.map(tx => tx.hash);
```

### From Stellar Laboratory

1. Visit: https://laboratory.stellar.org/#explorer
2. Switch to testnet
3. Search for an account
4. Copy transaction hashes

## Real-time Monitoring

```typescript
import * as StellarSdk from '@stellar/stellar-sdk';

const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');
const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

const stream = server
  .transactions()
  .forAccount('ACCOUNT_ID')
  .cursor('now')
  .stream({
    onmessage: async (tx: any) => {
      const details = await visualizer.getTransactionDetails(tx.hash);
      console.log('New transaction:', details.hash, details.status);
    },
    onerror: (error: any) => {
      console.error('Stream error:', error);
    }
  });

// Stop monitoring
stream();
```

## Batch Processing

```typescript
async function analyzeMultiple(txHashes: string[]) {
  const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

  const results = await Promise.allSettled(
    txHashes.map(hash => visualizer.getTransactionDetails(hash))
  );

  const successful = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  console.log(`Analyzed ${successful.length}/${txHashes.length} transactions`);
  return successful;
}
```

## Retry Logic

```typescript
async function fetchWithRetry(txHash: string, maxRetries = 3) {
  const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await visualizer.getTransactionDetails(txHash);
    } catch (error) {
      if (error.response?.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

## Documentation Links

- **[README](./README.md)** - Project overview and setup
- **[SDK Documentation](./SDK_DOCUMENTATION.md)** - Complete API guide
- **[Integration Examples](./INTEGRATION_EXAMPLES.md)** - Production examples
- **[Quick Start](./examples/quick-start.md)** - Get started quickly
- **[Capabilities](./CAPABILITIES.md)** - Features and limitations

## Support

- **GitHub:** https://github.com/NibrasD/stellar-transaction-visualizer
- **NPM:** https://www.npmjs.com/package/@nibrasd/transaction-visualizer
- **Issues:** https://github.com/NibrasD/stellar-transaction-visualizer/issues
- **Discord:** https://discord.gg/stellar
- **Stack Exchange:** https://stellar.stackexchange.com

## Important Notes

### Stroops vs XLM

- **1 XLM = 10,000,000 stroops**
- Always show both units for clarity
- Use `.toFixed(7)` for XLM display

### Network Selection

- **Testnet:** Use for development and testing
- **Mainnet:** Use for production only
- Always verify the network before analyzing transactions

### Error Codes

- **404:** Transaction not found (check network/hash)
- **429:** Rate limit exceeded (implement retry logic)
- **503:** Horizon server temporarily unavailable

### React Performance

- **Always use `useMemo`** for visualizer instance
- Implement cleanup in `useEffect`
- Handle race conditions with cancelled flag

### Best Practices

1. Validate transaction hashes before API calls
2. Implement proper error handling
3. Use TypeScript for type safety
4. Cache results when possible
5. Respect Horizon API rate limits
