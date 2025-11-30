import { NetworkConfig, TransactionDetails, SorobanOperation, ContractEvent, StateChange, CrossContractCall, TransactionEffect } from '../types/stellar';
import { fetchTransaction, setNetwork, decodeScVal } from '../services/stellar';

export class StellarTransactionVisualizer {
  constructor(config?: Partial<NetworkConfig>) {
    if (config) {
      setNetwork({
        isTestnet: config.isTestnet ?? true,
        networkUrl: config.networkUrl ?? 'https://horizon-testnet.stellar.org',
        networkPassphrase: config.networkPassphrase ?? 'Test SDF Network ; September 2015',
      });
    }
  }

  /**
   * Fetches and analyzes a transaction
   * @param hash Transaction hash
   * @returns Detailed transaction information including Soroban operations and events
   */
  async getTransactionDetails(hash: string): Promise<TransactionDetails> {
    return fetchTransaction(hash);
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
   * Changes the network configuration
   * @param config Network configuration
   */
  setNetwork(config: NetworkConfig): void {
    setNetwork(config);
  }
}

// Export standalone functions for direct use
export { fetchTransaction, setNetwork, decodeScVal } from '../services/stellar';

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
} from '../types/stellar';

// Export default instance for quick usage
export default StellarTransactionVisualizer;