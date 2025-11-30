// Example: TypeScript Integration
// This demonstrates type-safe usage of the SDK

import {
  StellarTransactionVisualizer,
  fetchTransaction,
  setNetwork,
  type TransactionDetails,
  type SorobanOperation,
  type ContractEvent,
  type NetworkConfig
} from '@nibrasd/transaction-visualizer';

// Example 1: Type-safe configuration
const testnetConfig: NetworkConfig = {
  isTestnet: true,
  networkUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
};

const mainnetConfig: NetworkConfig = {
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015'
};

// Example 2: Transaction Analyzer Service
class TransactionAnalyzerService {
  private visualizer: StellarTransactionVisualizer;

  constructor(config: NetworkConfig) {
    this.visualizer = new StellarTransactionVisualizer(config);
  }

  async analyzeTransaction(txHash: string): Promise<TransactionAnalysis> {
    const tx = await this.visualizer.getTransactionDetails(txHash);

    return {
      hash: tx.hash,
      status: tx.status,
      fee: tx.fee,
      operationCount: tx.operations.length,
      hasSmartContracts: (tx.sorobanOperations?.length || 0) > 0,
      eventCount: (tx.events?.length || 0),
      errorMessage: tx.errorMessage
    };
  }

  async getContractOperations(txHash: string): Promise<SorobanOperation[]> {
    const tx = await this.visualizer.getTransactionDetails(txHash);
    return this.visualizer.getSorobanOperations(tx);
  }

  async getContractEvents(txHash: string): Promise<ContractEvent[]> {
    const tx = await this.visualizer.getTransactionDetails(txHash);
    return this.visualizer.getContractEvents(tx);
  }
}

// Type definitions for service
interface TransactionAnalysis {
  hash: string;
  status: 'success' | 'failed' | 'pending';
  fee: string;
  operationCount: number;
  hasSmartContracts: boolean;
  eventCount: number;
  errorMessage?: string;
}

// Example 3: DeFi Protocol Analyzer
interface DeFiMetrics {
  totalTransactions: number;
  swaps: number;
  deposits: number;
  withdrawals: number;
  totalFees: bigint;
  successRate: number;
}

class DeFiProtocolAnalyzer {
  private visualizer: StellarTransactionVisualizer;

  constructor(isTestnet: boolean = true) {
    this.visualizer = new StellarTransactionVisualizer(
      isTestnet ? testnetConfig : mainnetConfig
    );
  }

  async analyzeProtocol(
    contractId: string,
    txHashes: string[]
  ): Promise<DeFiMetrics> {
    const transactions = await Promise.all(
      txHashes.map(hash => this.visualizer.getTransactionDetails(hash))
    );

    let swaps = 0;
    let deposits = 0;
    let withdrawals = 0;
    let totalFees = BigInt(0);
    let successCount = 0;

    transactions.forEach(tx => {
      const ops = this.visualizer.getSorobanOperations(tx)
        .filter(op => op.contractId === contractId);

      ops.forEach(op => {
        if (op.functionName === 'swap') swaps++;
        if (op.functionName === 'deposit') deposits++;
        if (op.functionName === 'withdraw') withdrawals++;

        if (op.resourceUsage) {
          totalFees += BigInt(op.resourceUsage.nonRefundableFee || 0);
        }
      });

      if (tx.status === 'success') successCount++;
    });

    return {
      totalTransactions: transactions.length,
      swaps,
      deposits,
      withdrawals,
      totalFees,
      successRate: (successCount / transactions.length) * 100
    };
  }

  async findCrossContractInteractions(txHash: string): Promise<InteractionMap> {
    const tx = await this.visualizer.getTransactionDetails(txHash);
    const calls = this.visualizer.getCrossContractCalls(tx);

    const interactions: InteractionMap = {};

    calls.forEach(call => {
      const key = `${call.fromContract}-${call.toContract}`;
      if (!interactions[key]) {
        interactions[key] = {
          from: call.fromContract,
          to: call.toContract,
          count: 0,
          functions: new Set()
        };
      }
      interactions[key].count++;
      if (call.functionName) {
        interactions[key].functions.add(call.functionName);
      }
    });

    return interactions;
  }
}

interface InteractionMap {
  [key: string]: {
    from: string;
    to: string;
    count: number;
    functions: Set<string>;
  };
}

// Example 4: Cost Calculator
class TransactionCostCalculator {
  private visualizer: StellarTransactionVisualizer;

  constructor(config: NetworkConfig) {
    this.visualizer = new StellarTransactionVisualizer(config);
  }

  async calculateDetailedCosts(txHash: string): Promise<DetailedCosts> {
    const tx = await this.visualizer.getTransactionDetails(txHash);
    const sorobanOps = this.visualizer.getSorobanOperations(tx);

    const costs: DetailedCosts = {
      baseFee: BigInt(tx.fee),
      operations: [],
      totals: {
        refundable: BigInt(0),
        nonRefundable: BigInt(0),
        rent: BigInt(0),
        total: BigInt(tx.fee)
      }
    };

    sorobanOps.forEach((op, index) => {
      if (op.resourceUsage) {
        const opCost: OperationCost = {
          index,
          contractId: op.contractId,
          function: op.functionName,
          refundableFee: BigInt(op.resourceUsage.refundableFee || 0),
          nonRefundableFee: BigInt(op.resourceUsage.nonRefundableFee || 0),
          rentFee: BigInt(op.resourceUsage.rentFee || 0)
        };

        costs.operations.push(opCost);
        costs.totals.refundable += opCost.refundableFee;
        costs.totals.nonRefundable += opCost.nonRefundableFee;
        costs.totals.rent += opCost.rentFee;
        costs.totals.total += opCost.nonRefundableFee + opCost.rentFee;
      }
    });

    return costs;
  }

  async compareCosts(txHashes: string[]): Promise<CostComparison[]> {
    const results = await Promise.all(
      txHashes.map(hash => this.calculateDetailedCosts(hash))
    );

    return results.map((cost, index) => ({
      txHash: txHashes[index],
      totalCost: cost.totals.total,
      operationCount: cost.operations.length,
      averageCostPerOp:
        cost.operations.length > 0
          ? cost.totals.total / BigInt(cost.operations.length)
          : BigInt(0)
    }));
  }
}

interface DetailedCosts {
  baseFee: bigint;
  operations: OperationCost[];
  totals: {
    refundable: bigint;
    nonRefundable: bigint;
    rent: bigint;
    total: bigint;
  };
}

interface OperationCost {
  index: number;
  contractId: string;
  function: string;
  refundableFee: bigint;
  nonRefundableFee: bigint;
  rentFee: bigint;
}

interface CostComparison {
  txHash: string;
  totalCost: bigint;
  operationCount: number;
  averageCostPerOp: bigint;
}

// Example 5: Event Monitor
class ContractEventMonitor {
  private visualizer: StellarTransactionVisualizer;

  constructor(config: NetworkConfig) {
    this.visualizer = new StellarTransactionVisualizer(config);
  }

  async monitorEvents(
    txHashes: string[],
    contractId?: string
  ): Promise<EventSummary> {
    const allEvents: ContractEvent[] = [];
    const eventsByType: Map<string, number> = new Map();
    const eventsByContract: Map<string, number> = new Map();

    for (const hash of txHashes) {
      const tx = await this.visualizer.getTransactionDetails(hash);
      const events = this.visualizer.getContractEvents(tx);

      const filteredEvents = contractId
        ? events.filter(e => e.contractId === contractId)
        : events;

      allEvents.push(...filteredEvents);

      filteredEvents.forEach(event => {
        eventsByType.set(event.type, (eventsByType.get(event.type) || 0) + 1);
        eventsByContract.set(
          event.contractId,
          (eventsByContract.get(event.contractId) || 0) + 1
        );
      });
    }

    return {
      totalEvents: allEvents.length,
      eventsByType: Object.fromEntries(eventsByType),
      eventsByContract: Object.fromEntries(eventsByContract),
      events: allEvents
    };
  }

  decodeEventData(event: ContractEvent): any {
    return this.visualizer.decodeScVal(event.data);
  }
}

interface EventSummary {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByContract: Record<string, number>;
  events: ContractEvent[];
}

// Example 6: Standalone function usage
async function standaloneExample() {
  // Configure network
  setNetwork(testnetConfig);

  // Fetch transaction directly
  const tx = await fetchTransaction('YOUR_TX_HASH');

  console.log('Transaction:', {
    hash: tx.hash,
    status: tx.status,
    operations: tx.operations.length
  });
}

// Export all services
export {
  TransactionAnalyzerService,
  DeFiProtocolAnalyzer,
  TransactionCostCalculator,
  ContractEventMonitor,
  standaloneExample
};

export type { TransactionAnalysis, DeFiMetrics, DetailedCosts, EventSummary };
