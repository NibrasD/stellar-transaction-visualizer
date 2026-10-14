# Stellar Transaction Visualizer - Quick Reference

Quick cheat sheet and copy-paste recipes for `@nibrasd/transaction-visualizer`.

---

## 1. Installation

```bash
npm install @nibrasd/transaction-visualizer @stellar/stellar-sdk
```

---

## 2. Quick Start

### Class-Based (Recommended for Multi-Instance / Configured Environments)

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

// Defaults to Testnet for safe development
const visualizer = new StellarTransactionVisualizer();

// Or explicitly configure for Mainnet
const mainnetVisualizer = new StellarTransactionVisualizer({
  isTestnet: false,
});

// Fetch full transaction details
const tx = await visualizer.getTransactionDetails('f3a1...c09b');

console.log(`Status: ${tx.status}`);
console.log(`Operations: ${tx.operations.length}`);
console.log(`Soroban Operations: ${visualizer.getSorobanOperations(tx).length}`);
console.log(`Contract Events: ${visualizer.getContractEvents(tx).length}`);
console.log(`State Changes: ${visualizer.getStateChanges(tx).length}`);
```

### Standalone Functions (Tree-Shakeable / Direct Usage)

```typescript
import {
  fetchTransaction,
  setNetwork,
  decodeScVal,
  simulateTransactionWithDebugger,
} from '@nibrasd/transaction-visualizer';

// Set global network if using standalone functions without an instance
setNetwork({ isTestnet: true });

const tx = await fetchTransaction('f3a1...c09b');
```

---

## 3. Network Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `isTestnet` | `boolean` | `true` | When true, targets Stellar Testnet. |
| `networkUrl` | `string` | Auto | Horizon endpoint (`https://horizon-testnet.stellar.org` or `https://horizon.stellar.org`). |
| `networkPassphrase` | `string` | Auto | Stellar network passphrase. |
| `rpcUrl` | `string` | Auto | Soroban RPC endpoint for contract queries. |

### Switching Network on Instance

```typescript
const visualizer = new StellarTransactionVisualizer();

// Switch instance to Mainnet
visualizer.setNetwork({
  isTestnet: false,
});

// Inspect active configuration
const activeConfig = visualizer.getNetwork();
```

---

## 4. Extracting Soroban Details

### Contract Events

```typescript
const events = visualizer.getContractEvents(tx);

events.forEach((event) => {
  console.log(`Contract: ${event.contractId}`);
  console.log(`Topics: ${event.topics.join(', ')}`);
  console.log(`Data:`, event.data);
});
```

### State Changes (Footprint Read/Write)

```typescript
const stateChanges = visualizer.getStateChanges(tx);

stateChanges.forEach((change) => {
  console.log(`Key: ${change.key}`);
  console.log(`Type: ${change.type}`); // 'created' | 'modified' | 'deleted' | 'read'
  console.log(`Before:`, change.before);
  console.log(`After:`, change.after);
});
```

### Cross-Contract Calls

```typescript
const crossCalls = visualizer.getCrossContractCalls(tx);

crossCalls.forEach((call) => {
  console.log(`${call.from} -> ${call.to} (${call.function})`);
});
```

### Decoding Soroban ScVal

```typescript
import { decodeScVal } from '@nibrasd/transaction-visualizer';

// Accepts raw ScVal XDR object and decodes to native JavaScript types
const jsValue = decodeScVal(scVal);
```

---

## 5. Simulating Transactions with Resource Metrics

```typescript
const debugInfo = await visualizer.simulateTransaction('f3a1...c09b');

console.log('Execution Logs:', debugInfo.logs);
console.log('CPU Instructions:', debugInfo.resourceUsage.cpuInstructions);
console.log('Linear VM Memory (Bytes):', debugInfo.resourceUsage.memoryBytes);
console.log('Ledger Read Bytes (I/O):', debugInfo.resourceUsage.readBytes);
console.log('Ledger Write Bytes (I/O):', debugInfo.resourceUsage.writeBytes);
```

---

## 6. React Flow Graph Visualization

```typescript
import {
  createOperationNodes,
  createOperationEdges,
} from '@nibrasd/transaction-visualizer';

const nodes = createOperationNodes(tx.operations, tx);
const edges = createOperationEdges(tx.operations);

// Pass directly to React Flow: <ReactFlow nodes={nodes} edges={edges} />
```

---

## 7. TypeScript Types Reference

All types can be imported directly:

```typescript
import type {
  NetworkConfig,
  TransactionDetails,
  SorobanOperation,
  ContractEvent,
  StateChange,
  CrossContractCall,
  TransactionEffect,
  ResourceUsage,
  TransactionDebugInfo,
} from '@nibrasd/transaction-visualizer';
```
