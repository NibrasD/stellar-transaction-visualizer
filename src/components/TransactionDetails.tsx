import React from 'react';
import { ExternalLink, AlertTriangle, CheckCircle, XCircle, Info, Code, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as StellarSdk from '@stellar/stellar-sdk';
import type { TransactionDetails } from '../types/stellar';

// Helper function to safely stringify values that may contain BigInt
function safeStringify(value: any, indent?: number): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return String(value);

  try {
    return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, indent);
  } catch (e) {
    return String(value);
  }
}

// Helper to detect serialized buffers
const isSerializedBuffer = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  const numericKeys = keys.filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  if (numericKeys.length !== keys.length) return false;
  for (let i = 0; i < numericKeys.length; i++) {
    if (numericKeys[i] !== i) return false;
  }
  return keys.every(k => {
    const val = obj[k];
    return typeof val === 'number' && val >= 0 && val <= 255;
  });
};

const serializedBufferToUint8Array = (obj: any): Uint8Array => {
  const keys = Object.keys(obj).map(Number).sort((a, b) => a - b);
  const bytes = new Uint8Array(keys.length);
  keys.forEach((k, i) => {
    bytes[i] = obj[k];
  });
  return bytes;
};

// Format value with type annotations (sym, bytes, u32, i128, etc.)
const formatValueWithType = (val: any, maxLength: number = 60): string => {
  if (val === null || val === undefined) return 'null';

  // Check for serialized buffers
  if (val && typeof val === 'object' && isSerializedBuffer(val)) {
    const bytes = serializedBufferToUint8Array(val);
    if (bytes.length === 32) {
      try {
        const addr = StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
        return `${addr.substring(0, 4)}…${addr.substring(addr.length - 4)}`;
      } catch {
        try {
          const addr = StellarSdk.StrKey.encodeContract(bytes);
          return `${addr.substring(0, 4)}…${addr.substring(addr.length - 4)}`;
        } catch {
          const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
          return `0x${hex.slice(0, 8)}…${hex.slice(-8)}`;
        }
      }
    }
    const b64 = btoa(String.fromCharCode(...Array.from(bytes)));
    const displayB64 = b64.length > 24 ? `${b64.substring(0, 12)}…${b64.substring(b64.length - 6)}` : b64;
    return `${displayB64}bytes`;
  }

  if (typeof val === 'string') {
    if (val.length > 40 && (val.startsWith('G') || val.startsWith('C'))) {
      return `${val.substring(0, 4)}…${val.substring(val.length - 4)}`;
    }
    return `"${val}"sym`;
  }

  if (typeof val === 'number') {
    return `${val}u32`;
  }

  if (typeof val === 'bigint') {
    return `${val}i128`;
  }

  if (typeof val === 'boolean') {
    return `${val}bool`;
  }

  if (Array.isArray(val)) {
    const items = val.map(v => formatValueWithType(v, 30)).join(', ');
    if (items.length > maxLength) {
      return `[${items.substring(0, maxLength - 3)}…]`;
    }
    return `[${items}]`;
  }

  if (typeof val === 'object') {
    try {
      const entries = Object.entries(val).slice(0, 5).map(([k, v]) => {
        const key = typeof k === 'string' ? `"${k}"sym` : k;
        const value = formatValueWithType(v, 25);
        return `${key}: ${value}`;
      });
      const entriesStr = entries.join(', ');
      const hasMore = Object.keys(val).length > 5;
      return `{${entriesStr}${hasMore ? ', …' : ''}}`;
    } catch {
      return '{…}';
    }
  }

  return String(val);
};

// Decode raw Stellar/Soroban values to human-readable format
function decodeValue(val: any): string {
  if (val === null || val === undefined) return 'null';

  // If it's already a properly formatted string (address, etc), return it
  if (typeof val === 'string') {
    // Already decoded addresses or symbols
    if (val.startsWith('G') || val.startsWith('C') || val.length < 200) {
      return val;
    }
    return val.length > 64 ? `${val.slice(0,61)}...` : val;
  }

  // Primitive numbers and booleans
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }

  // Handle typed objects with specific formatting
  if (typeof val === 'object' && val !== null) {
    // Check if it's a buffer-like array (indexed object with numeric keys)
    const keys = Object.keys(val);
    const isArrayLike = keys.length > 0 && keys.every(k => !isNaN(Number(k)));

    if (isArrayLike) {
      // Convert to actual array
      const arr = keys.map(k => val[k]);

      // Try to decode as Stellar address (32 bytes)
      if (arr.length === 32 && arr.every((n: any) => typeof n === 'number' && n >= 0 && n <= 255)) {
        try {
          const bytes = new Uint8Array(arr);
          // Try contract address first (C...)
          try {
            return StellarSdk.StrKey.encodeContract(bytes);
          } catch {
            try {
              return StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
            } catch {
              // Show as hex if not an address
              const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
              return hex.length > 16 ? `0x${hex.slice(0,8)}...${hex.slice(-8)}` : `0x${hex}`;
            }
          }
        } catch {}
      }

      // Small numeric arrays - might be amounts or IDs
      if (arr.length <= 4 && arr.every((n: any) => typeof n === 'number')) {
        return `[${arr.join(', ')}]`;
      }

      // Large byte arrays - show as hex
      if (arr.length > 4) {
        const hex = arr.map((n: any) => typeof n === 'number' ? n.toString(16).padStart(2, '0') : '??').join('');
        return hex.length > 32 ? `0x${hex.slice(0,16)}...${hex.slice(-16)}` : `0x${hex}`;
      }
    }

    // Handle objects with meaningful properties
    if ('_switch' in val && '_value' in val) {
      return decodeValue(val._value);
    }

    // Small objects - show key-value pairs
    if (keys.length <= 3 && keys.length > 0) {
      const pairs = keys.map(k => `${k}: ${decodeValue(val[k])}`).join(', ');
      return `{${pairs}}`;
    }

    return '{...}';
  }

  return String(val);
}

// Format ledger effect for readable display
function formatLedgerEffect(effect: any): string {
  if (!effect) return '';

  const desc = effect.description || '';

  // Extract just the type and key - strip all the JSON noise
  if (desc.includes('updated persistent data')) {
    const keyMatch = desc.match(/\["([^"]+)"\]/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (key === 'undefined') return 'Updated contract state';
      return `Updated: ${key}`;
    }
    return 'Updated persistent data';
  }

  if (desc.includes('created temporary data')) {
    const keyMatch = desc.match(/\["([^"]+)"\]/);
    if (keyMatch) {
      return `Created temp: ${keyMatch[1]}`;
    }
    return 'Created temporary data';
  }

  if (desc.includes('updated temporary data')) {
    const keyMatch = desc.match(/\["([^"]+)"\]/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (key.length > 35) {
        return `Updated temp: ${key.substring(0, 32)}...`;
      }
      return `Updated temp: ${key}`;
    }
    return 'Updated temporary data';
  }

  // Fallback for clean descriptions
  if (desc && !desc.includes('{') && !desc.includes('=') && desc.length < 50) {
    return desc;
  }

  return effect.type || 'State change';
}

// Helper function to safely extract account address from source_account field
// The Horizon API sometimes returns source_account as an array [0, "address"] instead of a string
function extractAccountAddress(sourceAccount: any): string {
  if (Array.isArray(sourceAccount)) {
    return String(sourceAccount[sourceAccount.length - 1]);
  }
  return String(sourceAccount || '');
}

interface TransactionDetailsProps {
  transaction: TransactionDetails;
  networkConfig: { isTestnet: boolean };
}

export function TransactionDetailsPanel({ transaction, networkConfig }: TransactionDetailsProps) {
  const [showDebugInfo, setShowDebugInfo] = React.useState(false);
  const [showXdrDetails, setShowXdrDetails] = React.useState({
    result: false,
    envelope: false,
    meta: false,
  });

  // Debug logging
  React.useEffect(() => {
  }, [transaction]);

  const getStatusIcon = () => {
    if (transaction.status === 'success') {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  const getErrorAnalysis = () => {
    if (transaction.status === 'success') {
      return { txError: null, opErrors: [] };
    }
    
    // Start with simple, direct error messages from result_codes
    const txError = transaction.errorMessage || transaction.resultCodes?.transaction ? {
      title: 'Transaction Error',
      description: getSimpleErrorDescription(transaction.errorMessage || transaction.resultCodes?.transaction || ''),
      solution: getErrorSolution(transaction.errorMessage || transaction.resultCodes?.transaction || ''),
      code: transaction.errorMessage || transaction.resultCodes?.transaction
    } : null;

    // Show simple operation errors from result_codes first
    const opErrors = (transaction.operationErrors || transaction.resultCodes?.operations || []).map((error, index) => ({
      title: `Operation ${index + 1} Error`,
      description: getSimpleErrorDescription(error),
      solution: getErrorSolution(error),
      code: error
    }));

    // Add detailed XDR analysis if available (as additional info)
    if (transaction.debugInfo?.errorAnalysis?.operationErrors) {
      transaction.debugInfo.errorAnalysis.operationErrors.forEach((xdrError, index) => {
        if (opErrors[index]) {
          opErrors[index].xdrDetails = {
            description: xdrError.description,
            details: xdrError.details
          };
        }
      });
    }

    return { txError, opErrors };
  };

  const getSimpleErrorDescription = (errorCode: string): string => {
    const simpleDescriptions: Record<string, string> = {
      // Transaction level errors
      'tx_failed': 'Transaction failed - one or more operations failed',
      'tx_insufficient_balance': 'Account does not have enough funds to pay the transaction fee',
      'tx_bad_auth': 'Invalid signatures or missing required signers',
      'tx_bad_seq': 'Invalid sequence number - account sequence may have changed',
      'tx_insufficient_fee': 'Transaction fee is too low',
      'tx_too_early': 'Transaction submitted too early',
      'tx_too_late': 'Transaction submitted too late',
      'tx_missing_operation': 'Transaction has no operations',
      'tx_no_account': 'Source account does not exist',
      'tx_internal_error': 'Internal server error occurred',
      
      // Operation level errors
      'op_no_destination': 'Destination account does not exist',
      'op_underfunded': 'Source account does not have enough funds',
      'op_low_reserve': 'Account does not meet minimum balance requirements',
      'op_src_no_trust': 'Source account does not trust this asset',
      'op_no_trust': 'Destination account does not trust this asset',
      'op_not_authorized': 'Account is not authorized for this asset',
      'op_line_full': 'Destination account trustline limit reached',
      'op_no_issuer': 'Asset issuer account does not exist',
      'op_already_exists': 'Account already exists',
      'op_malformed': 'Operation parameters are invalid',
      'op_cross_self': 'Cannot create offer that crosses your own offer',
      'op_sell_no_trust': 'Account does not trust the selling asset',
      'op_buy_no_trust': 'Account does not trust the buying asset',
      'op_offer_not_found': 'Offer to modify does not exist',
      'op_too_many_signers': 'Account has too many signers (max 20)',
      'op_bad_flags': 'Invalid account flags',
      'op_invalid_home_domain': 'Invalid home domain (max 32 characters)',
      'op_auth_revocable_required': 'AUTH_REVOCABLE flag is required',
      'op_auth_immutable_set': 'Cannot change flags when AUTH_IMMUTABLE is set',
      'op_no_trust_line': 'Trustline does not exist',
      'op_trust_not_required': 'Asset does not require trust authorization',
      'op_cant_revoke': 'Cannot revoke authorization for this asset',
      'op_self_not_allowed': 'Cannot perform this operation on self',
    };
    
    return simpleDescriptions[errorCode] || `Error: ${errorCode}`;
  };

  const getOperationErrorDescription = (errorCode: string): string => {
    const errorDescriptions: Record<string, string> = {
      'txFailed': 'Transaction failed - one or more operations failed',
      'txInsufficientBalance': 'The account does not have enough funds to execute this transaction',
      'txBadAuth': 'Invalid signatures or missing required signers',
      'txBadSeq': 'Invalid sequence number',
      'txInsufficientFee': 'The transaction fee is too low',
      'opUnderfunded': 'The source account does not have enough funds',
      'opNoDestination': 'The destination account does not exist',
      'opAlreadyExists': 'The destination account already exists',
      'opLowReserve': 'The starting balance is below the minimum account reserve',
    };
    
    return errorDescriptions[errorCode] || `Error: ${errorCode}`;
  };

  const getErrorSolution = (errorCode: string): string => {
    const solutions: Record<string, string> = {
      // Transaction level solutions
      'tx_insufficient_balance': 'Add more funds to your account to cover the transaction fee',
      'tx_bad_seq': 'Refresh your account data and try again with the correct sequence number',
      'tx_insufficient_fee': 'Increase the transaction fee (minimum is usually 100 stroops per operation)',
      'tx_bad_auth': 'Check that all required signers have signed the transaction',
      'tx_no_account': 'Ensure the source account exists and is funded',
      
      // Operation level solutions
      'op_no_destination': 'Create the destination account first, or use a different destination',
      'op_underfunded': 'Add more funds to the source account',
      'op_low_reserve': 'Increase the starting balance (minimum reserve is 0.5 XLM + 0.5 XLM per subentry)',
      'op_already_exists': 'The account already exists - no need to create it again',
      'op_src_no_trust': 'Create a trustline to the asset issuer first',
      'op_no_trust': 'The destination needs to create a trustline to this asset first',
      'op_not_authorized': 'Get authorization from the asset issuer',
      'op_line_full': 'The destination account has reached its trustline limit for this asset',
      'op_no_issuer': 'Ensure the asset issuer account exists',
      'op_malformed': 'Check the operation parameters for correct format and values',
      'op_cross_self': 'Modify the offer price to avoid crossing your own offers',
      'op_sell_no_trust': 'Create a trustline to the selling asset first',
      'op_buy_no_trust': 'Create a trustline to the buying asset first',
      'op_offer_not_found': 'The offer may have been already taken or cancelled',
      'op_too_many_signers': 'Remove some signers (maximum is 20 per account)',
      'op_bad_flags': 'Use valid account flags (AUTH_REQUIRED, AUTH_REVOCABLE, AUTH_IMMUTABLE)',
      'op_invalid_home_domain': 'Use a home domain with 32 characters or less',
      'op_no_trust_line': 'Create a trustline to this asset first',
      'op_cant_revoke': 'This asset does not allow revoking authorization',
    };
    
    return solutions[errorCode] || 'Check the operation parameters and network conditions, then try again';
  };

  // Collect all cross-contract calls from Soroban operations
  const allCrossContractCalls = React.useMemo(() => {
    const calls = transaction.crossContractCalls || [];
    transaction.sorobanOperations?.forEach(op => {
      if (op.crossContractCalls) {
        calls.push(...op.crossContractCalls);
      }
    });
    return calls;
  }, [transaction]);

  // Get main contract ID (first contract encountered)
  const mainContractId = transaction.sorobanOperations?.[0]?.contractId;

  return (
    <div className="space-y-6">

      <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Transaction Details</h2>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              transaction.status === 'success' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {getStatusIcon()}
              {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Hash</p>
            <div className="flex items-center gap-2 font-mono text-sm bg-gray-50 p-2 rounded overflow-hidden">
              <p className="truncate">{transaction.hash}</p>
              <a
                href={`https://stellar.expert/explorer/${networkConfig.isTestnet ? 'testnet' : 'public'}/tx/${transaction.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-blue-600 hover:text-blue-800"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-500">Source Account</p>
            <div className="font-mono text-sm bg-gray-50 p-2 rounded overflow-hidden">
              <p className="truncate">{transaction.sourceAccount}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-500">Transaction Fees</p>
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <div className="space-y-1 cursor-help">
                    {transaction.feeCharged && (
                      <div>
                        <span className="text-xs text-gray-500">Fee Charged: </span>
                        <span className="font-medium text-green-600">
                          {transaction.feeCharged} stroops
                        </span>
                        <span className="text-sm text-gray-500 ml-1">
                          ({(parseInt(transaction.feeCharged) / 10000000).toFixed(7)} XLM)
                        </span>
                      </div>
                    )}
                    {transaction.maxFee && (
                      <div>
                        <span className="text-xs text-gray-500">Max Fee: </span>
                        <span className="font-medium text-gray-600">
                          {transaction.maxFee} stroops
                        </span>
                        <span className="text-sm text-gray-500 ml-1">
                          ({(parseInt(transaction.maxFee) / 10000000).toFixed(7)} XLM)
                        </span>
                      </div>
                    )}
                    {transaction.feeCharged && transaction.maxFee && parseInt(transaction.feeCharged) < parseInt(transaction.maxFee) && (
                      <div className="text-xs text-green-600 font-medium">
                        💰 Saved {(parseInt(transaction.maxFee) - parseInt(transaction.feeCharged)).toLocaleString()} stroops
                      </div>
                    )}
                  </div>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 max-w-xs"
                    sideOffset={5}
                  >
                    <div className="text-sm space-y-1">
                      <p className="font-semibold">Transaction Fees Explained:</p>
                      <p><strong>Fee Charged:</strong> The actual fee paid for this transaction</p>
                      <p><strong>Max Fee:</strong> The maximum fee you authorized</p>
                      <p className="text-xs text-gray-600 pt-1">1 XLM = 10,000,000 stroops</p>
                    </div>
                    <Tooltip.Arrow className="fill-white" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>

          {transaction.status === 'failed' && (
            <div className="col-span-2 space-y-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-800">Transaction Failed</h3>
                    {(() => {
                      const { txError, opErrors } = getErrorAnalysis() || {};
                      
                      return (
                        <div className="mt-2 space-y-3">
                          {txError && (
                            <div>
                              <h4 className="text-sm font-medium text-red-700">{txError.title}</h4>
                              <p className="text-sm text-red-600 mt-1">{txError.description}</p>
                              {txError.code && (
                                <p className="text-xs font-mono text-red-500 mt-1">Code: {txError.code}</p>
                              )}
                              {txError.solution && (
                                <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700">
                                  <div className="flex items-start gap-2">
                                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                    <span><strong>Solution:</strong> {txError.solution}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {opErrors.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-red-700">Operation Errors:</h4>
                              <div className="mt-1 space-y-2">
                                {opErrors.map((error, index) => (
                                  <div key={index} className="text-sm">
                                    <div className="bg-red-100 p-3 rounded border-l-4 border-red-400">
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                          <span className="font-medium text-red-700">{error.title}</span>
                                          <p className="text-xs font-mono text-red-500 mt-1">Code: {error.code}</p>
                                          {/* Show specific decoded error if available */}
                                          {error.xdrDetails?.details?.specificError ? (
                                            <div className="mt-2">
                                              <p className="text-red-700 font-medium text-sm">
                                                🎯 Specific Error: {error.xdrDetails.details.specificError}
                                              </p>
                                              {error.xdrDetails.details.solution && (
                                                <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                                  <div className="flex items-start gap-2">
                                                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                                    <span><strong>Solution:</strong> {error.xdrDetails.details.solution}</span>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <p className="text-red-600 mt-2">{error.description}</p>
                                          )}
                                          {error.solution && (
                                            <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                                              <div className="flex items-start gap-2">
                                                <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                                <span><strong>Solution:</strong> {error.solution}</span>
                                              </div>
                                            </div>
                                          )}
                                          {error.xdrDetails && (
                                            <details className="mt-2">
                                              <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                                                Show detailed XDR analysis
                                              </summary>
                                              <div className="mt-2 p-2 bg-red-50 rounded">
                                                <p className="text-xs text-red-700 mb-1">{error.xdrDetails.description}</p>
                                                {error.xdrDetails.details?.createAccountCode && (
                                                  <p className="text-xs font-mono bg-red-100 p-1 rounded mt-1">
                                                    XDR Code: {error.xdrDetails.details.createAccountCode}
                                                  </p>
                                                )}
                                                {error.xdrDetails.details && Object.keys(error.xdrDetails.details).length > 0 && (
                                                  <pre className="text-xs bg-red-100 p-2 rounded mt-1 overflow-x-auto">
                                                    {JSON.stringify(error.xdrDetails.details, null, 2)}
                                                  </pre>
                                                )}
                                              </div>
                                            </details>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {!txError && opErrors.length === 0 && (
                            <div>
                              {transaction.errorMessage && (
                                <p className="text-xs font-mono bg-red-100 p-2 rounded">
                                  Raw error: {transaction.errorMessage}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Enhanced Layer-by-Layer Error Analysis */}
              {transaction.debugInfo?.errorAnalysis?.layers && transaction.debugInfo.errorAnalysis.layers.length > 0 && (
                <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-6 border-2 border-red-200">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-lg font-semibold text-red-900">Error Analysis - Layer by Layer</h3>
                      <p className="text-sm text-red-700 mt-1">Detailed breakdown of where and why the transaction failed</p>
                    </div>
                  </div>

                  {transaction.debugInfo.feeBumpInfo && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm font-medium text-blue-900 mb-2">💰 Fee Bump Transaction Detected</p>
                      <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                        <div>
                          <span className="font-medium">Fee Source:</span>
                          <p className="font-mono mt-1 break-all">{transaction.debugInfo.feeBumpInfo.feeSource}</p>
                        </div>
                        <div>
                          <span className="font-medium">Bump Fee:</span>
                          <p className="font-mono mt-1">{transaction.debugInfo.feeBumpInfo.fee} stroops</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {transaction.debugInfo.errorAnalysis.layers.map((layer, index) => (
                      <div key={index} className="bg-white rounded-lg p-5 border-l-4 border-red-500 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center shadow-sm">
                            <span className="text-red-700 font-bold text-base">{index + 1}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <h4 className="font-bold text-gray-900 text-base">{layer.level}</h4>
                              {layer.operationType && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                                  {layer.operationType}
                                </span>
                              )}
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-semibold text-gray-600 min-w-[80px]">Code:</span>
                                <code className="text-sm font-mono text-red-700 bg-red-50 px-2 py-1 rounded flex-1 font-semibold">
                                  {layer.code}
                                </code>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-semibold text-gray-600 min-w-[80px]">Meaning:</span>
                                <p className="text-sm text-gray-800 flex-1 leading-relaxed">{layer.meaning}</p>
                              </div>
                              {layer.envelopeType && (
                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-semibold text-gray-600 min-w-[80px]">Envelope Type:</span>
                                  <code className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded flex-1">
                                    {layer.envelopeType}
                                  </code>
                                </div>
                              )}
                              {layer.explanation && (
                                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                  <div className="flex items-start gap-2">
                                    <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                    <p className="text-xs text-blue-900 leading-relaxed">
                                      <span className="font-semibold">Explanation:</span> {layer.explanation}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {transaction.debugInfo.envelopeType && (
                    <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">Envelope Type:</span>{' '}
                        <code className="font-mono">{transaction.debugInfo.envelopeType}</code>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {transaction.debugInfo && (
                <div className="bg-gray-50 rounded-lg">
                  <button
                    onClick={() => setShowDebugInfo(!showDebugInfo)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">Advanced Debug Information</span>
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                        XDR Analysis
                      </span>
                    </div>
                    {showDebugInfo ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                  
                  {showDebugInfo && (
                    <div className="px-4 pb-4 space-y-4">
                      <div className="bg-yellow-50 p-3 rounded-lg border-l-4 border-yellow-400">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-yellow-700">
                            <p className="font-medium">Advanced Technical Information</p>
                            <p className="text-xs mt-1">
                              This section contains low-level XDR decoding results. 
                              The error information above should be sufficient for most debugging needs.
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {transaction.debugInfo.errorAnalysis && (
                        <div className="bg-white p-4 rounded-lg border border-red-200">
                          <h4 className="text-sm font-medium text-red-800 mb-3">XDR Error Analysis</h4>
                          
                          {transaction.debugInfo.errorAnalysis.transactionError && (
                            <div className="mb-3">
                              <p className="text-xs text-gray-500 mb-1">Transaction Error (XDR):</p>
                              <p className="text-sm font-mono bg-red-50 p-2 rounded text-red-700">
                                {transaction.debugInfo.errorAnalysis.transactionError}
                              </p>
                            </div>
                          )}
                          
                          {transaction.debugInfo.errorAnalysis.operationErrors && 
                           transaction.debugInfo.errorAnalysis.operationErrors.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-500 mb-2">Operation Errors (XDR):</p>
                              <div className="space-y-2">
                                {transaction.debugInfo.errorAnalysis.operationErrors.map((opError, index) => (
                                  <div key={index} className="bg-red-50 p-3 rounded border-l-4 border-red-400">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <p className="text-sm font-medium text-red-800">
                                          Operation {opError.operation + 1}
                                          {opError.operationType && (
                                            <span className="text-xs bg-red-200 text-red-700 px-2 py-1 rounded ml-2">
                                              {opError.operationType}
                                            </span>
                                          )}</p>
                                        <p className="text-xs font-mono text-red-600 mt-1">
                                          {opError.error}
                                        </p>
                                        {opError.description && (
                                          <p className="text-xs text-red-700 mt-2">
                                            {opError.description}
                                          </p>
                                        )}
                                        {opError.details && Object.keys(opError.details).length > 0 && (
                                          <details className="mt-2">
                                            <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                                              Show decoded XDR details
                                            </summary>
                                            <pre className="text-xs bg-red-100 p-2 rounded mt-1 overflow-x-auto">
                                              {JSON.stringify(opError.details, null, 2)}
                                            </pre>
                                          </details>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-700">Raw XDR Data</h4>
                        
                        {/* Result XDR */}
                        <div className="bg-white rounded-lg border border-gray-200">
                          <button
                            onClick={() => setShowXdrDetails(prev => ({ ...prev, result: !prev.result }))}
                            className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 rounded-t-lg"
                          >
                            <span className="text-sm font-medium text-gray-700">Transaction Result XDR</span>
                            {showXdrDetails.result ? (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                          {showXdrDetails.result && (
                            <div className="px-3 pb-3 border-t border-gray-100">
                              <pre className="text-xs bg-gray-50 p-3 rounded mt-2 overflow-x-auto font-mono max-h-40">
                                {transaction.debugInfo.resultXdr}
                              </pre>
                            </div>
                          )}
                        </div>
                        
                        {/* Envelope XDR */}
                        <div className="bg-white rounded-lg border border-gray-200">
                          <button
                            onClick={() => setShowXdrDetails(prev => ({ ...prev, envelope: !prev.envelope }))}
                            className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 rounded-t-lg"
                          >
                            <span className="text-sm font-medium text-gray-700">Transaction Envelope XDR</span>
                            {showXdrDetails.envelope ? (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                          {showXdrDetails.envelope && (
                            <div className="px-3 pb-3 border-t border-gray-100">
                              <pre className="text-xs bg-gray-50 p-3 rounded mt-2 overflow-x-auto font-mono max-h-40">
                                {transaction.debugInfo.envelopeXdr}
                              </pre>
                            </div>
                          )}
                        </div>
                        
                        {/* Meta XDR */}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>


        {/* Operation Details Section */}
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Operations ({transaction.operations.length})</p>
          <div className="space-y-3">
            {transaction.operations.map((op, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {op.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-500">#{index + 1}</span>
                </div>
                
                {/* Operation-specific details */}
                {op.type === 'create_account' && (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-600">Creating account for:</span> 
                       <span className="font-mono text-blue-600 ml-1">{(op as any).destination}</span></p>
                    <p><span className="text-gray-600">Starting balance:</span> 
                       <span className="font-medium text-green-600 ml-1">{(op as any).starting_balance} XLM</span></p>
                    <p><span className="text-gray-600">Funded by:</span> 
                       <span className="font-mono text-blue-600 ml-1">{extractAccountAddress(op.source_account || transaction.sourceAccount)}</span></p>
                  </div>
                )}
                
                {op.type === 'payment' && (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-600">From:</span> 
                       <span className="font-mono text-blue-600 ml-1">{(op as any).from}</span></p>
                    <p><span className="text-gray-600">To:</span> 
                       <span className="font-mono text-blue-600 ml-1">{(op as any).to}</span></p>
                    <p><span className="text-gray-600">Amount:</span> 
                       <span className="font-medium text-green-600 ml-1">
                         {(op as any).amount} {(op as any).asset_type === 'native' ? 'XLM' : (op as any).asset_code}
                       </span></p>
                  </div>
                )}
                
                {op.type === 'begin_sponsoring_future_reserves' && (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-600">Sponsor:</span> 
                       <span className="font-mono text-blue-600 ml-1">{extractAccountAddress(op.source_account || transaction.sourceAccount)}</span></p>
                    <p><span className="text-gray-600">Sponsored account:</span> 
                       <span className="font-mono text-blue-600 ml-1">{(op as any).sponsored_id}</span></p>
                    <p className="text-xs text-gray-500">This account will pay for the sponsored account's reserves</p>
                  </div>
                )}
                
                {op.type === 'end_sponsoring_future_reserves' && (
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-600">Ending sponsorship arrangement</p>
                    <p className="text-xs text-gray-500">The sponsored account will now pay its own reserves</p>
                  </div>
                )}
                
                {op.type === 'invoke_host_function' && (() => {
                  // Find the matching soroban operation by checking all soroban ops
                  const sorobanOp = transaction.sorobanOperations?.find((sop: any) =>
                    sop.contractId || sop.functionName
                  ) || transaction.sorobanOperations?.[0];

                  const sourceAccountAddr = extractAccountAddress(op.source_account || transaction.sourceAccount);

                  return (
                    <div className="space-y-1 text-sm">
                      <p><span className="text-gray-600">Source Account:</span>
                         <span className="font-mono text-blue-600 ml-1">{sourceAccountAddr}</span></p>
                      {sorobanOp?.contractId && (
                        <p><span className="text-gray-600">Contract ID:</span>
                           <span className="font-mono text-blue-600 ml-1">{sorobanOp.contractId}</span></p>
                      )}
                      {sorobanOp?.functionName && (
                        <p><span className="text-gray-600">Function:</span>
                           <span className="font-mono text-purple-600 ml-1">
                             {sorobanOp.functionName.replace('HostFunctionTypeHostFunctionType', '')}
                           </span></p>
                      )}
                    </div>
                  );
                })()}
                
                {/* Generic operation details for other types */}
                {!['create_account', 'payment', 'begin_sponsoring_future_reserves', 'end_sponsoring_future_reserves', 'invoke_host_function'].includes(op.type) && (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-600">Source:</span> 
                       <span className="font-mono text-blue-600 ml-1">{extractAccountAddress(op.source_account || transaction.sourceAccount)}</span></p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Debug Information Section */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Debug Information</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Transaction Hash:</span>
              <span className="font-mono">{transaction.hash}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Ledger Timestamp:</span>
              <span>{new Date(transaction.ledgerTimestamp).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Operations Count:</span>
              <span>{transaction.operations.length}</span>
            </div>
            {transaction.feeCharged && (
              <div className="flex justify-between">
                <span className="text-gray-600">Fee Charged:</span>
                <span className="text-green-600 font-medium">{transaction.feeCharged} stroops ({(parseInt(transaction.feeCharged) / 10000000).toFixed(7)} XLM)</span>
              </div>
            )}
            {transaction.maxFee && (
              <div className="flex justify-between">
                <span className="text-gray-600">Max Fee (Authorized):</span>
                <span>{transaction.maxFee} stroops ({(parseInt(transaction.maxFee) / 10000000).toFixed(7)} XLM)</span>
              </div>
            )}
            {transaction.feeCharged && transaction.maxFee && parseInt(transaction.feeCharged) < parseInt(transaction.maxFee) && (
              <div className="flex justify-between">
                <span className="text-gray-600">Fee Savings:</span>
                <span className="text-green-600 font-medium">{(parseInt(transaction.maxFee) - parseInt(transaction.feeCharged)).toLocaleString()} stroops</span>
              </div>
            )}
            {transaction.sorobanOperations && transaction.sorobanOperations.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Soroban Operations:</span>
                <span>{transaction.sorobanOperations.length}</span>
              </div>
            )}
            {transaction.events && transaction.events.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Contract Events:</span>
                <span>{transaction.events.length}</span>
              </div>
            )}
{(() => {
              // Debug logging

              const resourceUsage = transaction.simulationResult?.enhancedDebugInfo?.resourceUsage;
              if (!resourceUsage) return null;

              return (
                <>
                  {resourceUsage.cpuInstructions > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">CPU Instructions:</span>
                      <span className="font-mono text-blue-600 font-medium">
                        {resourceUsage.cpuInstructions.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {resourceUsage.memoryBytes > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Memory Usage:</span>
                      <span className="font-mono text-blue-600 font-medium">
                        {resourceUsage.memoryBytes.toLocaleString()} bytes
                      </span>
                    </div>
                  )}
                  {resourceUsage.readBytes > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ledger Read:</span>
                      <span className="font-mono text-blue-600 font-medium">
                        {resourceUsage.readBytes.toLocaleString()} bytes
                      </span>
                    </div>
                  )}
                  {resourceUsage.writeBytes > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ledger Write:</span>
                      <span className="font-mono text-blue-600 font-medium">
                        {resourceUsage.writeBytes.toLocaleString()} bytes
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          
          {/* Stack trace for failed transactions */}
          {transaction.status === 'failed' && transaction.debugInfo && (
            <div className="mt-4 p-3 bg-red-50 rounded border-l-4 border-red-400">
              <p className="text-xs font-medium text-red-700 mb-2">Stack Trace Available</p>
              <p className="text-xs text-red-600">
                XDR data contains detailed error information. Expand "Advanced Debug Information" above for full details.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}