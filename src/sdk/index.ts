import { Horizon } from '@stellar/stellar-sdk';
import {
  NetworkConfig,
  TransactionDetails,
  SorobanOperation,
  ContractEvent,
  StateChange,
  CrossContractCall,
  TransactionEffect
} from '../types/stellar.js';
import {
  fetchTransaction,
  setNetwork,
  decodeScVal,
  simulateTransaction,
  simulateTransactionWithDebugger,
  createOperationNodes,
  createOperationEdges,
  simpleContractMetadataService,
} from '../services/stellar.js';

export class StellarTransactionVisualizer {
  private config: NetworkConfig;
  private server: Horizon.Server;

  constructor(config?: Partial<NetworkConfig>) {
    const isTestnet = config?.isTestnet ?? true;
    this.config = {
      isTestnet,
      networkUrl: config?.networkUrl ?? (isTestnet ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'),
      networkPassphrase: config?.networkPassphrase ?? (isTestnet ? 'Test SDF Network ; September 2015' : 'Public Global Stellar Network ; September 2015'),
      rpcUrl: config?.rpcUrl ?? (isTestnet ? 'https://soroban-testnet.stellar.org' : 'https://soroban-rpc.mainnet.stellar.gateway.fm'),
    };
    this.server = new Horizon.Server(this.config.networkUrl);
  }

  /**
   * Fetches and analyzes a transaction
   * @param hash Transaction hash
   * @returns Detailed transaction information including Soroban operations and events
   */
  async getTransactionDetails(hash: string): Promise<TransactionDetails> {
    return fetchTransaction(hash, this.config, this.server);
  }

  /**
   * Simulates a transaction and provides execution logs and resource metrics
   * @param hash Transaction hash
   */
  async simulateTransaction(hash: string): Promise<any> {
    return simulateTransactionWithDebugger(hash, undefined, this.config, this.server);
  }

  /**
   * Extracts Soroban-specific operations from a transaction
   * @param transaction Transaction details
   * @returns Array of Soroban operations
   */
  getSorobanOperations(transaction: TransactionDetails): SorobanOperation[] {
    return transaction.sorobanOperations || [];
  }

  /**
   * Gets contract events emitted during transaction execution
   * @param transaction Transaction details
   * @returns Array of contract events
   */
  getContractEvents(transaction: TransactionDetails): ContractEvent[] {
    return transaction.events || [];
  }

  /**
   * Gets state changes from transaction execution
   * @param transaction Transaction details
   * @returns Array of state changes across all operations
   */
  getStateChanges(transaction: TransactionDetails): StateChange[] {
    const changes: StateChange[] = [];
    transaction.sorobanOperations?.forEach(op => {
      if (op.stateChanges) {
        changes.push(...op.stateChanges);
      }
    });
    return changes;
  }

  /**
   * Gets cross-contract calls from transaction
   * @param transaction Transaction details
   * @returns Array of cross-contract calls
   */
  getCrossContractCalls(transaction: TransactionDetails): CrossContractCall[] {
    return transaction.crossContractCalls || [];
  }

  /**
   * Gets transaction effects
   * @param transaction Transaction details
   * @returns Array of transaction effects
   */
  getTransactionEffects(transaction: TransactionDetails): TransactionEffect[] {
    return transaction.effects || [];
  }

  /**
   * Decodes a Soroban ScVal to human-readable format
   * @param scVal ScVal to decode
   * @returns Decoded value
   */
  decodeScVal(scVal: any): any {
    return decodeScVal(scVal);
  }

  /**
   * Changes the network configuration for this instance
   * @param config Network configuration
   */
  setNetwork(config: Partial<NetworkConfig>): void {
    const isTestnet = config.isTestnet ?? this.config.isTestnet;
    this.config = {
      isTestnet,
      networkUrl: config.networkUrl ?? (isTestnet ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'),
      networkPassphrase: config.networkPassphrase ?? (isTestnet ? 'Test SDF Network ; September 2015' : 'Public Global Stellar Network ; September 2015'),
      rpcUrl: config.rpcUrl ?? (isTestnet ? 'https://soroban-testnet.stellar.org' : 'https://soroban-rpc.mainnet.stellar.gateway.fm'),
    };
    this.server = new Horizon.Server(this.config.networkUrl);
  }

  /**
   * Gets the current instance network configuration
   */
  getNetwork(): NetworkConfig {
    return { ...this.config };
  }
}

// Export standalone functions for direct use
export {
  fetchTransaction,
  setNetwork,
  decodeScVal,
  simulateTransaction,
  simulateTransactionWithDebugger,
  createOperationNodes,
  createOperationEdges,
  simpleContractMetadataService,
} from '../services/stellar.js';

// Export types for SDK users
export type {
  NetworkConfig,
  TransactionDetails,
  SorobanOperation,
  ContractEvent,
  StateChange,
  CrossContractCall,
  TransactionEffect,
  ResourceUsage,
  TtlExtension,
  TransactionDebugInfo,
} from '../types/stellar.js';

// Export default instance for quick usage
export default StellarTransactionVisualizer;
