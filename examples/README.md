# SDK Integration Examples

This directory contains complete examples showing how to integrate the Stellar Transaction Visualizer SDK into different types of projects.

## Available Examples

### 1. Quick Start (`quick-start.md`)
The fastest way to get started with the SDK. Includes:
- Basic transaction lookup
- Smart contract analysis
- React component usage
- Cost monitoring
- Event tracking

### 2. Node.js Integration (`node-integration.js`)
Complete Node.js backend implementation showing:
- Transaction analysis service
- Batch processing
- Cost calculation
- Error handling
- Module exports

**Best for:** Backend services, APIs, and CLI tools.

**Usage:**
```bash
# Install dependencies first
npm install @nibrasd/transaction-visualizer

# Run the example
node examples/node-integration.js
```

### 3. React Integration (`react-integration.tsx`)
Complete React application examples including:
- Custom hooks (`useTransaction`)
- Transaction detail components
- Smart contract operations viewer
- Real-time cost monitor
- Search functionality

**Best for:** React web applications and dashboards.

**Usage:**
```tsx
import { TransactionDetailsCard } from './examples/react-integration';

function App() {
  return <TransactionDetailsCard txHash="YOUR_TX_HASH" />;
}
```

### 4. TypeScript Integration (`typescript-integration.ts`)
Advanced TypeScript examples with full type safety:
- Service classes
- DeFi protocol analyzer
- Cost calculator
- Event monitor
- Complete type definitions

**Best for:** TypeScript projects requiring type safety.

**Features:**
- Transaction analyzer service
- DeFi metrics calculation
- Detailed cost analysis
- Event monitoring
- Cross-contract interaction tracking

## Getting Started

### Step 1: Install the SDK

```bash
npm install @nibrasd/transaction-visualizer
```

### Step 2: Choose Your Example

Pick the example that matches your project type:
- **Node.js backend?** → Use `node-integration.js`
- **React frontend?** → Use `react-integration.tsx`
- **TypeScript project?** → Use `typescript-integration.ts`
- **Just learning?** → Start with `quick-start.md`

### Step 3: Copy and Customize

Copy the relevant example code into your project and customize it for your needs.

## Common Patterns

### Pattern 1: Basic Transaction Analysis

```typescript
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

const visualizer = new StellarTransactionVisualizer({ isTestnet: true });
const tx = await visualizer.getTransactionDetails('TX_HASH');
console.log('Status:', tx.status);
```

### Pattern 2: Smart Contract Monitoring
```typescript
const sorobanOps = visualizer.getSorobanOperations(tx);

const baseFee = parseInt(tx.fee);
const additionalCosts = sorobanOps.reduce((sum, op) => {
  const nonRefundable = op.resourceUsage?.nonRefundableFee || 0;
  const rent = op.resourceUsage?.rentFee || 0;
  return sum + nonRefundable + rent;
}, 0);

const totalStroops = baseFee + additionalCosts;
const totalXLM = (totalStroops / 10_000_000).toFixed(7); // 1 XLM = 10,000,000 stroops

console.log(`Total: ${totalStroops} stroops (${totalXLM} XLM)`);
```

### Pattern 3: Event Processing

```typescript
const events = visualizer.getContractEvents(tx);
events.forEach(event => {
  console.log(`Event: ${event.type} from ${event.contractId}`);
});
```

### Pattern 4: Cost Calculation

```typescript
const sorobanOps = visualizer.getSorobanOperations(tx);
const totalCost = sorobanOps.reduce((sum, op) => {
  return sum + (op.resourceUsage?.nonRefundableFee || 0);
}, parseInt(tx.fee));
```

## Full Integration Examples

For complete real-world integration examples, see:
 **[Integration Examples](../INTEGRATION_EXAMPLES.md)** 

This includes:
- Express API Server
- Next.js Application
- WebSocket Real-time Monitor
- CLI Tool
- Complete backend services

## Testing Examples

### Test with a Real Transaction

Replace `YOUR_TX_HASH` with a real transaction hash:

**Testnet example:**
```typescript
const txHash = 'a1b2c3d4...'; // Your testnet transaction
```

**Mainnet example:**
```typescript
const visualizer = new StellarTransactionVisualizer({
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
});
```

## Troubleshooting

### Error: "Module not found"

Make sure you've installed the SDK:
```bash
npm install @nibrasd/transaction-visualizer
```

### Error: "Transaction not found"

- Verify the transaction hash is correct
- Check you're on the right network (testnet vs mainnet)
- Ensure the transaction exists on the blockchain

### Error: "Network error"

- Check your internet connection
- Verify Horizon is accessible
- Try a different Horizon server if needed

## Additional Resources

- **SDK_DOCUMENTATION.md** - Complete SDK documentation
- **INTEGRATION_EXAMPLES.md** - Full integration examples
- **SDK_DOCUMENTATION.md** - API reference

## Example Project Structure

Here's how to organize the SDK in your project:

```
your-project/
├── src/
│   ├── services/
│   │   └── stellar.ts          # SDK wrapper
│   ├── hooks/
│   │   └── useStellar.ts       # React hooks
│   ├── components/
│   │   └── Transaction.tsx     # UI components
│   └── utils/
│       └── stellar-helpers.ts  # Helper functions
├── package.json
└── tsconfig.json
```

## Need Help?

- Check the main **README.md**
- Review **SDK_DOCUMENTATION.md** for detailed documentation
- Look at **INTEGRATION_EXAMPLES.md** for more examples
- Open an issue on GitHub

## Contributing Examples

Have a great integration example? Consider contributing:
1. Create a new file in this directory
2. Follow the existing format
3. Include clear comments and documentation
4. Submit a pull request

---

Happy coding! If you build something cool with this SDK, let us know!
