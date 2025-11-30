// Example: Node.js Integration
// This shows how to use the SDK in a Node.js application

const { StellarTransactionVisualizer } = require('@nibrasd/transaction-visualizer');

// Initialize the visualizer
const visualizer = new StellarTransactionVisualizer({
  isTestnet: true,
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
});

// Example 1: Analyze a transaction
async function analyzeTransaction(txHash) {
  try {
    const transaction = await visualizer.getTransactionDetails(txHash);

    console.log('Transaction Analysis:');
    console.log('='.repeat(50));
    console.log('Hash:', transaction.hash);
    console.log('Status:', transaction.status);
    console.log('Fee:', transaction.fee);
    console.log('Operations:', transaction.operations.length);

    // Get Soroban operations
    const sorobanOps = visualizer.getSorobanOperations(transaction);
    if (sorobanOps.length > 0) {
      console.log('\nSmart Contract Operations:');
      sorobanOps.forEach((op, index) => {
        console.log(`\n  Operation ${index + 1}:`);
        console.log('    Contract:', op.contractId);
        console.log('    Function:', op.functionName);
        console.log('    Args:', JSON.stringify(op.args, null, 2));
      });
    }

    // Get events
    const events = visualizer.getContractEvents(transaction);
    if (events.length > 0) {
      console.log('\nContract Events:', events.length);
      events.forEach((event, index) => {
        console.log(`  Event ${index + 1}:`, event.type);
      });
    }

    return transaction;
  } catch (error) {
    console.error('Error analyzing transaction:', error.message);
    throw error;
  }
}

// Example 2: Monitor transactions
async function monitorTransactions(txHashes) {
  const results = [];

  for (const hash of txHashes) {
    try {
      const tx = await visualizer.getTransactionDetails(hash);
      results.push({
        hash: tx.hash,
        status: tx.status,
        operationCount: tx.operations.length,
        hasSmartContracts: (tx.sorobanOperations?.length || 0) > 0
      });
    } catch (error) {
      results.push({
        hash,
        error: error.message
      });
    }
  }

  return results;
}

// Example 3: Analyze costs
async function analyzeCosts(txHash) {
  const tx = await visualizer.getTransactionDetails(txHash);
  const sorobanOps = visualizer.getSorobanOperations(tx);

  let totalRefundable = 0;
  let totalNonRefundable = 0;

  sorobanOps.forEach(op => {
    if (op.resourceUsage) {
      totalRefundable += op.resourceUsage.refundableFee || 0;
      totalNonRefundable += op.resourceUsage.nonRefundableFee || 0;
    }
  });

  return {
    baseFee: tx.fee,
    refundableFee: totalRefundable,
    nonRefundableFee: totalNonRefundable,
    totalCost: parseInt(tx.fee) + totalNonRefundable
  };
}

// Run examples
async function main() {
  // Replace with your transaction hash
  const exampleTxHash = 'YOUR_TRANSACTION_HASH_HERE';

  console.log('Stellar Transaction Visualizer - Node.js Example\n');

  try {
    await analyzeTransaction(exampleTxHash);
  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

// Export for use in other modules
module.exports = {
  visualizer,
  analyzeTransaction,
  monitorTransactions,
  analyzeCosts
};

// Run if called directly
if (require.main === module) {
  main();
}
