export interface TransactionDetails {
  hash: string;
  sourceAccount: string;
  fee: string;
  feeCharged?: string;
  maxFee?: string;
  operations: any[];
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
  operationErrors?: string[];
  resultCodes?: {
    transaction?: string;
    operations?: string[];
  };
  simulationResult?: SimulationResult;
  sorobanOperations?: SorobanOperation[];
  events?: ContractEvent[];
  effects?: TransactionEffect[];
  ledgerTimestamp: number;
  debugInfo?: TransactionDebugInfo;
  crossContractCalls?: CrossContractCall[];
}

export interface OperationNode {
  id: string;
  type: string;
  data: any;
  position: { x: number; y: number };
}

export interface OperationEdge {
  id: string;
  source: string;
  target: string;
}

export interface SimulationResult {
  success: boolean;
  estimatedFee: string;
  potentialErrors: string[];
  resourceUsage: {
    cpuUsage: number;
    memoryUsage: number;
  };
  enhancedDebugInfo?: {
    logs: string[];
    stackTrace: any[];
    resourceUsage: {
      cpuInstructions: number;
      memoryBytes: number;
      readBytes: number;
      writeBytes: number;
      readLedgerEntries: number;
      writeLedgerEntries: number;
      budgetedCpuInstructions?: number;
      budgetedMemoryBytes?: number;
      isActual: boolean;
    };
    timing: {
      simulationTime: number;
      networkLatency: number;
    };
    operationBreakdown: Array<{
      operation: number;
      type: string;
      success: boolean;
      resourceCost: any;
      logs: string[];
      error?: string;
    }>;
  };
}

export interface ContractInteraction {
  contractId: string;
  functionName: string;
  inputs: any[];
  output?: any;
  error?: string;
}

export interface NetworkConfig {
  isTestnet: boolean;
  networkUrl: string;
  networkPassphrase: string;
}

export interface SorobanOperation {
  type: 'soroban';
  contractId: string;
  functionName: string;
  args: any[];
  auth: any[];
  result?: any;
  error?: string;
  events?: ContractEvent[];
  stateChanges?: StateChange[];
  ttlExtensions?: TtlExtension[];
  resourceUsage?: ResourceUsage;
  crossContractCalls?: CrossContractCall[];
}

export interface CrossContractCall {
  fromContract: string;
  toContract: string;
  functionName?: string;
  success: boolean;
}

export interface ResourceUsage {
  refundableFee?: number;
  nonRefundableFee?: number;
  rentFee?: number;
}

export interface StateChange {
  type: 'created' | 'updated' | 'removed' | string;
  description?: string;
  changeType?: string;
  ledgerEntryType?: string;
  contractId?: string;
  storageType?: 'persistent' | 'temporary' | 'instance';
  key?: any;
  keyDisplay?: string;
  before?: any;
  after?: any;
  value?: any;
}

export interface TtlExtension {
  description: string;
  ledgerSeq?: number;
  entryHash?: string;
}

export interface ContractEvent {
  contractId: string;
  type: string;
  topics?: string[];
  data: any;
}

export interface TransactionDebugInfo {
  resultXdr?: string;
  envelopeXdr?: string;
  metaXdr?: string;
  envelopeType?: string;
  decodedResult?: any;
  decodedEnvelope?: any;
  decodedMeta?: any;
  feeBumpInfo?: {
    feeSource: string;
    fee: string;
  };
  errorAnalysis?: {
    outerError?: string;
    innerError?: string;
    transactionError?: string;
    operationErrors?: Array<{
      operation: number;
      error: string;
      description?: string;
      operationType?: string;
      details?: any;
    }>;
    layers?: Array<{
      level: string;
      code: string;
      meaning: string;
      operationType?: string;
      envelopeType?: string;
      explanation?: string;
    }>;
  };
}

export interface OperationError {
  title: string;
  description: string;
  solution?: string;
  code: string;
  xdrDetails?: {
    description?: string;
    details?: any;
  };
}

export interface TransactionEffect {
  type: string;
  paging_token?: string;
  account?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
  balance?: string;
  limit?: string;
  from?: string;
  to?: string;
  starting_balance?: string;
  new_seq?: string;
  high_threshold?: number;
  med_threshold?: number;
  low_threshold?: number;
  home_domain?: string;
  name?: string;
  value?: string;
  trustor?: string;
  authorize?: boolean;
  weight?: number;
  public_key?: string;
  sponsor?: string;
  former_sponsor?: string;
  liquidity_pool_id?: string;
  reserves?: any[];
  shares?: string;
  bought_amount?: string;
  sold_amount?: string;
  offer_id?: string;
  seller?: string;
  sold_asset_type?: string;
  sold_asset_code?: string;
  sold_asset_issuer?: string;
  bought_asset_type?: string;
  bought_asset_code?: string;
  bought_asset_issuer?: string;
}