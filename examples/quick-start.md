# Quick Start Guide

Get started with the Stellar Transaction Visualizer SDK in under 5 minutes.

## Installation

```bash
npm install @nibrasd/transaction-visualizer
```

**Peer dependencies** (if using React components):
```bash
npm install react react-dom
```

## Prerequisites

Before you begin, you'll need:

1. **A transaction hash** to analyze
   - Get one from [Stellar Laboratory](https://laboratory.stellar.org/#explorer?resource=transactions&endpoint=single&network=test)
   - Or from [StellarExpert Testnet](https://stellar.expert/explorer/testnet)

2. **Example testnet transaction hash** (for testing):
   ```
   Use any recent transaction from Stellar Laboratory
   ```

## Basic Usage

### 1. Simple Transaction Lookup

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

const visualizer = new StellarTransactionVisualizer({
  isTestnet: true
});

async function analyzeTransaction(txHash: string) {
  try {
    const tx = await visualizer.getTransactionDetails(txHash);

    console.log('Transaction status:', tx.status);
    console.log('Operations:', tx.operations.length);
    console.log('Fee:', tx.fee, 'stroops');
    console.log('Fee in XLM:', (parseInt(tx.fee) / 10_000_000).toFixed(7));
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### 2. Smart Contract Analysis

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

const visualizer = new StellarTransactionVisualizer({
  isTestnet: true
});

async function analyzeSmartContract(txHash: string) {
  try {
    const tx = await visualizer.getTransactionDetails(txHash);
    const operations = visualizer.getSorobanOperations(tx);

    if (operations.length === 0) {
      console.log('No smart contract operations found');
      return;
    }

    operations.forEach((op, index) => {
      console.log(`\nContract Operation #${index + 1}:`);
      console.log('Contract ID:', op.contractId || 'Unknown');
      console.log('Function:', op.functionName || 'Unknown');
      console.log('Events:', op.events?.length || 0);

      if (op.resourceUsage) {
        console.log('CPU Instructions:', op.resourceUsage.cpuInstructions);
        console.log('Memory:', op.resourceUsage.memoryBytes, 'bytes');
        console.log('Fee:', op.resourceUsage.nonRefundableFee, 'stroops');
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### 3. React Component (Proper Implementation)

```tsx
import { useState, useEffect, useMemo } from 'react';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';
import type { TransactionDetails } from '@nibrasd/transaction-visualizer';

interface Props {
  txHash: string;
  isTestnet?: boolean;
}

function TransactionViewer({ txHash, isTestnet = true }: Props) {
  const [tx, setTx] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Create visualizer once with useMemo (not in every render!)
  const visualizer = useMemo(
    () => new StellarTransactionVisualizer({ isTestnet }),
    [isTestnet]
  );

  useEffect(() => {
    if (!txHash) return;

    let cancelled = false;

    async function loadTransaction() {
      setLoading(true);
      setError(null);

      try {
        const transaction = await visualizer.getTransactionDetails(txHash);
        if (!cancelled) {
          setTx(transaction);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load transaction');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTransaction();

    return () => {
      cancelled = true;
    };
  }, [txHash, visualizer]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!tx) return null;

  return (
    <div>
      <h2>Transaction {txHash.slice(0, 8)}...</h2>
      <p>Status: {tx.status}</p>
      <p>Operations: {tx.operations.length}</p>
      <p>Fee: {tx.fee} stroops ({(parseInt(tx.fee) / 10_000_000).toFixed(7)} XLM)</p>
    </div>
  );
}

export default TransactionViewer;
```

### 4. React Hook (Production-Ready)

```tsx
import { useState, useEffect, useMemo } from 'react';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';
import type { TransactionDetails } from '@nibrasd/transaction-visualizer';

interface UseTransactionResult {
  transaction: TransactionDetails | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useTransaction(
  txHash: string,
  isTestnet = true
): UseTransactionResult {
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // ✅ Create visualizer once with useMemo
  const visualizer = useMemo(
    () => new StellarTransactionVisualizer({ isTestnet }),
    [isTestnet]
  );

  useEffect(() => {
    if (!txHash) return;

    let cancelled = false;

    async function fetchTransaction() {
      setLoading(true);
      setError(null);

      try {
        const tx = await visualizer.getTransactionDetails(txHash);
        if (!cancelled) {
          setTransaction(tx);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to fetch transaction');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTransaction();

    return () => {
      cancelled = true;
    };
  }, [txHash, visualizer, retryCount]);

  const retry = () => setRetryCount(prev => prev + 1);

  return { transaction, loading, error, retry };
}

// Usage in component
function App() {
  const { transaction, loading, error, retry } = useTransaction(
    'YOUR_TX_HASH',
    true
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error} <button onClick={retry}>Retry</button></div>;
  if (!transaction) return null;

  return <div>Status: {transaction.status}</div>;
}
```

### 5. Monitor Transaction Costs

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

async function analyzeCosts(txHash: string) {
  try {
    const tx = await visualizer.getTransactionDetails(txHash);
    const operations = visualizer.getSorobanOperations(tx);

    // Calculate total cost
    const baseFee = parseInt(tx.fee);
    const additionalCosts = operations.reduce((sum, op) => {
      const nonRefundable = op.resourceUsage?.nonRefundableFee || 0;
      const rent = op.resourceUsage?.rentFee || 0;
      return sum + nonRefundable + rent;
    }, 0);

    const totalStroops = baseFee + additionalCosts;
    const totalXLM = totalStroops / 10_000_000; // 1 XLM = 10,000,000 stroops

    console.log('Cost Breakdown:');
    console.log('- Base fee:', baseFee, 'stroops');
    console.log('- Additional costs:', additionalCosts, 'stroops');
    console.log('- Total:', totalStroops, 'stroops');
    console.log('- Total in XLM:', totalXLM.toFixed(7), 'XLM');
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### 6. Track Contract Events

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

async function trackEvents(txHash: string) {
  try {
    const tx = await visualizer.getTransactionDetails(txHash);
    const events = visualizer.getContractEvents(tx);

    console.log(`Found ${events.length} contract event(s)\n`);

    events.forEach((event, index) => {
      console.log(`Event #${index + 1}:`);
      console.log('  Contract:', event.contractId);
      console.log('  Type:', event.type);

      if (event.topics && event.topics.length > 0) {
        console.log('  Topics:', event.topics.length);
      }

      // Decode event data
      if (event.data) {
        const decodedData = visualizer.decodeScVal(event.data);
        console.log('  Data:', decodedData);
      }

      console.log();
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

## Network Configuration

### Testnet (Default for Testing)

```typescript
const visualizer = new StellarTransactionVisualizer({
  isTestnet: true,
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
});
```

### Mainnet (Production)

```typescript
const visualizer = new StellarTransactionVisualizer({
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
});
```

### Switch Networks at Runtime

```typescript
const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

// Later, switch to mainnet
visualizer.setNetwork({
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
});
```

## Error Handling (Production-Ready)

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

async function safeTransactionLookup(txHash: string) {
  try {
    const tx = await visualizer.getTransactionDetails(txHash);

    if (tx.status === 'failed') {
      console.error('Transaction failed!');
      console.error('Error message:', tx.errorMessage);
      console.error('Operation errors:', tx.operationErrors);
      return null;
    }

    return tx;
  } catch (error: any) {
    // Handle specific HTTP errors
    if (error.response?.status === 404) {
      console.error('Transaction not found. Check the hash and network.');
    } else if (error.response?.status === 429) {
      console.error('Rate limit exceeded. Wait a moment and try again.');
    } else if (error.response?.status === 503) {
      console.error('Horizon server is temporarily unavailable.');
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
  ResourceUsage
} from '@nibrasd/transaction-visualizer';

function processTransaction(tx: TransactionDetails): void {
  console.log('Hash:', tx.hash);
  console.log('Status:', tx.status);
  console.log('Fee:', tx.fee);
}

function processOperation(op: SorobanOperation): void {
  console.log('Contract:', op.contractId);
  console.log('Function:', op.functionName);

  if (op.resourceUsage) {
    const usage: ResourceUsage = op.resourceUsage;
    console.log('CPU:', usage.cpuInstructions);
    console.log('Memory:', usage.memoryBytes);
  }
}
```

## Common Patterns

### Pattern 1: Get Transaction Hashes from Horizon

```typescript
import * as StellarSdk from '@stellar/stellar-sdk';

async function getRecentTransactions(accountId: string) {
  const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');

  const response = await server
    .transactions()
    .forAccount(accountId)
    .order('desc')
    .limit(10)
    .call();

  const txHashes = response.records.map(tx => tx.hash);
  return txHashes;
}
```

### Pattern 2: Batch Analysis

```typescript
async function analyzeMultipleTransactions(txHashes: string[]) {
  const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

  const results = await Promise.allSettled(
    txHashes.map(hash => visualizer.getTransactionDetails(hash))
  );

  const successful = results
    .filter((result): result is PromiseFulfilledResult<any> =>
      result.status === 'fulfilled'
    )
    .map(result => result.value);

  const failed = results
    .filter(result => result.status === 'rejected')
    .length;

  console.log(`Analyzed: ${successful.length} successful, ${failed} failed`);
  return successful;
}
```

### Pattern 3: Real-time Monitoring

```typescript
import * as StellarSdk from '@stellar/stellar-sdk';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

async function monitorAccount(accountId: string) {
  const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');
  const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

  const stream = server
    .transactions()
    .forAccount(accountId)
    .cursor('now')
    .stream({
      onmessage: async (tx: any) => {
        try {
          const details = await visualizer.getTransactionDetails(tx.hash);
          console.log('New transaction:', {
            hash: tx.hash,
            status: details.status,
            operations: details.operations.length
          });
        } catch (error) {
          console.error('Error analyzing transaction:', error);
        }
      },
      onerror: (error: any) => {
        console.error('Stream error:', error);
      }
    });

  // Stop monitoring after 1 hour
  setTimeout(() => {
    stream();
    console.log('Stopped monitoring');
  }, 3600000);

  return stream;
}
```

## Validation Helpers

```typescript
// Validate transaction hash format
function isValidTxHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/i.test(hash);
}

// Validate contract ID format
function isValidContractId(contractId: string): boolean {
  return /^C[A-Z0-9]{55}$/.test(contractId);
}

// Validate account ID format
function isValidAccountId(accountId: string): boolean {
  return /^G[A-Z0-9]{55}$/.test(accountId);
}

// Convert stroops to XLM
function stroopsToXLM(stroops: number | string): string {
  const stroopsNum = typeof stroops === 'string' ? parseInt(stroops) : stroops;
  return (stroopsNum / 10_000_000).toFixed(7);
}

// Convert XLM to stroops
function xlmToStroops(xlm: number): number {
  return Math.round(xlm * 10_000_000);
}
```

## Troubleshooting

### Issue: "Transaction not found"

**Solution:**
1. Verify you're using the correct network (testnet vs mainnet)
2. Check the transaction hash is exactly 64 hexadecimal characters
3. Make sure the transaction is confirmed on the network

```typescript
// Check network and hash format
const isTestnet = true; // Change as needed
const hash = 'your_tx_hash_here';

if (!isValidTxHash(hash)) {
  console.error('Invalid hash format');
} else {
  const visualizer = new StellarTransactionVisualizer({ isTestnet });
  try {
    const tx = await visualizer.getTransactionDetails(hash);
    console.log('Found:', tx);
  } catch (error) {
    console.error('Not found on', isTestnet ? 'testnet' : 'mainnet');
  }
}
```

### Issue: Rate limit errors

**Solution:** Implement retry logic with exponential backoff

```typescript
async function fetchWithRetry(txHash: string, maxRetries = 3) {
  const visualizer = new StellarTransactionVisualizer({ isTestnet: true });

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await visualizer.getTransactionDetails(txHash);
    } catch (error: any) {
      if (error.response?.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

## Next Steps

- **[Full SDK Documentation](../SDK_DOCUMENTATION.md)** - Complete API reference
- **[Integration Examples](../INTEGRATION_EXAMPLES.md)** - Production-ready examples
- **[React Examples](./react-integration.tsx)** - Advanced React patterns
- **[TypeScript Examples](./typescript-integration.ts)** - Advanced TypeScript usage

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/NibrasD/stellar-transaction-visualizer/issues)
- **Discord:** [Stellar Discord](https://discord.gg/stellar)
- **Stack Exchange:** [Stellar Stack Exchange](https://stellar.stackexchange.com)
