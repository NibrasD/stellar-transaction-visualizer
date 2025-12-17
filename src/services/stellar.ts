import { Horizon } from '@stellar/stellar-sdk';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import type {
  TransactionDetails,
  NetworkConfig,
  SorobanOperation,
  ContractEvent,
  SimulationResult,
  StateChange
} from '../types/stellar';
import { Node, Edge } from 'reactflow';
import { simpleContractMetadataService } from './simpleContractMetadata';
import { processEventsToEffects } from './eventProcessor';

// Helper to safely stringify values that might contain BigInt
const safeStringify = (value: any, space?: number): string => {
  return JSON.stringify(value, (key, val) =>
    typeof val === 'bigint' ? val.toString() : val
    , space);
};

let server: Horizon.Server;
let networkConfig: NetworkConfig = {
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
};

export const setNetwork = (config: NetworkConfig) => {
  networkConfig = config;
  server = new Horizon.Server(config.networkUrl);

  // Use reliable RPC endpoints
  const rpcUrl = config.isTestnet
    ? 'https://soroban-testnet.stellar.org'
    : 'https://soroban-rpc.mainnet.stellar.gateway.fm';

  const networkName = config.isTestnet ? 'testnet' : 'mainnet';
  simpleContractMetadataService.setNetwork(networkName, rpcUrl, config.networkPassphrase);
};

// Initialize with testnet by default
setNetwork(networkConfig);

// Helper function to add timeout to fetch requests
const fetchWithTimeout = async (url: string, timeout = 15000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - Horizon server took too long to respond');
    }
    throw error;
  }
};

// Helper function to safely extract account address from source_account field
// The Horizon API sometimes returns source_account as an array [0, "address"] instead of a string
function extractAccountAddress(sourceAccount: any): string {
  if (Array.isArray(sourceAccount)) {
    return String(sourceAccount[sourceAccount.length - 1]);
  }
  return String(sourceAccount);
}

// Helper to check if an object looks like a serialized Buffer/Uint8Array
function isSerializedBuffer(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  // Check if it has numeric keys starting from 0
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;

  // Check if all keys are numeric and sequential
  const numericKeys = keys.filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  if (numericKeys.length !== keys.length) return false;

  // Check if keys are sequential starting from 0
  for (let i = 0; i < numericKeys.length; i++) {
    if (numericKeys[i] !== i) return false;
  }

  // Check if all values are numbers in byte range (0-255)
  return keys.every(k => {
    const val = obj[k];
    return typeof val === 'number' && val >= 0 && val <= 255;
  });
}

// Helper to convert serialized buffer to Uint8Array
function serializedBufferToUint8Array(obj: any): Uint8Array {
  const keys = Object.keys(obj).map(Number).sort((a, b) => a - b);
  const bytes = new Uint8Array(keys.length);
  keys.forEach((k, i) => {
    bytes[i] = obj[k];
  });
  return bytes;
}

// Helper function to format duration in seconds to human-readable format
function formatDuration(seconds: number): string {
  const units = [
    { name: 'year', seconds: 31536000 },
    { name: 'month', seconds: 2592000 },
    { name: 'week', seconds: 604800 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
  ];

  for (const unit of units) {
    if (seconds >= unit.seconds) {
      const value = Math.floor(seconds / unit.seconds);
      const remainder = seconds % unit.seconds;

      // If exact match, return simple format
      if (remainder === 0) {
        return `${value} ${unit.name}${value !== 1 ? 's' : ''}`;
      }

      // If close enough (within 1%), return approximate
      if (remainder < unit.seconds * 0.01) {
        return `~${value} ${unit.name}${value !== 1 ? 's' : ''}`;
      }
    }
  }

  return `${seconds} seconds`;
}

// Helper function to decode base64 strings (used for data entries in effects)
function decodeBase64Value(value: string): string {
  try {
    // Check if value looks like base64
    if (!value || typeof value !== 'string') {
      return value;
    }

    // Base64 strings are typically alphanumeric with +, /, and = padding
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Regex.test(value)) {
      return value;
    }

    // Try to decode as base64
    const decoded = Buffer.from(value, 'base64').toString('utf-8');

    // Validate that decoded string contains printable characters
    // Include common whitespace chars: space(32), tab(9), newline(10), carriage return(13)
    const isPrintable = (charCode: number) =>
      (charCode >= 32 && charCode <= 126) ||
      charCode === 9 || charCode === 10 || charCode === 13;

    const chars = decoded.split('');
    const printableCount = chars.filter(c => isPrintable(c.charCodeAt(0))).length;
    const printableRatio = chars.length > 0 ? printableCount / chars.length : 0;

    // If less than 50% printable or contains null bytes, treat as binary
    if (printableRatio < 0.5 || decoded.includes('\0')) {
      // Binary data - return hex representation
      return `0x${Buffer.from(value, 'base64').toString('hex')}`;
    }

    // Return the decoded text (printable string)
    return decoded;
  } catch (error) {
    // If decoding fails, return original value
    return value;
  }
}

// Enhanced helper to format contract values with decoding and duration formatting
export function formatContractValue(value: any, typeHint?: string): string {
  if (value === null || value === undefined) return 'null';

  const valueStr = String(value);

  // Check if it's a base64-encoded bytes value (ends with bytes or ==bytes)
  if (valueStr.endsWith('bytes') || valueStr.match(/==bytes$/)) {
    const base64Part = valueStr.replace(/bytes$/, '');
    const decoded = decodeBase64Value(base64Part);

    // If decoded successfully to text (not hex), show decoded value with checkmark
    if (decoded !== base64Part && !decoded.startsWith('0x')) {
      return `"${decoded}" ✓`;
    }

    // If it's hex data, return as-is
    if (decoded.startsWith('0x')) {
      return decoded;
    }
  }

  // Check if it's a duration value (u64 that might be seconds)
  if (valueStr.match(/^\d+u64$/) || valueStr.match(/^\d+i\d+$/)) {
    const numStr = valueStr.replace(/[ui]\d+$/, '');
    const num = parseInt(numStr);

    // If it's a reasonable duration (between 1 minute and 100 years)
    if (num >= 60 && num <= 3153600000) {
      const duration = formatDuration(num);
      return `${duration} (${valueStr})`;
    }
  }

  return valueStr;
}

// Helper function to decode ScVal (Stellar Contract Value) to human-readable format
export function decodeScVal(scVal: any): any {
  // Handle null/undefined values
  if (scVal === null || scVal === undefined) {
    return null;
  }

  // CRITICAL: If value is already a primitive (string/number/boolean), return it directly
  // This handles cases where RPC returns already-decoded event topics/data
  if (typeof scVal === 'string' || typeof scVal === 'number' || typeof scVal === 'boolean') {
    return scVal;
  }

  // Handle plain arrays - these are not ScVal objects, they're already decoded
  if (Array.isArray(scVal)) {
    return scVal.map(item => decodeScVal(item));
  }

  // If it's a plain object without .switch() method, it's not an ScVal
  if (typeof scVal === 'object' && !scVal.switch && !scVal._switch) {
    return scVal;
  }

  try {
    // FIRST: Check for special XDR types that scValToNative might not handle well
    try {
      const scValType = scVal.switch?.()?.name || scVal._switch?.name;
      if (scValType === 'scvLedgerKeyContractInstance') {
        return 'ContractInstance';
      }
      if (scValType === 'scvLedgerKeyNonce') {
        try {
          const nonceKey = scVal.nonceKey();
          const nonceValue = nonceKey.nonce();
          return `${nonceValue.toString()}u64`;
        } catch (e) {
          return 'Nonce';
        }
      }
      if (scValType === 'scvContractInstance') {
        // Try to extract contract instance data
        try {
          const instance = scVal.instance();
          const result: any = {};

          // Try to get the executable (WASM hash or other executable)
          try {
            const executable = instance.executable();
            const execSwitch = executable.switch?.()?.name || executable._switch?.name;
            if (execSwitch === 'contractExecutableWasm') {
              const wasmHash = executable.wasmHash();
              if (wasmHash) {
                const hashBytes = wasmHash instanceof Uint8Array ? wasmHash : new Uint8Array(Object.values(wasmHash));
                result.wasm = Array.from(hashBytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
              }
            } else if (execSwitch === 'contractExecutableStellarAsset') {
              result.executable = 'StellarAsset';
            }
          } catch (e) {
            // Executable might not be accessible
          }

          // Try to get storage if available
          try {
            const storage = instance.storage?.();
            if (storage) {
              result.storage = StellarSdk.scValToNative(storage);
            }
          } catch (e) {
            // Storage might not be accessible
          }

          return Object.keys(result).length > 0 ? result : 'ContractInstance';
        } catch (e) {
          return 'ContractInstance';
        }
      }
    } catch (e) {
      // Continue to native conversion
    }

    // Check the ORIGINAL ScVal type FIRST before trying scValToNative
    // This prevents misinterpreting bytes as addresses
    const valType = scVal.switch?.()?.name || scVal._switch?.name;

    // If it's explicitly scvBytes, just return as hex/base64 - DON'T try to decode as address!
    if (valType === 'scvBytes') {
      const bytes = scVal.bytes();
      // Convert to base64 for better readability
      const byteArray = Array.from(bytes) as number[];
      const base64 = btoa(String.fromCharCode(...byteArray));
      return base64;
    }

    // Try using Stellar SDK's built-in scValToNative
    try {
      const nativeValue = StellarSdk.scValToNative(scVal);

      // CRITICAL: Check for Buffer/Uint8Array FIRST before any other processing
      // These get serialized to {0: x, 1: y} when passed through React state
      // BUT ONLY try address decoding if the ORIGINAL type was scvAddress, not scvBytes!
      if (nativeValue && typeof nativeValue === 'object' && valType !== 'scvBytes') {
        // Check for serialized buffers (objects with numeric keys)
        if (isSerializedBuffer(nativeValue)) {
          const bytes = serializedBufferToUint8Array(nativeValue);
          if (bytes.length === 32) {
            try {
              return StellarSdk.StrKey.encodeContract(Buffer.from(bytes));
            } catch {
              try {
                return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(bytes));
              } catch {
                const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
                return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
              }
            }
          }
          // Non-32-byte buffers - convert to hex
          const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
          return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
        }

        // Check for actual Buffer/Uint8Array instances
        if (nativeValue.constructor?.name === 'Buffer' || nativeValue instanceof Uint8Array) {
          const bytes = nativeValue instanceof Uint8Array ? nativeValue : new Uint8Array(Array.from(nativeValue as any));
          if (bytes.length === 32) {
            try {
              return StellarSdk.StrKey.encodeContract(Buffer.from(bytes));
            } catch {
              try {
                return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(bytes));
              } catch {
                const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
                return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
              }
            }
          }
          // Non-32-byte buffers - convert to hex
          const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
          return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
        }
      }

      // Format the native value nicely
      if (typeof nativeValue === 'bigint') {
        return nativeValue.toString();
      }
      if (typeof nativeValue === 'string') {
        // Check if it's an address
        if (nativeValue.startsWith('G') || nativeValue.startsWith('C')) {
          return nativeValue;
        }
        return nativeValue;
      }
      if (typeof nativeValue === 'number' || typeof nativeValue === 'boolean') {
        return nativeValue;
      }
      // Special handling for arrays - decode each element from the ORIGINAL ScVal
      if (Array.isArray(nativeValue)) {
        try {
          // Get the original Vec from the ScVal to decode each item properly
          const vecItems = scVal.vec();
          if (vecItems && Array.isArray(vecItems)) {
            return vecItems.map((item: any) => decodeScVal(item));
          }
        } catch (e) {
          // Fallback: just return native values
          return nativeValue.map(item => {
            if (typeof item === 'bigint') return item.toString();
            if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return item;
            // For Buffer/Uint8Array in array, convert to base64
            if (item && typeof item === 'object' && (item.constructor?.name === 'Buffer' || item instanceof Uint8Array)) {
              const bytes = item instanceof Uint8Array ? item : new Uint8Array(Array.from(item as any));
              const byteArray = Array.from(bytes) as number[];
              return btoa(String.fromCharCode(...byteArray));
            }
            return item;
          });
        }
      }
      if (typeof nativeValue === 'object' && nativeValue !== null) {
        // Handle Buffer objects (bytes)
        if (nativeValue.constructor && nativeValue.constructor.name === 'Buffer') {
          // Try to decode as Stellar address first (32 bytes for account, 32 bytes for contract)
          if (nativeValue.length === 32) {
            try {
              // Try as account address (G...)
              return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(Array.from(nativeValue)));
            } catch (e1) {
              try {
                // Try as contract address (C...)
                return StellarSdk.StrKey.encodeContract(Buffer.from(Array.from(nativeValue)));
              } catch (e2) {
                // Not an address, show as hex
                const hex = nativeValue.toString('hex');
                return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
              }
            }
          }
          const hex = nativeValue.toString('hex');
          return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
        }
        // Handle Uint8Array (bytes)
        if (nativeValue instanceof Uint8Array) {
          // Try to decode as Stellar address first (32 bytes for account, 32 bytes for contract)
          if (nativeValue.length === 32) {
            try {
              // Try as account address (G...)
              return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(Array.from(nativeValue)));
            } catch (e1) {
              try {
                // Try as contract address (C...)
                return StellarSdk.StrKey.encodeContract(Buffer.from(Array.from(nativeValue)));
              } catch (e2) {
                // Not an address, show as hex
                const bytes = Array.from(nativeValue);
                const hex = bytes.map((b: number) => b.toString(16).padStart(2, '0')).join('');
                return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
              }
            }
          }
          const bytes = Array.from(nativeValue);
          const hex = bytes.map((b: number) => b.toString(16).padStart(2, '0')).join('');
          return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
        }
        return nativeValue;
      }
      // Check if nativeValue is undefined or null - if so, fall back to manual decoding
      if (nativeValue === undefined || nativeValue === null) {
        throw new Error('scValToNative returned undefined/null');
      }
      return nativeValue;
    } catch (nativeError) {
      // If scValToNative fails, fall back to manual decoding
    }

    const type = scVal.switch().name;

    switch (type) {
      case 'scvBool':
        return scVal.b();
      case 'scvVoid':
        return 'void';
      case 'scvU32':
        return scVal.u32();
      case 'scvI32':
        return scVal.i32();
      case 'scvU64':
        return scVal.u64().toString();
      case 'scvI64':
        return scVal.i64().toString();
      case 'scvU128':
        const u128Parts = scVal.u128();
        const u128Val = u128Parts.lo().toString();
        return u128Val;
      case 'scvI128':
        const i128Parts = scVal.i128();
        const i128Val = i128Parts.lo().toString();
        return i128Val;
      case 'scvU256':
      case 'scvI256':
        return `${type}(big number)`;
      case 'scvBytes':
        const bytes = scVal.bytes();
        const hexBytes = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
        return hexBytes.length > 32 ? `0x${hexBytes.slice(0, 16)}...${hexBytes.slice(-16)}` : `0x${hexBytes}`;
      case 'scvString':
        return scVal.str().toString();
      case 'scvSymbol':
        return scVal.sym().toString();
      case 'scvVec':
        const vec = scVal.vec();
        if (vec && vec.length > 0) {
          const items = [];
          for (let i = 0; i < Math.min(vec.length, 10); i++) {
            items.push(decodeScVal(vec[i]));
          }
          return vec.length > 10 ? [...items, `...+${vec.length - 10} more`] : items;
        }
        return [];
      case 'scvMap':
        const map = scVal.map();
        if (map && map.length > 0) {
          const entries: any = {};
          for (let i = 0; i < Math.min(map.length, 10); i++) {
            const entry = map[i];
            const key = decodeScVal(entry.key());
            const val = decodeScVal(entry.val());
            entries[String(key)] = val;
          }
          if (map.length > 10) {
            entries['...'] = `+${map.length - 10} more entries`;
          }
          return entries;
        }
        return {};
      case 'scvAddress':
        const addr = scVal.address();
        const addrType = addr.switch().name;
        if (addrType === 'scAddressTypeAccount') {
          return StellarSdk.StrKey.encodeEd25519PublicKey(addr.accountId().ed25519());
        } else if (addrType === 'scAddressTypeContract') {
          return StellarSdk.StrKey.encodeContract(addr.contractId());
        }
        return 'Address';
      case 'scvLedgerKeyContractInstance':
        return 'ContractInstance';
      case 'scvLedgerKeyNonce':
        try {
          const nonceKey = scVal.nonceKey();
          const nonceValue = nonceKey.nonce();
          return `${nonceValue.toString()}u64`;
        } catch (e) {
          return 'Nonce';
        }
      case 'scvContractInstance':
        return 'ContractInstance';
      case 'scvTimepoint':
        const timestamp = scVal.timepoint().toString();
        // Convert to human-readable date if it looks like a Unix timestamp
        try {
          const date = new Date(parseInt(timestamp) * 1000);
          return `${date.toISOString()} (${timestamp})`;
        } catch {
          return `Timepoint(${timestamp})`;
        }
      case 'scvDuration':
        const duration = scVal.duration().toString();
        return `${duration}s`;
      default:
        return type;
    }
  } catch (e) {
    return '(decode error)';
  }
}

// Helper to extract offer IDs from result_meta_xdr for manage offer operations
function extractOfferIdFromXdr(resultMetaXdr: string, operationIndex: number): string | null {
  try {
    const txMeta = StellarSdk.xdr.TransactionMeta.fromXDR(resultMetaXdr, 'base64');

    // Handle different TransactionMeta versions
    let operations: any[] = [];
    const metaVersion = txMeta.switch();

    switch (metaVersion) {
      case 0: // v0
        operations = [txMeta.operations()];
        break;
      case 1: // v1
        operations = txMeta.v1().operations();
        break;
      case 2: // v2
        operations = txMeta.v2().operations();
        break;
      case 3: // v3
        const v3 = txMeta.v3();
        if (v3.sorobanMeta) {
          operations = v3.operations ? v3.operations() : [];
        } else {
          operations = v3.operations ? v3.operations() : [];
        }
        break;
      case 4: // v4
        const v4 = txMeta.v4();
        operations = v4.operations ? v4.operations() : [];
        break;
    }


    // Get the specific operation's changes
    if (operations && operations[operationIndex]) {
      const opChanges = operations[operationIndex].changes();

      // Look for offer ledger entries in the changes
      for (const change of opChanges) {
        const changeType = change.switch().name;

        // Check for created or updated offers
        if (changeType === 'ledgerEntryCreated' || changeType === 'ledgerEntryUpdated') {
          const entry = changeType === 'ledgerEntryCreated'
            ? change.created().data()
            : change.updated().data();

          const entryType = entry.switch().name;

          if (entryType === 'offer') {
            const offer = entry.offer();
            const offerId = offer.offerId().toString();
            return offerId;
          }
        }
      }
    } else {
    }
  } catch (error) {
  }

  return null;
}

// Helper to extract offer ID from result_xdr (ManageOfferSuccessResult)
function extractOfferIdFromResultXdr(resultXdr: string, operationIndex: number): string | null {
  try {
    const txResult = StellarSdk.xdr.TransactionResult.fromXDR(resultXdr, 'base64');

    // Get the result of the specific operation
    const results = txResult.result().results();

    if (results && results[operationIndex]) {
      const opResult = results[operationIndex];
      const tr = opResult.tr();

      if (tr) {
        const resultType = tr.switch().name;

        // Check for manage offer results
        if (resultType === 'manageSellOffer' || resultType === 'manageBuyOffer') {
          let offerResult;
          if (resultType === 'manageSellOffer') {
            offerResult = tr.manageSellOfferResult();
          } else {
            offerResult = tr.manageBuyOfferResult();
          }

          const successResult = offerResult.success();
          if (successResult) {
            const offer = successResult.offer();
            const offerType = offer.switch().name;

            // manageOfferCreated contains the new offer with its ID
            if (offerType === 'manageOfferCreated') {
              const createdOffer = offer.offer();
              const offerId = createdOffer.offerId().toString();
              return offerId;
            }
            // manageOfferUpdated also contains the offer
            else if (offerType === 'manageOfferUpdated') {
              const updatedOffer = offer.offer();
              const offerId = updatedOffer.offerId().toString();
              return offerId;
            }
            // manageOfferDeleted means the offer was consumed/removed - check offersClaimed
            else if (offerType === 'manageOfferDeleted') {
              // For deleted offers, we can check if there were trades
              const offersClaimed = successResult.offersClaimed();
              if (offersClaimed && offersClaimed.length > 0) {
              }
            }
          }
        }
      }
    }
  } catch (error) {
  }

  return null;
}

// Helper to format contract ID with truncation
function formatContractId(contractId: string): string {
  if (contractId.length > 12) {
    return `${contractId.slice(0, 4)}…${contractId.slice(-4)}`;
  }
  return contractId;
}

// Helper to format address with truncation
function formatAddress(address: string): string {
  if (address.length > 12) {
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }
  return address;
}

export const fetchTransaction = async (hash: string): Promise<TransactionDetails> => {
  let tx: any = null;
  let isArchiveTransaction = false;

  try {
    if (!server) {
      throw new Error('Horizon server not initialized. Please refresh the page.');
    }

    // Try to fetch from Horizon first
    try {
      tx = await server.transactions().transaction(hash).call();
    } catch (horizonError: any) {
      // If Horizon returns 404, check if it exists on the opposite network first
      if (horizonError.response?.status === 404 || horizonError.message?.includes('404') || horizonError.message?.includes('Not Found')) {
        // Check if transaction exists on the opposite network
        const currentNetwork = networkConfig.isTestnet ? 'Testnet' : 'Mainnet';
        const oppositeNetwork = networkConfig.isTestnet ? 'Mainnet' : 'Testnet';
        const oppositeUrl = networkConfig.isTestnet
          ? 'https://horizon.stellar.org'
          : 'https://horizon-testnet.stellar.org';

        try {
          const oppositeResponse = await fetchWithTimeout(`${oppositeUrl}/transactions/${hash}`, 5000);
          if (oppositeResponse.ok) {
            throw new Error(`Transaction not found on ${currentNetwork}. This transaction exists on ${oppositeNetwork}. Please switch networks and try again.`);
          }
        } catch (checkError: any) {
          // If the check finds it on opposite network, throw that error
          if (checkError.message?.includes('exists on')) {
            throw checkError;
          }
          // Otherwise, continue to check if it's an archive transaction
        }

        // Transaction not found on either network's Horizon - might be archive data
        isArchiveTransaction = true;
        // Continue to RPC lookup below
      } else {
        // For other errors, rethrow
        throw horizonError;
      }
    }

    // Fetch full transaction data from Horizon to get XDR fields (skip if archive transaction)
    let resultMetaXdr = null;
    let sorobanMetaXdr = null;
    if (!isArchiveTransaction && tx) {
      try {
        const horizonUrl = `${networkConfig.networkUrl}/transactions/${hash}`;
        const response = await fetchWithTimeout(horizonUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const txData = await response.json();

        const xdrFields = Object.keys(txData).filter(k => k.includes('xdr') || k.includes('meta'));

        // Get available XDR fields - try both snake_case and camelCase
        resultMetaXdr = txData.result_meta_xdr || (txData as any).resultMetaXdr;

        // Store XDR fields on tx object for later use
        (tx as any).result_meta_xdr = resultMetaXdr;
        (tx as any).result_xdr = txData.result_xdr;
        (tx as any).envelope_xdr = txData.envelope_xdr;

        // Check for soroban_meta_xdr (for Soroban transactions)
        if (txData.soroban_meta_xdr) {
          sorobanMetaXdr = txData.soroban_meta_xdr;
          (tx as any).soroban_meta_xdr = sorobanMetaXdr;
        }

        // Check if this is a fee-bumped transaction
        const envelopeXdr = txData.envelope_xdr;
        if (envelopeXdr) {
          try {
            const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
            const envelopeType = envelope.switch().name;

            if (envelopeType === 'envelopeTypeTxFeeBump' && envelope.feeBump()) {
              const innerTx = envelope.feeBump().tx().innerTx();
              const innerTxType = innerTx.switch().name;

              // Check if inner_transaction field exists in Horizon response
              if (txData.inner_transaction) {
              }

              // For fee-bumped Soroban transactions, the inner transaction hash is available in Horizon response
              if (txData.inner_transaction && txData.inner_transaction.hash) {
                const innerHash = txData.inner_transaction.hash;

                // Fetch the inner transaction to get soroban_meta_xdr
                const innerUrl = `${networkConfig.networkUrl}/transactions/${innerHash}`;
                try {
                  const innerResponse = await fetchWithTimeout(innerUrl);
                  if (!innerResponse.ok) {
                    throw new Error(`HTTP ${innerResponse.status}`);
                  }
                  const innerTxData = await innerResponse.json();
                  const innerXdrFields = Object.keys(innerTxData).filter(k => k.includes('xdr') || k.includes('meta'));
                  innerXdrFields.forEach(field => {
                  });

                  // Try to get soroban_meta_xdr from inner transaction
                  if (innerTxData.soroban_meta_xdr) {
                    sorobanMetaXdr = innerTxData.soroban_meta_xdr;
                    (tx as any).soroban_meta_xdr = sorobanMetaXdr;
                  }

                  // For result_meta_xdr, check inner transaction (it may have more detailed data)
                  if (innerTxData.result_meta_xdr) {
                    resultMetaXdr = innerTxData.result_meta_xdr;
                    (tx as any).result_meta_xdr = resultMetaXdr;
                    (tx as any).result_xdr = innerTxData.result_xdr;
                    (tx as any).envelope_xdr = innerTxData.envelope_xdr;
                    // If no soroban_meta_xdr found, use result_meta_xdr as fallback
                    if (!sorobanMetaXdr) {
                      sorobanMetaXdr = innerTxData.result_meta_xdr;
                      (tx as any).soroban_meta_xdr = sorobanMetaXdr;
                    }
                  } else {
                    // Keep the outer transaction's result_meta_xdr (already set above)
                  }
                } catch (innerErr) {
                }
              }
            }
          } catch (xdrErr) {
          }
        }

        // If result_meta_xdr is not available, try to extract resources from result_xdr
        if (!resultMetaXdr && txData.result_xdr) {
          try {
            const resultXdr = StellarSdk.xdr.TransactionResult.fromXDR(txData.result_xdr, 'base64');
            const resultCode = resultXdr.result().switch().name;

            // For successful Soroban transactions, extract resource usage from result
            if (resultCode === 'txSuccess' || resultCode === 'txFeeBumpInnerSuccess') {
              const results = resultCode === 'txFeeBumpInnerSuccess'
                ? resultXdr.result().innerResultPair().result().result().results()
                : resultXdr.result().results();

              // Look for InvokeHostFunction results
              if (results && results.length > 0) {
                for (let i = 0; i < results.length; i++) {
                  const opResult = results[i];
                  const opCode = opResult.tr().switch().name;

                  if (opCode === 'invokeHostFunction') {
                    const invokeResult = opResult.tr().invokeHostFunctionResult();
                    const invokeCode = invokeResult.switch().name;

                    if (invokeCode === 'invokeHostFunctionSuccess') {
                      // Store the result for later resource extraction
                      (tx as any).__sorobanInvokeResult = invokeResult;
                    }
                  }
                }
              }
            }
          } catch (resultErr) {
          }
        }

        // Extract resource usage from envelope sorobanData (for historical transactions)

        if (txData.envelope_xdr && !resultMetaXdr && !sorobanMetaXdr) {
          try {
            const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(txData.envelope_xdr, 'base64');
            let txToCheck = null;

            // Handle fee-bumped transactions
            if (envelope.switch().name === 'envelopeTypeTxFeeBump' && envelope.feeBump()) {
              const innerTx = envelope.feeBump().tx().innerTx();
              if (innerTx.switch().name === 'envelopeTypeTx') {
                txToCheck = innerTx.v1().tx();
              }
            } else if (envelope.switch().name === 'envelopeTypeTx' && envelope.v1()) {
              txToCheck = envelope.v1().tx();
            }

            if (txToCheck) {

              const ext = txToCheck.ext ? txToCheck.ext() : null;

              if (ext) {
                // Check the internal structure (_switch: 1 means v1 extension)
                const extSwitch = (ext as any)._switch;
                const extArm = (ext as any)._arm;
                const extValue = (ext as any)._value;

                // _switch: 1 means v1 extension (Soroban)
                if (extSwitch === 1 && extArm === 'sorobanData' && extValue) {

                  try {
                    // The sorobanData is in _value
                    const sorobanData = extValue;

                    // Store for later extraction
                    (tx as any).__envelopeSorobanData = sorobanData.toXDR('base64');
                  } catch (xdrErr) {
                  }
                } else {
                }
              } else {
              }
            } else {
            }
          } catch (envErr) {
          }
        }
      } catch (err) {
      }
    }

    // For archive transactions, fetch directly from RPC
    let archiveRpcData: any = null;
    if (isArchiveTransaction) {
      try {
        archiveRpcData = await querySorobanRpc(hash);
      } catch (rpcError: any) {
        // If RPC also fails, transaction doesn't exist
        const currentNetwork = networkConfig.isTestnet ? 'Testnet' : 'Mainnet';
        throw new Error(`Transaction not found on ${currentNetwork}. Please verify the transaction hash and network selection.`);
      }

      if (!archiveRpcData) {
        const currentNetwork = networkConfig.isTestnet ? 'Testnet' : 'Mainnet';
        throw new Error(`Transaction not found on ${currentNetwork}. Please verify the transaction hash and network selection.`);
      }

      // NOT_FOUND is OK for archive transactions - they may still have envelopeXdr and resultMetaXdr
      if (archiveRpcData.status === 'NOT_FOUND') {

        // If we have neither envelope/meta nor events, we can't show the transaction
        if (!archiveRpcData.envelopeXdr && !archiveRpcData.resultMetaXdr && !archiveRpcData.events) {
          const currentNetwork = networkConfig.isTestnet ? 'Testnet' : 'Mainnet';
          throw new Error(`Transaction not found on ${currentNetwork}. Please verify the transaction hash and network selection.`);
        }
      } else if (archiveRpcData.status === 'FAILED') {
        // Still proceed - we can show the failed transaction details
      } else if (archiveRpcData.status !== 'SUCCESS') {
        throw new Error(`Archive transaction has unexpected status: ${archiveRpcData.status}`);
      }

      const rpcData = archiveRpcData;

      // Parse envelope to get source account and ledger
      let sourceAccount = '';
      let ledger = 0;
      if (rpcData.envelopeXdr) {
        try {
          const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(rpcData.envelopeXdr, 'base64');
          const envSwitch = envelope.switch();

          if (envSwitch.name === 'envelopeTypeTx') {
            const txEnvelope = envelope.v1();
            const txBody = txEnvelope.tx();
            const sourceAcct = txBody.sourceAccount();

            // Extract source account from MuxedAccount
            if (sourceAcct.switch().name === 'keyTypeEd25519') {
              sourceAccount = StellarSdk.StrKey.encodeEd25519PublicKey(sourceAcct.ed25519());
            } else if (sourceAcct.switch().name === 'keyTypeMuxedEd25519') {
              sourceAccount = StellarSdk.StrKey.encodeEd25519PublicKey(sourceAcct.med25519().ed25519());
            }
          } else if (envSwitch.name === 'envelopeTypeTxV0') {
            const txEnvelope = envelope.v0();
            const txBody = txEnvelope.tx();
            const sourceAcctPubKey = txBody.sourceAccountEd25519();
            sourceAccount = StellarSdk.StrKey.encodeEd25519PublicKey(sourceAcctPubKey);
          }
        } catch (e) {
        }
      }

      // Get ledger from RPC data
      ledger = rpcData.ledger || 0;

      // Build a minimal tx object from RPC data
      tx = {
        id: hash,
        hash: hash,
        created_at: rpcData.createdAt || new Date().toISOString(),
        source_account: sourceAccount,
        fee_charged: rpcData.fee || '0',
        successful: true,
        ledger: ledger,
        result_meta_xdr: rpcData.resultMetaXdr,
        envelope_xdr: rpcData.envelopeXdr,
        result_xdr: rpcData.resultXdr,
      };

      resultMetaXdr = rpcData.resultMetaXdr;
    }

    let operations: any;
    if (!isArchiveTransaction) {
      operations = await server.operations()
        .forTransaction(hash)
        .limit(200)
        .call();
    } else {
      // For archive transactions, parse operations from envelope XDR
      operations = { records: [] };
      if (tx.envelope_xdr) {
        try {
          const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, 'base64');
          const envSwitch = envelope.switch();

          let transaction;
          if (envSwitch.name === 'envelopeTypeTx') {
            transaction = envelope.v1().tx();
          } else if (envSwitch.name === 'envelopeTypeTxV0') {
            transaction = envelope.v0().tx();
          }

          if (transaction) {
            const xdrOps = transaction.operations();
            operations.records = xdrOps.map((xdrOp: any, index: number) => {
              const body = xdrOp.body();
              const opType = body.switch().name;

              // Map XDR operation type to Horizon operation type
              const typeMap: Record<string, string> = {
                'invokeHostFunction': 'invoke_host_function',
                'createAccount': 'create_account',
                'payment': 'payment',
                'pathPaymentStrictReceive': 'path_payment_strict_receive',
                'pathPaymentStrictSend': 'path_payment_strict_send',
                'manageSellOffer': 'manage_sell_offer',
                'manageBuyOffer': 'manage_buy_offer',
                'createPassiveSellOffer': 'create_passive_sell_offer',
                'setOptions': 'set_options',
                'changeTrust': 'change_trust',
                'allowTrust': 'allow_trust',
                'accountMerge': 'account_merge',
                'manageData': 'manage_data',
                'bumpSequence': 'bump_sequence',
                'claimClaimableBalance': 'claim_claimable_balance',
                'beginSponsoringFutureReserves': 'begin_sponsoring_future_reserves',
                'endSponsoringFutureReserves': 'end_sponsoring_future_reserves',
                'revokeSponsorship': 'revoke_sponsorship',
                'clawback': 'clawback',
                'clawbackClaimableBalance': 'clawback_claimable_balance',
                'setTrustLineFlags': 'set_trust_line_flags',
                'liquidityPoolDeposit': 'liquidity_pool_deposit',
                'liquidityPoolWithdraw': 'liquidity_pool_withdraw',
              };

              const horizonType = typeMap[opType] || opType.toLowerCase();

              const opRecord: any = {
                id: `${hash}-${index}`,
                type: horizonType,
                type_i: body.switch().value,
                source_account: tx.source_account,
                transaction_hash: hash,
              };

              // For invoke_host_function operations, extract the host function XDR
              if (opType === 'invokeHostFunction') {
                try {
                  const hostFunction = body.invokeHostFunction();
                  opRecord.host_function_xdr = hostFunction.toXDR('base64');
                } catch (e) {
                }
              }

              return opRecord;
            });

          }
        } catch (e) {
        }
      }
    }

    // Normalize source_account fields immediately - Horizon sometimes returns arrays
    operations.records = operations.records.map(op => ({
      ...op,
      source_account: extractAccountAddress(op.source_account)
    }));

    // Extract ORIGINAL offer_ids from transaction envelope XDR (before effects modify them)
    if (tx.envelope_xdr) {
      try {
        const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, 'base64');
        let transaction;
        if (envelope.switch() === StellarSdk.xdr.EnvelopeType.envelopeTypeTx()) {
          transaction = envelope.v1().tx();
        } else if (envelope.switch() === StellarSdk.xdr.EnvelopeType.envelopeTypeTxV0()) {
          transaction = envelope.v0().tx();
        } else {
        }

        if (transaction) {
          const xdrOperations = transaction.operations();
          operations.records.forEach((op, index) => {
            if (index < xdrOperations.length) {
              const xdrOp = xdrOperations[index];
              const opBody = xdrOp.body();
              const opSwitch = opBody.switch();

              // Extract original offer_id and price_r for offer operations
              if (opSwitch === StellarSdk.xdr.OperationType.manageSellOffer()) {
                try {
                  // Use _value directly - it's the actual XDR structure
                  const offerOp = opBody._value;

                  const offerIdObj = offerOp.offerId();
                  const offerIdStr = String(offerIdObj.low === 0 && offerIdObj.high === 0 ? 0 : offerIdObj);
                  (op as any).original_offer_id = offerIdStr;

                  // Extract price_r from XDR
                  const priceObj = offerOp.price();
                  if (priceObj) {
                    (op as any).price_r = {
                      n: priceObj.n(),
                      d: priceObj.d()
                    };
                  }
                } catch (sellOfferError) {
                }
              }

              if (opSwitch === StellarSdk.xdr.OperationType.manageBuyOffer()) {
                try {
                  // Use _value directly - it's the actual XDR structure
                  const offerOp = opBody._value;

                  const offerIdObj = offerOp.offerId();
                  const offerIdStr = String(offerIdObj.low === 0 && offerIdObj.high === 0 ? 0 : offerIdObj);
                  (op as any).original_offer_id = offerIdStr;

                  // Extract price_r from XDR
                  const priceObj = offerOp.price();
                  if (priceObj) {
                    (op as any).price_r = {
                      n: priceObj.n(),
                      d: priceObj.d()
                    };
                  }
                } catch (buyOfferError) {
                }
              }

              if (opSwitch === StellarSdk.xdr.OperationType.createPassiveSellOffer()) {
                try {
                  // Use _value directly - it's the actual XDR structure
                  const offerOp = opBody._value;

                  // Extract price_r from XDR
                  const priceObj = offerOp.price();
                  if (priceObj) {
                    (op as any).price_r = {
                      n: priceObj.n(),
                      d: priceObj.d()
                    };
                  }
                } catch (passiveOfferError) {
                }
              }
            }
          });
        }
      } catch (xdrError) {
      }
    }

    // Log each operation in detail
    operations.records.forEach((op, index) => {

      if (op.type === 'invoke_host_function') {

        // Check every possible field that might contain contract info
        const possibleContractFields = [
          'contract_id', 'contractId', 'contract_address', 'contractAddress',
          'address', 'contract', 'target', 'destination', 'account_id',
          'host_function', 'hostFunction', 'function', 'invoke_contract',
          'parameters', 'args', 'auth', 'footprint', 'resource_fee'
        ];

        possibleContractFields.forEach(field => {
          if ((op as any)[field] !== undefined) {
          }
        });

        // Deep scan for any field containing 'C' followed by base32 characters
        const scanForContractIds = (obj: any, path = ''): void => {
          if (typeof obj === 'string' && /^C[A-Z2-7]{55,62}$/.test(obj)) {
          }
          if (typeof obj === 'object' && obj !== null) {
            Object.entries(obj).forEach(([key, value]) => {
              scanForContractIds(value, path ? `${path}.${key}` : key);
            });
          }
        };
        scanForContractIds(op, 'operation');
      }
    });

    // Enhanced Soroban processing
    const sorobanOperations: SorobanOperation[] = [];
    const events: ContractEvent[] = [];

    // Try to get Soroban details for both testnet and mainnet
    let sorobanData = null;
    try {
      // If this is an archive transaction, reuse the RPC data we already fetched
      if (isArchiveTransaction && archiveRpcData) {
        sorobanData = archiveRpcData;
      } else {
        sorobanData = await querySorobanRpc(hash);
      }

      // CRITICAL: Add resultMetaXdr from RPC to tx object for state changes extraction
      if (sorobanData && sorobanData.resultMetaXdr) {
        (tx as any).result_meta_xdr = sorobanData.resultMetaXdr;
      } else if (sorobanData && sorobanData.status === 'NOT_FOUND') {
        // Transaction not found in primary RPC, try alternative endpoints

        const alternativeRpcUrls = networkConfig.isTestnet
          ? ['https://soroban-testnet.stellar.org', 'https://rpc-futurenet.stellar.org']
          : ['https://soroban-rpc.mainnet.stellar.gateway.fm'];

        for (const rpcUrl of alternativeRpcUrls) {
          try {
            const altResponse = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                method: 'getTransaction',
                params: { hash }
              })
            });
            const altData = await altResponse.json();
            if (altData.result && altData.result.status === 'SUCCESS' && altData.result.resultMetaXdr) {
              sorobanData = altData.result;
              (tx as any).result_meta_xdr = altData.result.resultMetaXdr;
              break;
            }
          } catch (altError) {
          }
        }
      }
    } catch (sorobanError) {
    }

    // Process operations and extract contract IDs
    const contractIds: Map<number, string> = new Map();

    for (let i = 0; i < operations.records.length; i++) {
      const op = operations.records[i];

      if (op.type === 'invoke_host_function') {

        // Try multiple extraction methods - pass transaction envelope XDR directly
        const contractId = await extractContractId(op, sorobanData, i, tx.hash, tx.envelope_xdr);

        if (contractId && contractId !== 'Unknown') {
          contractIds.set(i, contractId);

          // Pre-fetch contract metadata to ensure it's cached for event processing
          simpleContractMetadataService.getContractMetadata(contractId).catch(() => {
            // Silently fail - we'll use fallback processing if metadata isn't available
          });

          // Extract function details with enhanced data
          // For Soroban operations, we extract all effects from XDR state changes
          // No need to fetch from Horizon API - it's less accurate for Soroban
          const functionDetails = extractFunctionDetails(op, sorobanData, i, tx, contractId);

          const allEvents = functionDetails.events || [];

          // Create ledger effects from state changes and events (extracted from XDR)
          const ledgerEffects: any[] = [];

          // Process contract events dynamically using contract specs
          // CRITICAL: Only include effects from events that belong to THIS contract
          if (functionDetails.events && functionDetails.events.length > 0) {
            const eventEffects = await processEventsToEffects(functionDetails.events, contractId);
            // Filter to only include effects from THIS contract (exclude cross-contract call effects)
            const filteredEventEffects = eventEffects.filter(effect =>
              effect.contractId === contractId || !effect.contractId
            );
            ledgerEffects.push(...filteredEventEffects);
          }

          // Then add state changes as effects (contract data changes)
          // IMPORTANT: Keep the exact order from the transaction, no merging/deduplication
          // CRITICAL: Only include state changes that belong to THIS specific contract
          if (functionDetails.stateChanges && functionDetails.stateChanges.length > 0) {
            functionDetails.stateChanges.forEach((change: any, idx: number) => {
              // Skip ledgerEntryState changes (these are just "before" snapshots)
              // Only show actual modifications: created, updated, removed
              if (change.changeType === 'ledgerEntryState') {
                return; // Skip
              }

              // Filter out internal metadata updates (LedgerKeyContractInstance)
              // These are contract instance updates that happen automatically
              if (change.keyDisplay === '<LedgerKeyContractInstance>') {
                return; // Skip internal metadata
              }

              // Filter out TTL extensions - these are automatic and not user-relevant
              if (change.keyDisplay === '<LedgerKeyTTL>' || change.ledgerEntryType === 'ttl') {
                return; // Skip TTL
              }

              // CRITICAL: Only include state changes for THIS specific contract
              // This prevents showing state changes from other contracts in multi-contract calls
              if (change.contractId && change.contractId !== contractId) {
                return; // Skip state changes from other contracts
              }

              // Add the change to effects in the exact order it appears
              // Use after for updated/created, before for removed, or value for others
              const effectData = change.after || change.before || change.value || change.data;
              ledgerEffects.push({
                ...change,
                data: effectData,
                description: change.description || `${change.type} ${change.storageType || ''} data`,
                value: effectData
              });
            });
          }

          sorobanOperations.push({
            type: 'soroban',
            contractId,
            functionName: functionDetails.functionName,
            args: functionDetails.args,
            auth: functionDetails.auth,
            result: functionDetails.result,
            error: functionDetails.error,
            events: allEvents,
            effects: ledgerEffects,
            stateChanges: functionDetails.stateChanges,
            ttlExtensions: functionDetails.ttlExtensions,
            resourceUsage: functionDetails.resourceUsage,
            crossContractCalls: functionDetails.crossContractCalls,
            ...(functionDetails.instanceStorage && { instanceStorage: functionDetails.instanceStorage }),
            ...(functionDetails.persistentStorage && { persistentStorage: functionDetails.persistentStorage }),
            ...(functionDetails.temporaryStorage && { temporaryStorage: functionDetails.temporaryStorage }),
            ...(functionDetails.wasmHash && { wasmHash: functionDetails.wasmHash }),
            ...(functionDetails.contractExecutable && { contractExecutable: functionDetails.contractExecutable }),
            ...(functionDetails.hostFunctionType && { hostFunctionType: functionDetails.hostFunctionType })
          } as any);

          // Extract events for this operation
          if (functionDetails.events && functionDetails.events.length > 0) {
            const filteredEvents = functionDetails.events
              .filter((event: any) => {
                // Keep events with topics OR data
                if (!event.topics && !event.data) {
                  return false;
                }

                // If there are topics, check if it's a diagnostic event
                if (event.topics && event.topics.length > 0) {
                  try {
                    const firstTopic = event.topics[0];
                    const eventType = typeof firstTopic === 'string'
                      ? firstTopic.toLowerCase()
                      : String(firstTopic).toLowerCase();

                    // Don't filter fn_call and fn_return - we need them!
                    if (eventType === 'diagnostic_event') {
                      return false;
                    }
                  } catch (e) {
                  }
                }

                return true;
              })
              .map((event: any) => {
                const decodedTopics = (event.topics || []).map((t: any) => decodeScVal(t));
                const decodedData = event.data ? decodeScVal(event.data) : null;

                return {
                  contractId: event.contractId || contractId,
                  type: event.type,
                  topics: decodedTopics,
                  data: decodedData,
                  inSuccessfulContractCall: event.inSuccessfulContractCall
                };
              });
            events.push(...filteredEvents);
          }
        } else {

          // Add a placeholder soroban operation
          sorobanOperations.push({
            type: 'soroban',
            contractId: 'Unknown Contract',
            functionName: 'invoke',
            args: [],
            auth: [],
            error: 'Could not extract contract information'
          });
        }
      }
    }

    // Determine if this is a pure Soroban transaction
    const hasSorobanOperations = sorobanOperations.length > 0;
    const hasClassicalOperations = operations.records.some((op: any) =>
      op.type !== 'invoke_host_function'
    );

    // Fetch transaction effects
    let effects: any[] = [];

    // Only fetch Horizon effects if there are classical operations
    // For pure Soroban transactions, we extract effects from XDR state changes instead
    if (hasClassicalOperations) {
      try {
        const effectsResponse = await tx.effects({ limit: 200 });
        const horizonEffects = effectsResponse.records || [];

        // If there are also Soroban operations, filter out any Soroban-related effects from Horizon
        // to avoid duplicates (we extract those from XDR)
        if (hasSorobanOperations) {
          effects = horizonEffects.filter((effect: any) =>
            !effect.type.includes('contract_') &&
            effect.type !== 'liquidity_pool_trade' // Soroban can also trigger this
          );
        } else {
          effects = horizonEffects;
        }
      } catch (effectsError: any) {
      }

      // Decode base64 values in data-related effects
      effects = effects.map((effect: any) => {
        if (effect.type === 'data_created' || effect.type === 'data_updated' || effect.type === 'data_removed') {
          const decodedEffect = { ...effect };

          // Decode name if it's base64
          if (effect.name) {
            decodedEffect.name = decodeBase64Value(effect.name);
            decodedEffect.name_base64 = effect.name;
          }

          // Decode value if it's base64 (data_created and data_updated have values)
          if (effect.value) {
            decodedEffect.value = decodeBase64Value(effect.value);
            decodedEffect.value_base64 = effect.value;
          }

          return decodedEffect;
        }
        return effect;
      });
    }

    // Add Soroban contract effects extracted from XDR state changes
    // These are more accurate than Horizon effects for Soroban operations
    sorobanOperations.forEach((op: any) => {
      if (op.effects && op.effects.length > 0) {
        effects.push(...op.effects);
      }
    });

    // Convert SAC token events to account effects for better visibility
    // This ensures burn/mint/transfer events show up as account_burned/credited/debited
    const convertEventsToAccountEffects = async (events: any[]): Promise<any[]> => {
      const accountEffects: any[] = [];

      for (const event of events || []) {
        if (!event.topics || event.topics.length === 0) continue;

        // Topics are already decoded by decodeScVal
        const eventType = String(event.topics[0]).toLowerCase();
        const topics = event.topics.slice(1);

        // Data is a single decoded value (not an array)
        const amountValue = event.data;
        let amount = '';
        if (amountValue !== null && amountValue !== undefined) {
          if (typeof amountValue === 'number' || typeof amountValue === 'string' || typeof amountValue === 'bigint') {
            amount = String(amountValue);
          } else if (typeof amountValue === 'object' && 'value' in amountValue) {
            // Handle wrapped values
            amount = String(amountValue.value);
          }
        }

        // Skip if no amount
        if (!amount) continue;

        // Get asset info from contract metadata
        const contractId = event.contractId;
        let assetCode = 'TOKEN';
        let decimals = 7;

        // Try to extract asset symbol from topics
        // Note: topics array has event type removed (line 1211: topics = event.topics.slice(1))
        // For transfer events: topics = [from, to, asset_info]
        // For mint events: topics = [recipient, asset_info]
        // For burn events: topics = [from, asset_info]
        let extractedSymbol: string | null = null;

        if (eventType === 'transfer' && topics.length >= 3) {
          extractedSymbol = String(topics[2]);
        } else if (eventType === 'mint' && topics.length >= 2) {
          extractedSymbol = String(topics[1]);
        } else if (eventType === 'burn' && topics.length >= 2) {
          extractedSymbol = String(topics[1]);
        }

        if (extractedSymbol) {
          // Direct 'native' check
          if (extractedSymbol.toLowerCase() === 'native' || extractedSymbol.toLowerCase() === 'stellar:native') {
            assetCode = 'XLM';
          }
          // Symbol with colon format (e.g., "USDC:GBDX...")
          else if (extractedSymbol.includes(':')) {
            assetCode = extractedSymbol.split(':')[0];
          }
          // Plain symbol (e.g., "USDC")
          else if (extractedSymbol && extractedSymbol !== 'undefined') {
            assetCode = extractedSymbol;
          }
        }

        // Try to get additional info from contract metadata
        try {
          const metadata = await simpleContractMetadataService.getContractMetadata(contractId);
          if (metadata?.isToken) {
            if (metadata.tokenSymbol) {
              assetCode = metadata.tokenSymbol;
              // SAC contracts for native XLM might return "native", convert to "XLM"
              if (assetCode.toLowerCase() === 'native' || assetCode.toLowerCase() === 'stellar:native') {
                assetCode = 'XLM';
              }
            }
            if (metadata.tokenDecimals !== undefined) {
              decimals = metadata.tokenDecimals;
            }
          } else if (metadata?.tokenSymbol) {
            // Some SAC contracts might not be marked as isToken but still have symbol
            assetCode = metadata.tokenSymbol;
            // SAC contracts for native XLM might return "native", convert to "XLM"
            if (assetCode.toLowerCase() === 'native' || assetCode.toLowerCase() === 'stellar:native') {
              assetCode = 'XLM';
            }
            if (metadata.tokenDecimals !== undefined) {
              decimals = metadata.tokenDecimals;
            }
          } else {
          }
        } catch (e) {
          // Use extracted symbol or defaults if metadata fetch fails
        }

        // Format amount with proper decimals
        const formattedAmount = simpleContractMetadataService.formatAmount(amount, decimals);

        // Helper to format account address
        const formatAccount = (addr: any): string | null => {
          if (!addr) return null;
          if (typeof addr === 'string') {
            // Already a string address
            return addr;
          }
          if (typeof addr === 'object' && addr.value) {
            return String(addr.value);
          }
          return String(addr);
        };

        switch (eventType) {
          case 'burn':
            const burnAccount = formatAccount(topics[0]);
            if (burnAccount) {
              accountEffects.push({
                type: 'account_burned',
                account: burnAccount,
                amount: formattedAmount,
                asset_code: assetCode,
                asset_type: 'credit_alphanum12',
                contractId
              });
            }
            break;

          case 'mint':
            const mintAccount = formatAccount(topics[0]);
            if (mintAccount) {
              const mintEffect = {
                type: 'account_minted',
                account: mintAccount,
                amount: formattedAmount,
                asset_code: assetCode,
                asset_type: 'credit_alphanum12',
                contractId
              };
              accountEffects.push(mintEffect);
            } else {
            }
            break;

          case 'transfer':
            const fromAccount = formatAccount(topics[0]);
            const toAccount = formatAccount(topics[1]);

            if (fromAccount && toAccount) {
              // Debit from sender
              accountEffects.push({
                type: 'account_debited',
                account: fromAccount,
                amount: formattedAmount,
                asset_code: assetCode,
                asset_type: 'credit_alphanum12',
                contractId
              });
              // Credit to receiver
              accountEffects.push({
                type: 'account_credited',
                account: toAccount,
                amount: formattedAmount,
                asset_code: assetCode,
                asset_type: 'credit_alphanum12',
                contractId
              });
            }
            break;
        }
      }

      return accountEffects;
    };

    // Add account effects from all transaction events

    const eventAccountEffects = await convertEventsToAccountEffects(events);

    // Debug logging
    if (eventAccountEffects.length > 0) {
    } else {
    }

    effects.push(...eventAccountEffects);

    const sourceAccount = extractAccountAddress(tx.source_account);

    // Enrich operations with actual offer IDs from effects or XDR
    const txMetaXdr = (tx as any).result_meta_xdr;
    const enrichedOperations = await Promise.all(operations.records.map(async (op: any, opIndex: number) => {

      if ((op.type === 'manage_sell_offer' || op.type === 'manage_buy_offer') &&
        (String(op.offer_id) === '0' || !op.offer_id)) {

        // Try to get offer ID from various effect types
        const offerEffect = effects.find((eff: any) =>
          eff.operation === op.id &&
          (eff.type === 'trade' || eff.type === 'manage_offer')
        );

        if (offerEffect && offerEffect.offer_id) {
          return { ...op, offer_id: String(offerEffect.offer_id), _enriched: true };
        }

        // If effects didn't provide the offer ID, try extracting from result meta XDR
        if (txMetaXdr) {
          const xdrOfferId = extractOfferIdFromXdr(txMetaXdr, opIndex);
          if (xdrOfferId) {
            return { ...op, offer_id: xdrOfferId, _enriched: true };
          }
        }

        // Try extracting from result_xdr (ManageOfferSuccessResult)
        const txResultXdr = (tx as any).result_xdr;
        if (txResultXdr) {
          const resultOfferId = extractOfferIdFromResultXdr(txResultXdr, opIndex);
          if (resultOfferId) {
            return { ...op, offer_id: resultOfferId, _enriched: true };
          }
        }

        // Fallback: Query active offers for the account
        // This handles cases (like Testnet) where XDR/effects might not link clearly
        try {
          if (server) {
            const accountToQuery = op.source_account || sourceAccount;
            const offers = await server.offers()
              .forAccount(accountToQuery)
              .order('desc')
              .limit(50)
              .call();


            // Find offer created/modified in this transaction's ledger
            // The ledger number is the most reliable link we have here
            const txLedger = Number(tx.ledger);
            const matchingOffer = offers.records.find(offer =>
              Number(offer.last_modified_ledger) === txLedger
            );

            if (matchingOffer) {
              return { ...op, offer_id: matchingOffer.id, _enriched: true };
            } else {
              if (offers.records.length > 0) {
              }
            }
          } else {
          }
        } catch (err) {
          // Silently fail fallback and return original op
        }
      }
      return op;
    }));

    // Extract all state changes from Soroban operations only (not classic operations)
    let allStateChanges: StateChange[] = [];
    try {
      if ((tx as any).result_meta_xdr) {
        const meta = StellarSdk.xdr.TransactionMeta.fromXDR((tx as any).result_meta_xdr, 'base64');

        // Extract state changes only from Soroban operations
        for (let opIndex = 0; opIndex < enrichedOperations.length; opIndex++) {
          const operation = enrichedOperations[opIndex];
          // Only extract state changes for Soroban operations
          if (operation.type === 'invoke_host_function' || operation.type === 'invokeHostFunction') {
            const metaDetails = extractMetaDetails(meta, opIndex);
            if (metaDetails.stateChanges && metaDetails.stateChanges.length > 0) {
              allStateChanges.push(...metaDetails.stateChanges.map(change => ({
                ...change,
                operationIndex: opIndex
              })));
            }
          }
        }
      }
    } catch (error) {
    }

    const result: TransactionDetails = {
      hash: tx.hash,
      sourceAccount,
      fee: String((tx as any).fee_charged || (tx as any).fee_paid || '0'),
      feeCharged: String((tx as any).fee_charged || (tx as any).fee_paid || '0'),
      maxFee: String(tx.max_fee || '0'),
      operations: enrichedOperations,
      status: tx.successful ? 'success' : 'failed',
      sorobanOperations,
      events,
      effects,
      allStateChanges,
      ledgerTimestamp: new Date(tx.created_at).getTime()
    };

    // Always populate debugInfo with XDR data (needed for offer ID extraction)
    try {
      result.debugInfo = await decodeTransactionXdr(tx);
    } catch (xdrError) {
      // If decoding fails, at least populate the raw XDR
      result.debugInfo = {
        resultXdr: tx.result_xdr,
        envelopeXdr: tx.envelope_xdr,
        metaXdr: tx.result_meta_xdr || resultMetaXdr
      };
    }

    // Add error information for failed transactions
    if (!tx.successful) {
      result.errorMessage = (tx as any).result_codes?.transaction;
      result.operationErrors = (tx as any).result_codes?.operations || [];
      result.resultCodes = (tx as any).result_codes;
    }

    // Add simulation result for Soroban transactions
    if (sorobanOperations.length > 0) {
      try {
        // Attach XDR metadata to tx object for use in simulation
        const txWithMeta = {
          ...tx,
          result_meta_xdr: resultMetaXdr,
          soroban_meta_xdr: sorobanMetaXdr
        };
        const simResult = await simulateTransactionWithDebugger(hash, txWithMeta);
        result.simulationResult = {
          ...simResult.simulation,
          enhancedDebugInfo: simResult.debugInfo
        };
      } catch (simError) {
      }

      // Parse contract invocations from events
      try {
        const { parseContractInvocations } = await import('./contractInvocationParser');
        result.contractInvocations = parseContractInvocations(events, tx.source_account);
      } catch (invocationError) {
      }
    }
    return result;

  } catch (error: any) {
    // Check if it's an HTTP error from our fetchWithTimeout
    if (error.message?.includes('HTTP 404')) {
      // Check if transaction exists on the opposite network
      const currentNetwork = networkConfig.isTestnet ? 'Testnet' : 'Mainnet';
      const oppositeNetwork = networkConfig.isTestnet ? 'Mainnet' : 'Testnet';
      const oppositeUrl = networkConfig.isTestnet
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';

      try {
        const oppositeResponse = await fetchWithTimeout(`${oppositeUrl}/transactions/${hash}`, 5000);
        if (oppositeResponse.ok) {
          throw new Error(`Transaction not found on ${currentNetwork}. This transaction exists on ${oppositeNetwork}. Please switch networks and try again.`);
        }
      } catch (checkError: any) {
        // If the check fails or times out, just show the standard error
        if (checkError.message?.includes('exists on')) {
          throw checkError; // Re-throw our custom error
        }
      }

      throw new Error('Transaction not found (404). Please verify the transaction hash and network selection.');
    }
    if (error.message?.includes('HTTP 500') || error.message?.includes('HTTP 502') || error.message?.includes('HTTP 503')) {
      throw new Error('Horizon server error. The server is temporarily unavailable. Please try again later.');
    }
    if (error.message?.includes('timeout')) {
      throw new Error('Request timeout. The server took too long to respond. Please try again.');
    }
    // Check for network/fetch failures
    if (error.name === 'TypeError' && error.message?.includes('fetch')) {
      throw new Error('Network error. Unable to connect to Horizon server. Please check your internet connection.');
    }
    // Generic error
    throw new Error(`Failed to fetch transaction: ${error.message}`);
  }
};

const scValToNative = (scVal: any): any => {
  try {
    const valType = scVal.switch().name || String(scVal.switch());

    switch (valType) {
      case 'scvBool':
        return scVal.b();
      case 'scvVoid':
      case 'scvU32':
        return scVal.u32();
      case 'scvI32':
        return scVal.i32();
      case 'scvU64':
        return scVal.u64().toString();
      case 'scvI64':
        return scVal.i64().toString();
      case 'scvU128':
        const u128 = scVal.u128();
        return `${u128.hi().toString()}:${u128.lo().toString()}`;
      case 'scvI128':
        const i128 = scVal.i128();
        return `${i128.hi().toString()}:${i128.lo().toString()}`;
      case 'scvBytes':
        const bytes = scVal.bytes();
        return Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
      case 'scvString':
        return scVal.str().toString();
      case 'scvSymbol':
        return scVal.sym().toString();
      case 'scvVec':
        const vec = scVal.vec();
        return vec ? vec.map((v: any) => scValToNative(v)) : [];
      case 'scvMap':
        const map = scVal.map();
        if (!map) return {};
        const result: any = {};
        map.forEach((entry: any) => {
          const key = scValToNative(entry.key());
          const val = scValToNative(entry.val());
          result[key] = val;
        });
        return result;
      case 'scvAddress':
        try {
          const address = scVal.address();
          const addrType = address.switch().name || String(address.switch());
          if (addrType === 'scAddressTypeAccount') {
            return StellarSdk.StrKey.encodeEd25519PublicKey(address.accountId().ed25519());
          } else if (addrType === 'scAddressTypeContract') {
            return StellarSdk.StrKey.encodeContract(address.contractId());
          }
        } catch { }
        return 'Address';
      case 'scvLedgerKeyContractInstance':
        return 'ContractInstance';
      case 'scvLedgerKeyNonce':
        return 'Nonce';
      default:
        return `<${valType}>`;
    }
  } catch (err) {
    return '<parse error>';
  }
};

const querySorobanRpc = async (hash: string) => {
  const rpcUrl = networkConfig.isTestnet
    ? 'https://soroban-testnet.stellar.org'
    : 'https://soroban-rpc.mainnet.stellar.gateway.fm';

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'getTransaction',
      params: {
        hash: hash
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Soroban RPC HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Soroban RPC error: ${data.error.message}`);
  }


  return data.result;
};

const extractContractId = async (operation: any, sorobanData: any, operationIndex: number, transactionHash?: string, envelopeXdr?: string): Promise<string> => {

  if (operation.type !== 'invoke_host_function') {
    return `Non_Contract_Op${operationIndex + 1}`;
  }

  // Method 0: Direct field extraction with extensive logging
  const directFields = [
    'contract_id', 'contractId', 'contract_address', 'contractAddress',
    'address', 'contract', 'target', 'destination', 'account_id'
  ];

  for (const field of directFields) {
    if (operation[field]) {
      if (typeof operation[field] === 'string' && /^C[A-Z2-7]{55,62}$/.test(operation[field])) {
        return operation[field];
      }
    }
  }

  // Method 0.5: Check parameters array for contract address
  if (operation.parameters && Array.isArray(operation.parameters)) {
    for (let i = 0; i < operation.parameters.length; i++) {
      const param = operation.parameters[i];

      if (param.type === 'Address' && param.value) {
        try {
          // The value is base64 XDR, decode it
          const scVal = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');

          if (scVal.switch() === StellarSdk.xdr.ScValType.scvAddress()) {
            const address = scVal.address();

            if (address.switch() === StellarSdk.xdr.ScAddressType.scAddressTypeContract()) {
              const contractId = Buffer.from(Array.from(address.contractId() as any));
              return StellarSdk.StrKey.encodeContract(contractId);
            }
          }
        } catch (paramError) {
        }
      }
    }
  }

  // Method 1: Host function field extraction
  if (operation.type === 'invoke_host_function' && operation.host_function) {
    try {
      const hostFunctionXdr = operation.host_function;

      const hostFunction = StellarSdk.xdr.HostFunction.fromXDR(hostFunctionXdr, 'base64');

      if (hostFunction.switch() === StellarSdk.xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
        const invokeContract = hostFunction.invokeContract();
        const contractAddress = invokeContract.contractAddress();

        if (contractAddress.switch() === StellarSdk.xdr.ScAddressType.scAddressTypeContract()) {
          const contractId = Buffer.from(Array.from(contractAddress.contractId() as any));
          const contractIdStr = StellarSdk.StrKey.encodeContract(contractId);
          return contractIdStr;
        }
      }
    } catch (hostFunctionError) {
    }
  }

  // Method 2: Parameters extraction
  if (operation.parameters) {
    try {
      const params = operation.parameters;
      if (params.contractAddress) {
        return params.contractAddress;
      }
      if (params.contractId) {
        return params.contractId;
      }
    } catch (paramError) {
    }
  }

  // Method 3: Soroban RPC data
  if (sorobanData) {

    try {
      if (sorobanData.createContractResult?.contractId) {
        return sorobanData.createContractResult.contractId;
      }

      if (sorobanData.results && sorobanData.results[operationIndex]) {
        const opResult = sorobanData.results[operationIndex];

        if (opResult.contractId) {
          return opResult.contractId;
        }
        if (opResult.contractAddress && opResult.contractAddress.startsWith('C')) {
          return opResult.contractAddress;
        }
      }
    } catch (rpcError) {
    }
  }

  // Method 4: Transaction envelope XDR extraction

  try {
    if (!envelopeXdr) {
      throw new Error('No envelope XDR available');
    }
    const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');

    let transaction;
    if (envelope.switch() === StellarSdk.xdr.EnvelopeType.envelopeTypeTx()) {
      transaction = envelope.v1().tx();
    } else if (envelope.switch() === StellarSdk.xdr.EnvelopeType.envelopeTypeTxV0()) {
      transaction = envelope.v0().tx();
    } else {
      throw new Error('Unsupported envelope type');
    }

    const operations = transaction.operations();

    if (operations && operations[operationIndex]) {
      const op = operations[operationIndex];

      if (op.body().switch() === StellarSdk.xdr.OperationType.invokeHostFunction()) {
        const invokeHostFunctionOp = op.body().invokeHostFunctionOp();
        const hostFunc = invokeHostFunctionOp.hostFunction();

        if (hostFunc.switch() === StellarSdk.xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
          const invokeContract = hostFunc.invokeContract();
          const contractAddress = invokeContract.contractAddress();

          if (contractAddress.switch() === StellarSdk.xdr.ScAddressType.scAddressTypeContract()) {
            const contractId = contractAddress.contractId();
            const contractIdStr = StellarSdk.StrKey.encodeContract(contractId);
            return contractIdStr;
          } else {
          }
        } else {
        }
      } else {
      }
    } else {
    }
  } catch (xdrError) {
  }

  if (!networkConfig.isTestnet) {
    return `Mainnet_Contract_Op${operationIndex + 1}`;
  }

  return `Unknown_Contract_Op${operationIndex + 1}`;
};

// Helper function to format effect descriptions for display
const formatEffectDescription = (effect: any, contractId: string): string => {
  const formatAddress = (addr: string) => addr ? `${addr.substring(0, 4)}…${addr.substring(addr.length - 4)}` : 'Unknown';
  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return num.toLocaleString('en-US', { maximumFractionDigits: 7 });
  };

  switch (effect.type) {
    case 'contract_credited':
      return `Credited: ${formatAmount(effect.amount)} ${effect.asset_code || formatAddress(contractId)} → ${formatAddress(effect.account || effect.contract)}`;
    case 'contract_debited':
      return `Debited: ${formatAmount(effect.amount)} ${effect.asset_code || formatAddress(contractId)} from ${formatAddress(effect.account || effect.contract)}`;
    case 'account_credited':
      return `Credited: ${formatAmount(effect.amount)} ${effect.asset_code || 'XLM'} → ${formatAddress(effect.account)}`;
    case 'account_debited':
      return `Debited: ${formatAmount(effect.amount)} ${effect.asset_code || 'XLM'} from ${formatAddress(effect.account)}`;
    default:
      return `${effect.type.replace(/_/g, ' ')}: ${safeStringify(effect).substring(0, 50)}...`;
  }
};

const findContractIdInObject = (obj: any, visited = new Set()): string | null => {
  if (!obj || visited.has(obj)) return null;
  visited.add(obj);

  if (typeof obj === 'string') {
    // Check if it looks like a contract ID
    if (/^C[A-Z2-7]{55,62}$/.test(obj)) {
      return obj;
    }
  }

  if (typeof obj === 'object') {
    // Check common contract ID field names
    const contractFields = [
      'contract_id', 'contractId', 'contract_address', 'contractAddress',
      'address', 'id', 'contract', 'target', 'destination', 'account_id',
      'source_account', 'contract_data_xdr', 'contract_code_xdr',
      // MAINNET specific fields
      'invoke_contract', 'host_function', 'soroban_operation',
      'contract_call', 'function_call', 'smart_contract'
    ];

    for (const field of contractFields) {
      if (obj[field] && typeof obj[field] === 'string' &&
        /^C[A-Z2-7]{55,62}$/.test(obj[field])) {
        return obj[field];
      }
    }

    // Recursively search nested objects
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const result = findContractIdInObject(obj[key], visited);
        if (result) return result;
      }
    }

    // Search arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = findContractIdInObject(item, visited);
        if (result) return result;
      }
    }
  }

  return null;
};

const extractFunctionDetails = (operation: any, sorobanData: any, operationIndex: number, tx?: any, knownContractId?: string) => {
  const details: any = {
    functionName: 'invoke',
    args: [],
    auth: [],
    result: null,
    error: null,
    events: [],
    stateChanges: [],
    ttlExtensions: [],
    resourceUsage: null
  };

  // Try to extract from Soroban RPC data
  if (sorobanData) {
    try {
      if (sorobanData.results && sorobanData.results[operationIndex]) {
        const opResult = sorobanData.results[operationIndex];
        details.result = opResult.result;
        // DON'T use opResult.events - we get events from diagnosticEventsXdr instead
        // details.events = opResult.events || [];
      }

      if (sorobanData.auth && sorobanData.auth[operationIndex]) {
        details.auth = sorobanData.auth[operationIndex];
      }

      // Extract diagnostic events from XDR if available
      if (sorobanData.diagnosticEventsXdr) {
        try {
          // diagnosticEventsXdr is an array of base64 XDR strings, one per event
          const eventsXdrArray = Array.isArray(sorobanData.diagnosticEventsXdr)
            ? sorobanData.diagnosticEventsXdr
            : [sorobanData.diagnosticEventsXdr];

          eventsXdrArray.forEach((eventXdr: string, idx: number) => {
            try {
              const diagnosticEvent = StellarSdk.xdr.DiagnosticEvent.fromXDR(eventXdr, 'base64');

              const event = diagnosticEvent.event();
              const contractIdHash = event.contractId ? event.contractId() : null;
              const contractId = contractIdHash ?
                StellarSdk.StrKey.encodeContract(Buffer.from(Array.from(contractIdHash as any))) : (knownContractId || 'Unknown');

              const topics = event.body().v0().topics().map((topic: any) => {
                try {
                  // Use decodeScVal instead of scValToNative to properly handle bytes
                  return decodeScVal(topic);
                } catch {
                  // Fallback to string representation
                  try {
                    return safeStringify(topic);
                  } catch {
                    return String(topic);
                  }
                }
              });

              let eventData: any;
              try {
                // Use decodeScVal instead of scValToNative to properly handle bytes
                eventData = decodeScVal(event.body().v0().data());
              } catch {
                // Fallback to raw data
                eventData = event.body().v0().data();
              }

              details.events.push({
                contractId,
                type: 'contract',
                topics,
                data: eventData,
                inSuccessfulContractCall: diagnosticEvent.inSuccessfulContractCall()
              });
            } catch (err) {
            }
          });
        } catch (xdrError) {
        }
      }
    } catch (error) {
    }
  }

  // Try to extract from operation.function field (Horizon provides this)
  if (operation.function) {
    details.functionName = operation.function;
  }

  // Try to extract from XDR
  try {
    if (operation.host_function_xdr) {
      const hostFunction = StellarSdk.xdr.HostFunction.fromXDR(operation.host_function_xdr, 'base64');

      if (hostFunction.switch() === StellarSdk.xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
        const invokeContract = hostFunction.invokeContract();
        const functionName = invokeContract.functionName().toString();
        details.functionName = functionName;

        const args = invokeContract.args();
        // Decode args to human-readable format
        details.args = args.map((arg: any) => {
          try {
            return decodeScVal(arg);
          } catch (e) {
            return arg.toString();
          }
        });
      }
    }
  } catch (error) {
  }

  // Parse parameters if available (only if XDR extraction didn't work)
  if (operation.parameters && Array.isArray(operation.parameters) && (!details.args || details.args.length === 0)) {
    try {
      details.args = operation.parameters.map((param: any) => {
        try {
          // Decode base64 XDR value to ScVal
          const scVal = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');
          const decoded = decodeScVal(scVal);
          return decoded;
        } catch (e) {
          return {
            type: param.type,
            value: param.value
          };
        }
      });
    } catch (error) {
    }
  }

  // Extract diagnostic events and state changes from transaction meta

  if (tx && tx.result_meta_xdr) {
    try {
      const meta = StellarSdk.xdr.TransactionMeta.fromXDR(tx.result_meta_xdr, 'base64');
      const metaSwitch = meta.switch();
      const metaDetails = extractMetaDetails(meta, operationIndex, knownContractId);

      // If we didn't get events from diagnosticEventsXdr, use events from meta
      if (details.events.length === 0 && metaDetails.events.length > 0) {
        details.events = metaDetails.events;
      }

      details.stateChanges = metaDetails.stateChanges;
      details.ttlExtensions = metaDetails.ttlExtensions;
      details.resourceUsage = metaDetails.resourceUsage;
      details.crossContractCalls = metaDetails.crossContractCalls;
    } catch (error) {
    }
  }

  return details;
};

// Helper to extract data from a single ledger entry or ledger key (for removals)
const extractSingleEntryData = (ledgerEntry: any, isRemoved: boolean = false) => {
  if (!ledgerEntry) return null;

  // For removed entries, we have a LedgerKey (not LedgerEntry), so handle differently
  if (isRemoved || !ledgerEntry.data) {
    // This is a LedgerKey - extract key information only
    try {
      const keyType = ledgerEntry.switch().name;

      if (keyType === 'contractData') {
        const contractDataKey = ledgerEntry.contractData();

        // Extract contract ID
        let contractId: string | null = null;
        try {
          const contract = contractDataKey.contract();
          const contractAddress = contract.switch().name;

          if (contractAddress === 'scAddressTypeContract') {
            contractId = StellarSdk.StrKey.encodeContract(contract.contractId());
          } else if (contractAddress === 'scAddressTypeAccount') {
            contractId = StellarSdk.StrKey.encodeEd25519PublicKey(contract.accountId().ed25519());
          }
        } catch (e) { }

        const durability = contractDataKey.durability().name;
        const storageType = durability === 'temporary' ? 'temporary' : durability === 'persistent' ? 'persistent' : 'instance';

        // Decode the key
        const keyScVal = contractDataKey.key();
        let decodedKey: any;
        try {
          const keyType = keyScVal.switch?.()?.name || keyScVal._switch?.name;
          if (keyType === 'scvLedgerKeyContractInstance') {
            decodedKey = 'ContractInstance';
          } else {
            decodedKey = decodeScVal(keyScVal);
          }
        } catch (e) {
          decodedKey = decodeScVal(keyScVal);
        }

        const keyDisplay = Array.isArray(decodedKey)
          ? `[${decodedKey.map(k => typeof k === 'string' && k.includes('sym') ? `"${k}"` : String(k)).join(', ')}]`
          : String(decodedKey);

        return {
          type: 'contractData',
          contractId,
          key: decodedKey,
          keyDisplay,
          data: null, // No data for removed entries
          storageType
        };
      }

      // Handle other key types as needed
      return {
        type: keyType,
        key: null,
        keyDisplay: `<${keyType}>`,
        data: null,
        storageType: 'unknown'
      };
    } catch (err) {
      return null;
    }
  }

  const entryData = ledgerEntry.data();
  const entryType = entryData.switch().name;

  // Handle contract data entries
  if (entryType === 'contractData') {
    const contractData = entryData.contractData();

    // Try to get contractId - handle both contract types and SAC (Stellar Asset Contract)
    let contractId: string | null = null;
    try {
      const contract = contractData.contract();
      const contractAddress = contract.switch().name;

      if (contractAddress === 'scAddressTypeContract') {
        contractId = StellarSdk.StrKey.encodeContract(contract.contractId());
      } else if (contractAddress === 'scAddressTypeAccount') {
        // This is a SAC entry for a classic account
        contractId = StellarSdk.StrKey.encodeEd25519PublicKey(contract.accountId().ed25519());
      }
    } catch (e) {
      // Continue anyway - we'll show what we can
    }

    const durability = contractData.durability().name;
    const storageType = durability === 'temporary' ? 'temporary' : durability === 'persistent' ? 'persistent' : 'instance';

    // Decode the key - check the RAW type first for special keys
    const keyScVal = contractData.key();
    let decodedKey: any;
    let isLedgerKeyContractInstance = false;

    try {
      // Check if this is a LedgerKeyContractInstance by inspecting the XDR type
      const keyType = keyScVal.switch?.()?.name || keyScVal._switch?.name;

      if (keyType === 'scvLedgerKeyContractInstance') {
        decodedKey = 'ContractInstance';
        isLedgerKeyContractInstance = true;
      } else {
        decodedKey = decodeScVal(keyScVal);
      }
    } catch (e) {
      decodedKey = decodeScVal(keyScVal);
    }

    // Decode the value if present
    let decodedVal = null;
    let valScVal = null;
    try {
      valScVal = contractData.val();
      decodedVal = decodeScVal(valScVal);
    } catch (e) {
      // Value might not be present or decodable
    }

    // Helper to get the correct type suffix from ScVal XDR
    const getScValType = (scVal: any, value: any): string => {
      if (!scVal || !scVal.switch) return '';

      try {
        const typeName = scVal.switch().name;
        switch (typeName) {
          case 'scvU32': return 'u32';
          case 'scvI32': return 'i32';
          case 'scvU64': return 'u64';
          case 'scvI64': return 'i64';
          case 'scvU128': return 'u128';
          case 'scvI128': return 'i128';
          case 'scvU256': return 'u256';
          case 'scvI256': return 'i256';
          case 'scvBool': return 'bool';
          case 'scvSymbol': return 'sym';
          case 'scvString': return 'sym';
          case 'scvBytes': return 'bytes';
          default: return '';
        }
      } catch (e) {
        // Fallback to value-based detection
        if (typeof value === 'number') {
          return value <= 4294967295 ? 'u32' : 'u64';
        }
        if (typeof value === 'bigint') return 'i128';
        if (typeof value === 'boolean') return 'bool';
        if (typeof value === 'string') return 'sym';
        return '';
      }
    };

    // Format value display directly from ScVal to preserve type information
    const formatValueFromScVal = (scVal: any): string => {
      if (!scVal) return '()';

      try {
        const typeName = scVal.switch?.()?.name || scVal._switch?.name;

        switch (typeName) {
          case 'scvVoid':
            return '()';

          case 'scvBool':
            return `${scVal.b() ? 'true' : 'false'}bool`;

          case 'scvU32':
            return `${scVal.u32()}u32`;

          case 'scvI32':
            return `${scVal.i32()}i32`;

          case 'scvU64': {
            const val = scVal.u64();
            return `${val.toString()}u64`;
          }

          case 'scvI64': {
            const val = scVal.i64();
            return `${val.toString()}i64`;
          }

          case 'scvU128': {
            const parts = scVal.u128();
            const lo = BigInt(parts.lo().toString());
            const hi = BigInt(parts.hi().toString());
            const val = (hi << 64n) | lo;
            return `${val.toString()}u128`;
          }

          case 'scvI128': {
            const parts = scVal.i128();
            const lo = BigInt(parts.lo().toString());
            const hi = BigInt(parts.hi().toString());
            const val = (hi << 64n) | lo;
            return `${val.toString()}i128`;
          }

          case 'scvSymbol':
            return `"${scVal.sym().toString()}"sym`;

          case 'scvString':
            return `"${scVal.str().toString()}"sym`;

          case 'scvBytes': {
            const bytes = scVal.bytes();
            // Show as hex for better readability
            const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
            // Truncate if too long
            if (hex.length > 64) {
              return `0x${hex.substring(0, 32)}...${hex.substring(hex.length - 32)}`;
            }
            return `0x${hex}`;
          }

          case 'scvVec': {
            const vec = scVal.vec();
            if (!vec || vec.length === 0) return '[]';
            const items = vec.map((item: any) => formatValueFromScVal(item));
            return `[${items.join(', ')}]`;
          }

          case 'scvMap': {
            const map = scVal.map();
            if (!map || map.length === 0) return '{}';
            const entries = map.map((entry: any) => {
              const key = formatValueFromScVal(entry.key());
              const val = formatValueFromScVal(entry.val());
              // Clean up key formatting - remove quotes and sym suffix for cleaner display
              const cleanKey = key.replace(/^"(.+)"sym$/, '$1');
              return `  ${cleanKey}: ${val}`;
            });
            return `{\n${entries.join(',\n')}\n}`;
          }

          case 'scvAddress': {
            try {
              // Decode the full address without shortening
              const decoded = decodeScVal(scVal);
              if (typeof decoded === 'string' && (decoded.startsWith('G') || decoded.startsWith('C'))) {
                return decoded;
              }
              return decoded || '(address)';
            } catch (e) {
              return '(address)';
            }
          }

          case 'scvContractInstance': {
            // Format contract instance with WASM hash only (skip storage to avoid showing internal XDR)
            try {
              const instance = scVal.instance();
              const parts: string[] = [];

              // Try to get the executable (WASM hash)
              try {
                const executable = instance.executable();
                const execSwitch = executable.switch?.()?.name || executable._switch?.name;
                if (execSwitch === 'contractExecutableWasm') {
                  const wasmHash = executable.wasmHash();
                  if (wasmHash) {
                    const hashBytes = wasmHash instanceof Uint8Array ? wasmHash : new Uint8Array(Object.values(wasmHash));
                    const hash = Array.from(hashBytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
                    parts.push(`wasm: ${hash}`);
                  }
                } else if (execSwitch === 'contractExecutableStellarAsset') {
                  parts.push('executable: StellarAsset');
                }
              } catch (e) {
                // Executable might not be accessible
              }

              // Storage is skipped because it contains complex nested XDR structures
              // that are difficult to display cleanly

              return parts.length > 0 ? `ContractInstance{${parts.join(', ')}}` : 'ContractInstance{}';
            } catch (e) {
              return 'ContractInstance{}';
            }
          }

          case 'scvLedgerKeyContractInstance':
            return 'ContractInstance';

          default:
            // Fallback to decoding
            const decoded = decodeScVal(scVal);
            if (decoded === null || decoded === undefined || decoded === '()') {
              return '()';
            }
            // If decoded is an object, try to format it as JSON
            if (typeof decoded === 'object') {
              try {
                return JSON.stringify(decoded, (key, val) =>
                  typeof val === 'bigint' ? val.toString() : val
                );
              } catch {
                return String(decoded);
              }
            }
            return String(decoded);
        }
      } catch (e) {
        // Fallback to decoding
        try {
          const decoded = decodeScVal(scVal);
          if (decoded === null || decoded === undefined) return '()';
          if (typeof decoded === 'string') return `"${decoded}"sym`;
          if (typeof decoded === 'number') return `${decoded}u32`;
          if (typeof decoded === 'bigint') return `${decoded}i128`;
          if (typeof decoded === 'boolean') return `${decoded}bool`;
          return JSON.stringify(decoded);
        } catch (e2) {
          return '(error)';
        }
      }

      return '()';
    };

    // Format key display directly from ScVal to preserve types
    let keyDisplay = '';
    if (isLedgerKeyContractInstance) {
      keyDisplay = '<LedgerKeyContractInstance>';
    } else if (keyScVal) {
      // Use formatValueFromScVal to preserve type information
      const formattedKey = formatValueFromScVal(keyScVal);
      // Special case: if it's a nonce key (just shows as a u64 number), display it with the value
      if (/^\d+u64$/.test(formattedKey)) {
        keyDisplay = `Nonce: ${formattedKey}`;
      } else {
        keyDisplay = formattedKey;
      }
    } else if (decodedKey === null || decodedKey === undefined) {
      keyDisplay = '<Unknown Key>';
    } else {
      keyDisplay = String(decodedKey);
    }

    let valueDisplay = '';
    if (valScVal) {
      valueDisplay = formatValueFromScVal(valScVal);
    }

    const result = {
      type: 'contractData',
      contractId,
      storageType,
      key: decodedKey,
      data: decodedVal,
      keyDisplay,
      valueDisplay,
      before: undefined
    };
    return result;
  }

  // Handle contract code entries (WASM bytecode)
  if (entryType === 'contractCode') {
    const contractCode = entryData.contractCode();
    const hash = contractCode.hash();
    return {
      type: 'contractCode',
      contractId: null, // No specific contract, this is the WASM code
      storageType: 'persistent',
      key: 'ContractCode',
      keyDisplay: '<LedgerKeyContractCode>',
      valueDisplay: `<WASM Hash: ${hash.toString('hex')}>`,
      hash: hash.toString('hex'),
      data: { hash: hash.toString('hex') },
      before: undefined
    };
  }

  // Handle trustline entries (classic Stellar asset transfers)
  if (entryType === 'trustLine') {
    const trustLine = entryData.trustLine();
    const accountId = StellarSdk.StrKey.encodeEd25519PublicKey(trustLine.accountId().ed25519());
    const asset = trustLine.asset();

    let assetCode = '';
    let assetIssuer = '';

    try {
      const assetType = asset.switch().name;
      if (assetType === 'assetTypeNative') {
        assetCode = 'XLM';
        assetIssuer = 'native';
      } else if (assetType === 'assetTypeCreditAlphanum4') {
        const credit = asset.alphaNum4();
        assetCode = credit.assetCode().toString('utf8').replace(/\0/g, '');
        assetIssuer = StellarSdk.StrKey.encodeEd25519PublicKey(credit.issuer().ed25519());
      } else if (assetType === 'assetTypeCreditAlphanum12') {
        const credit = asset.alphaNum12();
        assetCode = credit.assetCode().toString('utf8').replace(/\0/g, '');
        assetIssuer = StellarSdk.StrKey.encodeEd25519PublicKey(credit.issuer().ed25519());
      }
    } catch (e) {
    }

    const balance = trustLine.balance();

    return {
      type: 'trustLine',
      contractId: accountId,
      storageType: 'persistent',
      key: `${assetCode}:${assetIssuer}`,
      keyDisplay: `TrustLine[${assetCode}]`,
      valueDisplay: `Balance: ${balance.toString()}`,
      data: {
        accountId,
        assetCode,
        assetIssuer,
        balance: balance.toString()
      },
      before: undefined
    };
  }

  // Handle TTL (Time To Live) entries
  if (entryType === 'ttl') {
    const ttlEntry = entryData.ttl();
    let liveUntilLedgerSeq = null;
    let keyHash = null;

    try {
      liveUntilLedgerSeq = ttlEntry.liveUntilLedgerSeq();
      keyHash = ttlEntry.keyHash();
    } catch (e) {
      // TTL data might not be accessible
    }

    return {
      type: 'ttl',
      contractId: null,
      storageType: 'temporary',
      key: 'TTL',
      keyDisplay: '<LedgerKeyTTL>',
      valueDisplay: liveUntilLedgerSeq ? `TTL expires at ledger: ${liveUntilLedgerSeq}` : 'TTL Extension',
      data: { liveUntilLedgerSeq, keyHash: keyHash?.toString('hex') },
      before: undefined
    };
  }

  return null;
};

// Extract and decode ledger entry data
const extractLedgerEntryData = (change: any, changeType: string) => {
  try {
    let ledgerEntry = null;
    let beforeEntry = null;

    // Get the ledger entry based on change type
    if (changeType === 'ledgerEntryRestored') {
      try {
        ledgerEntry = change.restored();
      } catch (e) {
        try {
          ledgerEntry = change.state();
        } catch (e2) {
        }
      }
    } else if (changeType === 'ledgerEntryCreated') {
      ledgerEntry = change.created();
    } else if (changeType === 'ledgerEntryUpdated') {
      // For updated entries, ledgerEntryUpdated contains the "after" state
      // The "before" state comes from a ledgerEntryState change (handled separately)
      ledgerEntry = change.updated();
    } else if (changeType === 'ledgerEntryRemoved') {
      ledgerEntry = change.removed();
    } else if (changeType === 'ledgerEntryState') {
      // Handle ledgerEntryState - these are state snapshots
      try {
        ledgerEntry = change.state();
      } catch (e) {
      }
    } else {
    }

    if (!ledgerEntry) {
      return null;
    }

    const isRemoval = changeType === 'ledgerEntryRemoved';
    const entryInfo = extractSingleEntryData(ledgerEntry, isRemoval);
    if (!entryInfo) {
      return null;
    }

    // For updates, also extract the before value
    if (beforeEntry && changeType === 'ledgerEntryUpdated') {
      const beforeInfo = extractSingleEntryData(beforeEntry, false);
      if (beforeInfo && beforeInfo.data !== undefined) {
        entryInfo.before = beforeInfo.data;
      }
    }

    return entryInfo;
  } catch (err) {
    return null;
  }
};

const extractMetaDetails = (meta: any, operationIndex: number, knownContractId?: string) => {
  const details: any = {
    events: [] as any[],
    stateChanges: [] as any[],
    ttlExtensions: [] as any[],
    resourceUsage: null,
    crossContractCalls: [] as any[],
    instanceStorage: {},
    persistentStorage: {},
    temporaryStorage: {},
    wasmHash: null,
    contractExecutable: null,
    hostFunctionType: null
  };

  try {
    const metaSwitch = meta.switch();

    // Handle different switch return types
    let switchValue = metaSwitch;
    if (typeof metaSwitch === 'object' && metaSwitch !== null) {
      switchValue = metaSwitch.value !== undefined ? metaSwitch.value : metaSwitch;
    }

    // The switch might return a number directly
    const metaVersion = typeof switchValue === 'number' ? switchValue : (metaSwitch as any).value;

    // Extract from v3 or v4 meta (Soroban transactions)
    // v4 is the newer format but has same structure as v3
    const isV3 = metaVersion === 3;
    const isV4 = metaVersion === 4;

    if (isV3 || isV4) {
      const v3 = isV4 ? meta.v4() : meta.v3();

      // FIRST: Extract ledger entry changes from v3.operations() - this is where the actual state changes are!
      try {
        if (v3.operations && v3.operations()) {
          const operations = v3.operations();

          if (operations[operationIndex]) {
            const operation = operations[operationIndex];

            if (operation.changes && operation.changes()) {
              const changes = operation.changes();

              // Map to store state entries (before values) by key
              const stateEntries = new Map<string, any>();

              // ALSO process transaction-level changes if this is the first operation
              // These contain changes like trustlines modified by auth sub-invocations
              const allChanges = [...changes];
              if (operationIndex === 0) {
                try {
                  if (v3.txChanges && v3.txChanges()) {
                    const txChanges = v3.txChanges();
                    allChanges.push(...txChanges);
                  }
                } catch (e) {
                }
              }

              allChanges.forEach((change: any, idx: number) => {
                try {
                  const changeType = change.switch().name;

                  const ledgerEntry = extractLedgerEntryData(change, changeType);

                  if (!ledgerEntry) {
                    return;
                  }

                  const isRemoval = changeType === 'ledgerEntryRemoved';
                  const isCreated = changeType === 'ledgerEntryCreated';
                  const isUpdated = changeType === 'ledgerEntryUpdated';
                  const isRestored = changeType === 'ledgerEntryRestored';
                  const isState = changeType === 'ledgerEntryState';

                  if (isState) {
                    // Store state entry and skip adding to stateChanges
                    const entryKey = ledgerEntry.keyDisplay || JSON.stringify(ledgerEntry.key);
                    stateEntries.set(entryKey, ledgerEntry);
                    return; // Skip this entry - it will be merged with the updated entry
                  }

                  const actionType = isRemoval ? 'removed' : isCreated ? 'created' : isRestored ? 'restored' : 'updated';

                  const stateChange: any = {
                    type: actionType,
                    changeType: changeType,
                    ledgerEntryType: ledgerEntry.type,
                    contractId: ledgerEntry.contractId,
                    storageType: ledgerEntry.storageType,
                    key: ledgerEntry.key,
                    keyDisplay: ledgerEntry.keyDisplay,
                    valueDisplay: ledgerEntry.valueDisplay,
                    description: `${actionType} ${ledgerEntry.storageType || ledgerEntry.type} data ${ledgerEntry.keyDisplay || ''}`
                  };

                  // Add before/after values with proper formatting
                  if (isUpdated) {
                    // Check if we have a stored state entry for this key
                    const entryKey = ledgerEntry.keyDisplay || JSON.stringify(ledgerEntry.key);
                    const stateEntry = stateEntries.get(entryKey);

                    if (stateEntry) {
                      stateChange.before = stateEntry.data;
                      stateChange.beforeDisplay = stateEntry.valueDisplay;
                    } else {
                      stateChange.before = ledgerEntry.before;
                    }
                    stateChange.after = ledgerEntry.data;
                    stateChange.afterDisplay = ledgerEntry.valueDisplay;
                  } else if (isCreated) {
                    stateChange.after = ledgerEntry.data;
                    stateChange.afterDisplay = ledgerEntry.valueDisplay;
                  } else if (isRemoval) {
                    stateChange.before = ledgerEntry.data;
                    stateChange.beforeDisplay = ledgerEntry.valueDisplay;
                  } else if (isRestored) {
                    stateChange.value = ledgerEntry.data;
                    stateChange.valueDisplay = ledgerEntry.valueDisplay;
                  } else {
                    stateChange.value = ledgerEntry.data;
                  }

                  details.stateChanges.push(stateChange);
                } catch (err) {
                }
              });
            } else {
            }
          } else {
          }
        } else {
        }
      } catch (err) {
      }
      if (details.stateChanges.length > 0) {
      }

      // Extract Soroban metadata with resource usage
      if (v3.sorobanMeta && v3.sorobanMeta()) {
        const sorobanMeta = v3.sorobanMeta();

        // Extract resource usage
        try {
          if (sorobanMeta.ext && sorobanMeta.ext().v1) {
            const v1Ext = sorobanMeta.ext().v1();
            const resources: any = {
              refundableFee: 0,
              nonRefundableFee: 0,
              rentFee: 0
            };

            // Extract resource fees
            if (v1Ext.totalNonRefundableResourceFeeCharged) {
              resources.nonRefundableFee = Number(v1Ext.totalNonRefundableResourceFeeCharged());
            }
            if (v1Ext.totalRefundableResourceFeeCharged) {
              resources.refundableFee = Number(v1Ext.totalRefundableResourceFeeCharged());
            }

            details.resourceUsage = resources;
          } else {
          }
        } catch (err) {
        }

        // Extract storage data from ledger entry changes
        try {
          // Get transaction operations to determine host function type
          if (v3.txResult && v3.txResult()) {
            const txResult = v3.txResult();
            const resultType = txResult.result().switch().name;

            if (resultType === 'txSuccess' || resultType === 'txFeeBumpInnerSuccess') {
              const opResults = resultType === 'txFeeBumpInnerSuccess'
                ? txResult.result().innerResultPair().result().result().results()
                : txResult.result().results();

              if (opResults && opResults[operationIndex]) {
                const opResult = opResults[operationIndex];
                const opType = opResult.tr().switch().name;

                if (opType === 'invokeHostFunction') {
                  const invokeResult = opResult.tr().invokeHostFunctionResult();
                  details.hostFunctionType = invokeResult.switch().name;
                }
              }
            }
          }
        } catch (err) {
        }

        // Parse storage from soroban return value and events
        if (sorobanMeta.returnValue && sorobanMeta.returnValue()) {
          try {
            const returnVal = sorobanMeta.returnValue();
            const decodedReturn = decodeScVal(returnVal);

            // If return value is a map/object, treat as storage
            if (typeof decodedReturn === 'object' && !Array.isArray(decodedReturn)) {
              details.instanceStorage = { ...details.instanceStorage, ...decodedReturn };
            }
          } catch (err) {
          }
        }


        // Extract TTL extensions (always check and add if present)
        try {
          if (sorobanMeta.ext && sorobanMeta.ext().v1) {
            const ext = sorobanMeta.ext().v1();
            if (ext.ext && ext.ext().v1) {
              details.ttlExtensions.push({
                description: 'Time-to-live extended for contract state entries'
              });
            }
          }
        } catch (err) {
        }
      } else {
      }

      // Extract diagnostic events with detailed data

      if (v3.diagnosticEvents && v3.diagnosticEvents()) {
        const events = v3.diagnosticEvents();
        events.forEach((diagnosticEvent: any, eventIdx: number) => {
          try {
            const event = diagnosticEvent.event();

            // Extract event body
            const body = event.body();
            const bodyType = body.switch().name;

            // Extract topics FIRST - we need them to determine contractId for fn_call events
            const topics: any[] = [];
            if (body.v0 && body.v0().topics) {
              const topicsArray = body.v0().topics();
              topicsArray.forEach((topic: any) => {
                try {
                  if (topic !== null && topic !== undefined) {
                    const decoded = decodeScVal(topic);
                    if (decoded !== null) {
                      topics.push(decoded);
                    }
                  }
                } catch (e) {
                }
              });
            }

            // Determine contractId
            // The contract that emitted this event is the one we want
            let contractId: string;

            try {
              if (event.contractId) {
                const contractIdBytes = event.contractId();
                contractId = StellarSdk.StrKey.encodeContract(contractIdBytes);
              } else {
                contractId = knownContractId || 'Unknown';
              }
            } catch (e) {
              contractId = knownContractId || 'Unknown';
            }

            // Extract data payload
            let eventData: any = null;
            try {
              if (body.v0 && body.v0().data) {
                const data = body.v0().data();
                if (data !== null && data !== undefined) {
                  eventData = decodeScVal(data);
                }
              }
            } catch (e) {
            }

            // Check first topic to identify event type
            const firstTopic = topics.length > 0 ? topics[0] : null;
            const eventType = typeof firstTopic === 'string'
              ? firstTopic.toLowerCase()
              : String(firstTopic).toLowerCase();

            // Don't filter fn_call and fn_return - we need them for displaying contract calls!
            // Only skip generic diagnostic_event if needed
            if (eventType === 'diagnostic_event') {
              return;
            }

            const eventInfo = {
              type: bodyType,
              contractId,
              topics,
              data: eventData,
              inSuccessfulContractCall: diagnosticEvent.inSuccessfulContractCall()
            };

            details.events.push(eventInfo);

            // Detect cross-contract calls from diagnostic events
            // Diagnostic events show when a contract calls another contract
            // We can detect this by looking for events from different contracts in sequence
            if (contractId !== 'Unknown' && details.events.length > 1) {
              const prevEvent = details.events[details.events.length - 2];
              if (prevEvent.contractId !== contractId && prevEvent.contractId !== 'Unknown') {
                // Different contract emitted this event - likely a cross-contract call
                const crossCall = {
                  fromContract: prevEvent.contractId,
                  toContract: contractId,
                  functionName: topics.length > 0 ? topics[0] : undefined,
                  success: eventInfo.inSuccessfulContractCall
                };
                details.crossContractCalls.push(crossCall);
              }
            }
          } catch (err) {
          }
        });
        if (details.crossContractCalls.length > 0) {
        }
      } else {
      }
    } else {
    }
  } catch (error) {
  }
  if (details.stateChanges.length > 0) {
  }
  return details;
};

const decodeTransactionXdr = async (tx: any) => {
  try {
    const debugInfo: any = {
      resultXdr: tx.result_xdr,
      envelopeXdr: tx.envelope_xdr,
      metaXdr: tx.result_meta_xdr
    };

    // Decode envelope XDR to check for fee bump transactions
    let isFeeBump = false;
    let innerEnvelope = null;
    if (tx.envelope_xdr) {
      try {
        const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, 'base64');
        debugInfo.decodedEnvelope = envelope;

        // Check if this is a fee bump transaction
        const envelopeType = envelope.switch()?.name || String(envelope.switch());
        debugInfo.envelopeType = envelopeType;

        if (envelopeType === 'envelopeTypeTxFeeBump' || envelopeType === 'envelopeTypeFeeBump') {
          isFeeBump = true;
          try {
            const feeBumpTx = envelope.feeBump();
            innerEnvelope = feeBumpTx.tx().innerTx();
            debugInfo.feeBumpInfo = {
              feeSource: feeBumpTx.tx().feeSource().toString(),
              fee: feeBumpTx.tx().fee().toString()
            };
          } catch (e) {
          }
        }
      } catch (error) {
      }
    }

    // Decode result XDR for error analysis
    if (tx.result_xdr) {
      try {
        const transactionResult = StellarSdk.xdr.TransactionResult.fromXDR(tx.result_xdr, 'base64');
        debugInfo.decodedResult = transactionResult;

        const errorAnalysis = analyzeTransactionErrors(transactionResult, isFeeBump);
        if (errorAnalysis && (errorAnalysis.outerError || errorAnalysis.innerError || errorAnalysis.operationErrors?.length > 0)) {
          debugInfo.errorAnalysis = errorAnalysis;
        } else {
        }
      } catch (error) {
      }
    }

    return debugInfo;
  } catch (error) {
    return null;
  }
};

const analyzeTransactionErrors = (transactionResult: any, isFeeBump: boolean = false) => {
  try {
    const analysis: any = {
      outerError: null,
      innerError: null,
      operationErrors: [],
      layers: []
    };

    // Check transaction-level error
    const resultSwitch = transactionResult.result().switch();
    const resultName = (resultSwitch as any).name || String(resultSwitch);

    // Handle fee bump transactions
    if (isFeeBump) {
      analysis.layers.push({
        level: 'Outer Transaction',
        code: resultName,
        meaning: getErrorDescription(resultName),
        envelopeType: 'envelopeTypeTxFeeBump',
        explanation: resultName === 'txFeeBumpInnerFailed'
          ? 'The fee bump wrapper was valid and paid fees successfully, but the inner transaction did not execute successfully.'
          : 'The fee bump transaction wrapper status.'
      });

      if (resultName === 'txFeeBumpInnerFailed') {
        analysis.outerError = resultName;

        // Try to get inner transaction result
        try {
          const innerResult = transactionResult.result().innerResultPair()?.result();
          if (innerResult) {
            const innerSwitch = innerResult.result().switch();
            const innerResultName = (innerSwitch as any).name || String(innerSwitch);
            analysis.innerError = innerResultName;
            analysis.layers.push({
              level: 'Inner Transaction',
              code: innerResultName,
              meaning: getErrorDescription(innerResultName),
              envelopeType: 'envelopeTypeTx',
              explanation: 'The actual transaction that was wrapped by the fee bump. This is where the real failure occurred.'
            });
          }
        } catch (e) {
        }
      } else if (resultName !== 'txFeeBumpInnerSuccess') {
        analysis.outerError = resultName;
      }
    } else {
      // Regular transaction (not fee bump)
      if (resultName !== 'txSuccess') {
        analysis.innerError = resultName;
        analysis.layers.push({
          level: 'Transaction',
          code: resultName,
          meaning: getErrorDescription(resultName),
          envelopeType: 'envelopeTypeTx',
          explanation: 'The transaction envelope that contains the operations.'
        });
      }
    }

    // Check operation-level errors - only if results exist
    // For fee bump transactions, we need to get results from the inner transaction
    let opResults = null;
    try {
      if (isFeeBump && resultName === 'txFeeBumpInnerFailed') {
        // Extract operation results from inner transaction
        try {
          const result = transactionResult.result();

          const innerPair = result.innerResultPair();

          if (innerPair) {
            const innerResult = innerPair.result();

            if (innerResult) {
              const innerResultObj = innerResult.result();

              opResults = innerResultObj.results();
            }
          }
        } catch (e) {
        }
      } else {
        // Regular transaction or successful fee bump
        opResults = transactionResult.result().results();
      }
      if (opResults && opResults.length > 0) {
        opResults.forEach((opResult: any, index: number) => {
          try {

            // Try to get the operation result code
            let codeType: string | undefined;

            // Method 1: Try .switch() method
            if (typeof opResult.switch === 'function') {
              const sw = opResult.switch();
              codeType = (sw as any).name || String(sw);
            }
            // Method 2: Try ._switch.name
            else if (opResult._switch?.name) {
              codeType = opResult._switch.name;
            }
            // Method 3: Try ._arm
            else if (opResult._arm) {
              codeType = opResult._arm;
            }

            if (!codeType) {
              codeType = 'unknown';
            }

            if (codeType !== 'opInner' && codeType !== 'unknown') {
              // Operation failed at the envelope level (e.g., opBadAuth, opNoSourceAccount)
              analysis.operationErrors.push({
                operation: index,
                error: codeType,
                description: getOperationErrorDescription(codeType)
              });
            } else if (codeType === 'opInner') {
              // Operation succeeded at envelope level, check the inner result
              try {
                const tr = opResult.tr();

                // Try different operation types based on the reference code pattern
                let operationResult;
                let operationType;

                // Check for different operation result types using try-catch since accessing
                // non-existent properties throws errors in the Stellar SDK
                const resultGetters = [
                  { name: 'payment', getter: () => tr.paymentResult() },
                  { name: 'createAccount', getter: () => tr.createAccountResult() },
                  { name: 'manageBuyOffer', getter: () => tr.manageBuyOfferResult() },
                  { name: 'manageSellOffer', getter: () => tr.manageSellOfferResult() },
                  { name: 'changeTrust', getter: () => tr.changeTrustResult() },
                  { name: 'invokeHostFunction', getter: () => tr.invokeHostFunctionResult() },
                  { name: 'pathPaymentStrictReceive', getter: () => tr.pathPaymentStrictReceiveResult() },
                  { name: 'pathPaymentStrictSend', getter: () => tr.pathPaymentStrictSendResult() },
                  { name: 'setOptions', getter: () => tr.setOptionsResult() },
                  { name: 'allowTrust', getter: () => tr.allowTrustResult() },
                  { name: 'accountMerge', getter: () => tr.accountMergeResult() },
                  { name: 'inflation', getter: () => tr.inflationResult() },
                  { name: 'manageData', getter: () => tr.manageDataResult() },
                  { name: 'bumpSequence', getter: () => tr.bumpSequenceResult() },
                  { name: 'createClaimableBalance', getter: () => tr.createClaimableBalanceResult() },
                  { name: 'claimClaimableBalance', getter: () => tr.claimClaimableBalanceResult() },
                  { name: 'beginSponsoringFutureReserves', getter: () => tr.beginSponsoringFutureReservesResult() },
                  { name: 'endSponsoringFutureReserves', getter: () => tr.endSponsoringFutureReservesResult() },
                  { name: 'revokeSponsorship', getter: () => tr.revokeSponsorshipResult() },
                  { name: 'clawback', getter: () => tr.clawbackResult() },
                  { name: 'clawbackClaimableBalance', getter: () => tr.clawbackClaimableBalanceResult() },
                  { name: 'setTrustLineFlags', getter: () => tr.setTrustLineFlagsResult() },
                  { name: 'liquidityPoolDeposit', getter: () => tr.liquidityPoolDepositResult() },
                  { name: 'liquidityPoolWithdraw', getter: () => tr.liquidityPoolWithdrawResult() }
                ];

                for (const { name, getter } of resultGetters) {
                  try {
                    operationResult = getter();
                    operationType = name;
                    break;
                  } catch (e) {
                    // This operation type doesn't match, continue to next
                    continue;
                  }
                }

                if (!operationResult) {
                  // Try to get operation type from switch
                  const trSwitch = tr.switch();
                  operationType = (trSwitch as any).name || String(trSwitch);
                  return;
                }

                // Get the result code from the operation result
                let resultCode;
                if (typeof operationResult.switch === 'function') {
                  const resultSwitch = operationResult.switch();
                  resultCode = (resultSwitch as any).name || String(resultSwitch);
                } else if (operationResult._switch?.name) {
                  resultCode = operationResult._switch.name;
                } else if (operationResult._arm) {
                  resultCode = operationResult._arm;
                }

                // Check if it's a success code (ends with "Success")
                if (resultCode && !resultCode.endsWith('Success')) {
                  const errorInfo = {
                    operation: index,
                    error: resultCode,
                    operationType,
                    description: getOperationErrorDescription(resultCode)
                  };
                  analysis.operationErrors.push(errorInfo);
                  analysis.layers.push({
                    level: `Operation ${index}`,
                    code: resultCode,
                    meaning: getOperationErrorDescription(resultCode),
                    operationType,
                    envelopeType: 'operation',
                    explanation: `The ${operationType} operation failed with a specific error code.`
                  });
                } else {
                }
              } catch (e) {
              }
            }
          } catch (opError) {
          }
        });
      }
    } catch (resultsError) {
    }

    return analysis;
  } catch (error) {
    return null;
  }
};

const getErrorDescription = (errorCode: string): string => {
  const descriptions: Record<string, string> = {
    // Transaction-level errors
    'txSuccess': 'Transaction succeeded',
    'txFailed': 'One or more operations failed',
    'txTooEarly': 'Transaction submitted before minTime',
    'txTooLate': 'Transaction submitted after maxTime',
    'txMissingOperation': 'Transaction has no operations',
    'txBadSeq': 'Sequence number does not match source account',
    'txBadAuth': 'Too few valid signatures or wrong network',
    'txInsufficientBalance': 'Fee would bring account below minimum reserve',
    'txNoSourceAccount': 'Source account does not exist',
    'txInsufficientFee': 'Fee is too small',
    'txBadAuthExtra': 'Unused signatures attached to transaction',
    'txInternalError': 'Internal error in transaction processing',
    'txNotSupported': 'Transaction type is not supported',
    'txFeeBumpInnerSuccess': 'Fee bump succeeded and inner transaction succeeded',
    'txFeeBumpInnerFailed': 'Fee bump succeeded, but inner transaction failed',
    'txBadSponsorship': 'Sponsorship error',
    'txBadMinSeqAgeOrGap': 'minSeqAge or minSeqLedgerGap conditions not met',
    'txMalformed': 'Transaction is malformed',
    'txSorobanInvalid': 'Soroban-specific validation failed'
  };

  return descriptions[errorCode] || `Error: ${errorCode}`;
};

const getOperationErrorDescription = (errorCode: string): string => {
  const descriptions: Record<string, string> = {
    'op_success': 'Operation succeeded',

    // Envelope-level operation errors (op_*)
    'opBadAuth': 'Invalid authorization - signature missing or incorrect',
    'op_bad_auth': 'Invalid authorization - signature missing or incorrect',
    'opNoDestination': 'Destination account does not exist',
    'opNotSupported': 'Operation is not supported',
    'opTooManySponsoring': 'Too many sponsoring operations',
    'opExceedsWorkLimit': 'Operation exceeds work limit',
    'opTooManySubEntries': 'Too many sub-entries',
    'opNoSourceAccount': 'Source account does not exist',
    'op_no_source_account': 'Source account does not exist',

    // General operation errors
    'opMalformed': 'Operation is malformed or invalid',
    'opUnderfunded': 'Account has insufficient balance',
    'op_underfunded': 'Account has insufficient balance',
    'opLineFull': 'Trust line is at full capacity',
    'opNoTrust': 'Destination account does not trust the asset',
    'opSrcNoTrust': 'Source account does not trust the asset',
    'opSrcNotAuthorized': 'Source account is not authorized for this asset',
    'opNotAuthorized': 'Account is not authorized for this asset',
    'opNoIssuer': 'Asset issuer does not exist',
    'opLowReserve': 'Account would go below minimum reserve',
    'op_low_reserve': 'Account would go below minimum reserve',

    // CreateAccount errors
    'createAccountMalformed': 'Create account operation is malformed',
    'createAccountUnderfunded': 'Source account has insufficient balance',
    'createAccountLowReserve': 'Starting balance below minimum reserve (2 XLM)',
    'createAccountAlreadyExist': 'Destination account already exists',

    // Payment errors
    'paymentMalformed': 'Payment operation is malformed',
    'paymentUnderfunded': 'Source account has insufficient balance',
    'paymentSrcNoTrust': 'Source does not trust the asset',
    'paymentSrcNotAuthorized': 'Source not authorized for this asset',
    'paymentNoDestination': 'Destination account does not exist',
    'paymentNoTrust': 'Destination does not trust the asset',
    'paymentNotAuthorized': 'Destination not authorized for this asset',
    'paymentLineFull': 'Destination trust line is full',
    'paymentNoIssuer': 'Asset issuer does not exist',

    // Account errors
    'opAlreadyExists': 'Account already exists',

    // Offer errors
    'opOfferCrossSelf': 'Offer would cross an offer from the same account',
    'opBuyNoTrust': 'Account does not trust the buying asset',
    'opSellNoTrust': 'Account does not trust the selling asset',
    'opBuyNotAuthorized': 'Account not authorized to buy this asset',
    'opSellNotAuthorized': 'Account not authorized to sell this asset',
    'opCrossSelf': 'Offer crosses existing offer from same account',
    'opOfferNotFound': 'Offer does not exist',

    // ManageBuyOffer errors
    'manageBuyOfferMalformed': 'Buy offer is malformed',
    'manageBuyOfferSellNoTrust': 'Account does not trust the selling asset',
    'manageBuyOfferBuyNoTrust': 'Account does not trust the buying asset',
    'manageBuyOfferSellNotAuthorized': 'Account not authorized to sell this asset',
    'manageBuyOfferBuyNotAuthorized': 'Account not authorized to buy this asset',
    'manageBuyOfferLineFull': 'Cannot receive more of the buying asset - trust line full',
    'manageBuyOfferUnderfunded': 'Insufficient balance to sell',
    'manageBuyOfferCrossSelf': 'Buy offer would cross an existing offer from the same account',
    'manageBuyOfferSellNoIssuer': 'Selling asset issuer does not exist',
    'manageBuyOfferBuyNoIssuer': 'Buying asset issuer does not exist',
    'manageBuyOfferNotFound': 'Offer ID not found',
    'manageBuyOfferLowReserve': 'Account would go below minimum reserve',

    // ManageSellOffer errors
    'manageSellOfferMalformed': 'Sell offer is malformed',
    'manageSellOfferSellNoTrust': 'Account does not trust the selling asset',
    'manageSellOfferBuyNoTrust': 'Account does not trust the buying asset',
    'manageSellOfferSellNotAuthorized': 'Account not authorized to sell this asset',
    'manageSellOfferBuyNotAuthorized': 'Account not authorized to buy this asset',
    'manageSellOfferLineFull': 'Cannot receive more of the buying asset - trust line full',
    'manageSellOfferUnderfunded': 'Insufficient balance to sell',
    'manageSellOfferCrossSelf': 'Sell offer would cross an existing offer from the same account',
    'manageSellOfferSellNoIssuer': 'Selling asset issuer does not exist',
    'manageSellOfferBuyNoIssuer': 'Buying asset issuer does not exist',
    'manageSellOfferNotFound': 'Offer ID not found',
    'manageSellOfferLowReserve': 'Account would go below minimum reserve',

    // ChangeTrust errors
    'changeTrustMalformed': 'Change trust operation is malformed',
    'changeTrustNoIssuer': 'Asset issuer does not exist',
    'changeTrustInvalidLimit': 'Trust line limit is invalid',
    'changeTrustLowReserve': 'Account would go below minimum reserve',
    'changeTrustSelfNotAllowed': 'Cannot create trustline to self',

    // Trust line errors
    'opInvalidLimit': 'Trust line limit is invalid',

    // Manage data errors
    'opNotSupportedYet': 'Operation not supported yet',
    'opNameNotFound': 'Data entry name not found',
    'opInvalidValue': 'Data value is invalid',

    // Soroban errors
    'invokeHostFunctionTrapped': 'Smart contract execution trapped (panic or error)',
    'invokeHostFunctionResourceLimitExceeded': 'Resource limits exceeded',
    'invokeHostFunctionEntryArchived': 'Contract entry is archived',
    'invokeHostFunctionInsufficientRefundableFee': 'Insufficient refundable fee'
  };

  return descriptions[errorCode] || `Operation failed: ${errorCode}`;
};

export const createOperationNodes = async (transaction: TransactionDetails): Promise<Node[]> => {

  // Filter out core_metrics operations - these are internal Horizon operations, not real transaction operations
  const validOperations = transaction.operations.filter(op =>
    op.type !== 'core_metrics' && op.type !== 'coreMetrics' && op.type !== 'core-metrics'
  );

  const allNodes: Node[] = [];
  let globalNodeIndex = 0;

  // Node layout constants - nodes range from 380px (minWidth) to 900px (maxWidth)
  // Using 550px spacing for compact layout while preventing overlap
  const NODE_HORIZONTAL_SPACING = 550;
  const NODE_BASE_Y = 50;

  for (let index = 0; index < validOperations.length; index++) {
    const op = validOperations[index];
    const sorobanOp = transaction.sorobanOperations?.find((sop, idx) => idx === index);

    if (!sorobanOp && transaction.sorobanOperations && transaction.sorobanOperations.length > 0) {
    }

    // Calculate position - all nodes on same horizontal line to prevent overlap
    const xPosition = globalNodeIndex * NODE_HORIZONTAL_SPACING;
    const yPosition = NODE_BASE_Y;

    // Get effects for this operation
    // For path payments, ALWAYS fetch from operation endpoint to ensure we get all trade effects
    let operationEffects: any[] = [];
    const isPathPayment = op.type === 'path_payment_strict_send' || op.type === 'path_payment_strict_receive';

    if (isPathPayment && op._links?.effects?.href) {
      // Always fetch effects directly for path payments
      try {
        let effectsUrl = op._links.effects.href;
        // Ensure we get effects in ascending (chronological) order
        if (!effectsUrl.includes('order=')) {
          effectsUrl += (effectsUrl.includes('?') ? '&' : '?') + 'order=asc';
        }
        const effectsResponse = await fetch(effectsUrl);
        const effectsData = await effectsResponse.json();
        operationEffects = effectsData._embedded?.records || effectsData.records || [];
      } catch (err) {
        operationEffects = [];
      }
    } else {
      // For other operations, try matching from transaction effects first
      operationEffects = transaction.effects?.filter(eff => {
        const effAny = eff as any;
        // Try multiple matching strategies:
        // 1. Direct operation_id match
        if (effAny.operation && String(effAny.operation) === String(op.id)) return true;
        // 2. Extract operation ID from _links.operation.href
        if (effAny._links?.operation?.href) {
          const opIdMatch = effAny._links.operation.href.match(/operations\/(\d+)/);
          if (opIdMatch && opIdMatch[1] === String(op.id)) return true;
        }
        // 3. Paging token match (fallback)
        if (effAny.paging_token?.startsWith(op.paging_token)) return true;
        // 4. For classic operations, try matching by paging token prefix (first 2 segments match)
        if (op.paging_token && effAny.paging_token) {
          const opTokenParts = op.paging_token.split('-');
          const effTokenParts = effAny.paging_token.split('-');
          if (opTokenParts.length >= 2 && effTokenParts.length >= 2 &&
            opTokenParts[0] === effTokenParts[0] && opTokenParts[1] === effTokenParts[1]) {
            return true;
          }
        }
        return false;
      }) || [];

      // If no effects found at transaction level, fetch per-operation (fallback for classic ops)
      if (operationEffects.length === 0 && op._links?.effects?.href) {
        try {
          let effectsUrl = op._links.effects.href;
          // Ensure we get effects in ascending (chronological) order
          if (!effectsUrl.includes('order=')) {
            effectsUrl += (effectsUrl.includes('?') ? '&' : '?') + 'order=asc';
          }
          const effectsResponse = await fetch(effectsUrl);
          const effectsData = await effectsResponse.json();
          operationEffects = effectsData._embedded?.records || effectsData.records || [];
        } catch (err) {
          operationEffects = [];
        }
      }
    }


    const operationNode: Node = {
      id: `op-${index}`,
      type: 'operation',
      position: { x: xPosition, y: yPosition },
      data: {
        type: op.type,
        operation: op,
        sourceAccount: extractAccountAddress(op.source_account || transaction.sourceAccount),
        contractId: sorobanOp?.contractId,
        functionName: sorobanOp?.functionName,
        args: sorobanOp?.args,
        auth: sorobanOp?.auth,
        result: sorobanOp?.result,
        error: sorobanOp?.error,
        events: sorobanOp?.events || transaction.events?.filter(e => e.contractId === sorobanOp?.contractId),
        resourceUsage: sorobanOp?.resourceUsage,
        stateChanges: sorobanOp?.stateChanges,
        ttlExtensions: sorobanOp?.ttlExtensions,
        instanceStorage: (sorobanOp as any)?.instanceStorage,
        persistentStorage: (sorobanOp as any)?.persistentStorage,
        temporaryStorage: (sorobanOp as any)?.temporaryStorage,
        wasmHash: (sorobanOp as any)?.wasmHash,
        contractExecutable: (sorobanOp as any)?.contractExecutable,
        hostFunctionType: (sorobanOp as any)?.hostFunctionType,
        operationEffects: operationEffects || [],
        ...extractOperationSpecificData(op, operationEffects, transaction, index)
      }
    };

    allNodes.push(operationNode);
    globalNodeIndex++;

    // DISABLED: Events are now shown inside the 4-box InvokeContract layout (BOX 3)
    // We no longer create separate event nodes to avoid duplication
    /*
    // Create separate nodes for each contract event
    // Events can be in sorobanOp.events OR in transaction.events (filtered by contractId)
    const operationEvents = sorobanOp?.events && sorobanOp.events.length > 0
      ? sorobanOp.events
      : transaction.events?.filter(e => e.contractId === sorobanOp?.contractId) || [];

    if (operationEvents.length > 0) {

      operationEvents.forEach((event, eventIdx) => {
        // Skip core_metrics events
        const topics = event.topics || [];
        if (topics.length > 0) {
          const eventType = String(topics[0]).toLowerCase();
          if (eventType === 'core_metrics' || eventType === 'coremetrics' || eventType === 'core-metrics') {
            return;
          }
        }

        // Validate event has required data
        if (event && (event.topics?.length > 0 || event.data?.length > 0)) {

          const eventNode: Node = {
            id: `event-${index}-${eventIdx}`,
            type: 'event',
            position: { x: globalNodeIndex * 80, y: 50 },
            data: {
              event: {
                ...event,
                topics: event.topics || [],
                data: event.data || []
              },
              parentOperationIndex: index,
              eventIndex: eventIdx,
              operationData: sorobanOp ? {
                contractId: sorobanOp.contractId,
                functionName: sorobanOp.functionName,
                args: sorobanOp.args,
                auth: sorobanOp.auth,
                status: sorobanOp.error ? 'failed' : 'success',
                stateChanges: sorobanOp.stateChanges,
                ttlExtensions: sorobanOp.ttlExtensions,
                resourceUsage: sorobanOp.resourceUsage,
                result: sorobanOp.result
              } : undefined
            }
          };

          allNodes.push(eventNode);
          globalNodeIndex++;
        } else {
        }
      });
    }

    if (sorobanOp?.stateChanges && sorobanOp.stateChanges.length > 0) {

      sorobanOp.stateChanges.forEach((stateChange, changeIdx) => {
        const stateChangeNode: Node = {
          id: `state-${index}-${changeIdx}`,
          type: 'stateChange',
          position: { x: globalNodeIndex * NODE_HORIZONTAL_SPACING, y: NODE_BASE_Y },
          data: {
            stateChange,
            parentOperationIndex: index,
            changeIndex: changeIdx
          }
        };

        allNodes.push(stateChangeNode);
        globalNodeIndex++;
      });
    }

    // Create separate nodes for each effect related to this operation
    const operationEffects = transaction.effects?.filter(eff => {
      // Link effects to operations by checking if the effect's paging_token starts with the operation's paging_token
      return eff.paging_token?.startsWith(op.paging_token);
    });

    if (operationEffects && operationEffects.length > 0) {

      operationEffects.forEach((effect, effectIdx) => {
        const effectNode: Node = {
          id: `effect-${index}-${effectIdx}`,
          type: 'effect',
          position: { x: globalNodeIndex * NODE_HORIZONTAL_SPACING, y: NODE_BASE_Y },
          data: {
            effect,
            parentOperationIndex: index,
            effectIndex: effectIdx
          }
        };

        allNodes.push(effectNode);
        globalNodeIndex++;
      });
    }
    */ // End of disabled event/state/effect node creation
  }
  return allNodes;
};

const extractOperationSpecificData = (op: any, effects?: any[], transaction?: any, operationIndex?: number) => {
  const data: any = {};

  switch (op.type) {
    case 'create_account':
      data.destination = op.account || op.destination;
      data.startingBalance = op.starting_balance;
      data.funder = extractAccountAddress(op.funder || op.source_account);
      break;

    case 'payment':
      data.from = op.from;
      data.to = op.to;
      data.amount = op.amount;
      data.asset = op.asset_type === 'native' ? 'XLM' : op.asset_code;
      data.assetIssuer = op.asset_issuer;
      break;

    case 'manage_sell_offer':
    case 'manage_offer':
      data.amount = op.amount;
      // Calculate price from price_r if available, otherwise use price field
      if (op.price_r && typeof op.price_r === 'object' && op.price_r.n && op.price_r.d) {
        data.price = String(parseFloat(op.price_r.n) / parseFloat(op.price_r.d));
      } else {
        data.price = op.price;
      }
      data.selling_asset_type = op.selling_asset_type;
      data.selling_asset_code = op.selling_asset_code;
      data.selling_asset_issuer = op.selling_asset_issuer;
      data.buying_asset_type = op.buying_asset_type;
      data.buying_asset_code = op.buying_asset_code;
      data.buying_asset_issuer = op.buying_asset_issuer;

      // Extract sponsor if present
      if (op.sponsor) {
        data.sponsor = op.sponsor;
      }

      // PRESERVE the original operation's offer_id from XDR (before effects modify it)
      // If original_offer_id exists (extracted from XDR), use it; otherwise fall back to op.offer_id
      data.original_offer_id = (op as any).original_offer_id !== undefined
        ? String((op as any).original_offer_id)
        : (op.offer_id ? String(op.offer_id) : '0');

      // Initial offer_id from operation (will be 0 for new offers)
      data.offer_id = op.offer_id ? String(op.offer_id) : '0';
      data.offerId = data.offer_id;

      // Try to find actual offer_id from effects (for DISPLAY, not detection)
      if (effects && effects.length > 0) {
        const offerEffect = effects.find((eff: any) =>
          (eff.type === 'trade' || eff.type === 'manage_offer' || eff.type === 'offer_created' ||
            eff.type === 'offer_updated' || eff.type === 'offer_removed' || eff.type_i === 3) &&
          (eff.offer_id || eff.seller_offer_id || eff.buying_offer_id || eff.selling_offer_id)
        );
        if (offerEffect) {
          const foundId = offerEffect.offer_id || offerEffect.seller_offer_id ||
            offerEffect.buying_offer_id || offerEffect.selling_offer_id;
          if (foundId && String(foundId) !== '0') {
            // Update the display IDs but keep original_offer_id unchanged
            data.offerId = String(foundId);
            data.offer_id = String(foundId);
          }
        }
      }

      // If effects didn't provide the offer ID, parse XDR metadata
      if ((data.offer_id === '0' || !data.offer_id) && transaction?.debugInfo?.metaXdr && operationIndex !== undefined) {
        const xdrOfferId = extractOfferIdFromXdr(transaction.debugInfo.metaXdr, operationIndex);
        if (xdrOfferId) {
          data.offerId = xdrOfferId;
          data.offer_id = xdrOfferId;
        }
      }
      break;

    case 'manage_buy_offer':
      data.buyAmount = op.buy_amount || op.amount;
      // Calculate price from price_r if available, otherwise use price field
      if (op.price_r && typeof op.price_r === 'object' && op.price_r.n && op.price_r.d) {
        data.price = String(parseFloat(op.price_r.n) / parseFloat(op.price_r.d));
      } else {
        data.price = op.price;
      }
      data.selling_asset_type = op.selling_asset_type;
      data.selling_asset_code = op.selling_asset_code;
      data.selling_asset_issuer = op.selling_asset_issuer;
      data.buying_asset_type = op.buying_asset_type;
      data.buying_asset_code = op.buying_asset_code;
      data.buying_asset_issuer = op.buying_asset_issuer;

      // Extract sponsor if present
      if (op.sponsor) {
        data.sponsor = op.sponsor;
      }

      // PRESERVE the original operation's offer_id from XDR (before effects modify it)
      // If original_offer_id exists (extracted from XDR), use it; otherwise fall back to op.offer_id
      data.original_offer_id = (op as any).original_offer_id !== undefined
        ? String((op as any).original_offer_id)
        : (op.offer_id ? String(op.offer_id) : '0');

      // Initial offer_id from operation (will be 0 for new offers)
      data.offer_id = op.offer_id ? String(op.offer_id) : '0';
      data.offerId = data.offer_id;

      // Try to find actual offer_id from effects (for DISPLAY, not detection)
      if (effects && effects.length > 0) {
        const offerEffect = effects.find((eff: any) =>
          (eff.type === 'trade' || eff.type === 'manage_offer' || eff.type === 'offer_created' ||
            eff.type === 'offer_updated' || eff.type === 'offer_removed' || eff.type_i === 3) &&
          (eff.offer_id || eff.seller_offer_id || eff.buying_offer_id || eff.selling_offer_id)
        );
        if (offerEffect) {
          const foundId = offerEffect.offer_id || offerEffect.seller_offer_id ||
            offerEffect.buying_offer_id || offerEffect.selling_offer_id;
          if (foundId && String(foundId) !== '0') {
            data.offerId = String(foundId);
            data.offer_id = String(foundId);
          }
        }
      }

      // If effects didn't provide the offer ID, parse XDR metadata
      if ((data.offer_id === '0' || !data.offer_id) && transaction?.debugInfo?.metaXdr && operationIndex !== undefined) {
        const xdrOfferId = extractOfferIdFromXdr(transaction.debugInfo.metaXdr, operationIndex);
        if (xdrOfferId) {
          data.offerId = xdrOfferId;
          data.offer_id = xdrOfferId;
        }
      }
      break;

    case 'create_passive_sell_offer':
      data.amount = op.amount;
      // Calculate price from price_r if available, otherwise use price field
      if (op.price_r && typeof op.price_r === 'object' && op.price_r.n && op.price_r.d) {
        data.price = String(parseFloat(op.price_r.n) / parseFloat(op.price_r.d));
      } else {
        data.price = op.price;
      }
      data.selling_asset_type = op.selling_asset_type;
      data.selling_asset_code = op.selling_asset_code;
      data.selling_asset_issuer = op.selling_asset_issuer;
      data.buying_asset_type = op.buying_asset_type;
      data.buying_asset_code = op.buying_asset_code;
      data.buying_asset_issuer = op.buying_asset_issuer;
      break;

    case 'path_payment_strict_send':
      data.from = extractAccountAddress(op.from || op.source_account);
      data.to = op.to || op.destination;
      data.source_amount = op.source_amount;
      data.destination_min = op.destination_min;
      data.amount = op.amount;
      data.source_asset_type = op.source_asset_type;
      data.source_asset_code = op.source_asset_code;
      data.source_asset_issuer = op.source_asset_issuer;
      data.asset_type = op.asset_type;
      data.asset_code = op.asset_code;
      data.asset_issuer = op.asset_issuer;
      data.path = op.path || [];
      data.transaction_successful = op.transaction_successful;
      data.created_at = op.created_at;
      data.id = op.id;
      break;

    case 'path_payment_strict_receive':
      data.from = extractAccountAddress(op.from || op.source_account);
      data.to = op.to || op.destination;
      data.source_max = op.source_max;
      data.source_amount = op.source_amount;
      data.amount = op.amount;
      data.source_asset_type = op.source_asset_type;
      data.source_asset_code = op.source_asset_code;
      data.source_asset_issuer = op.source_asset_issuer;
      data.asset_type = op.asset_type;
      data.asset_code = op.asset_code;
      data.asset_issuer = op.asset_issuer;
      data.path = op.path || [];
      data.transaction_successful = op.transaction_successful;
      data.created_at = op.created_at;
      data.id = op.id;
      break;

    case 'begin_sponsoring_future_reserves':
      data.sponsor = extractAccountAddress(op.source_account);
      data.sponsoredId = op.sponsored_id;
      break;

    case 'end_sponsoring_future_reserves':
      data.action = 'end_sponsorship';
      break;

    case 'set_trust_line_flags':
      data.trustor = op.trustor;
      data.assetCode = op.asset_code;
      data.assetIssuer = op.asset_issuer;
      data.setFlagNames = op.set_flags_s || [];
      data.clearFlagNames = op.clear_flags_s || [];
      break;

    default:
      // Copy common fields
      Object.keys(op).forEach(key => {
        if (!['type', 'id', '_links', 'paging_token'].includes(key)) {
          data[key] = op[key];
        }
      });
  }

  return data;
};

export const createOperationEdges = (transaction: TransactionDetails): Edge[] => {
  const edges: Edge[] = [];

  const validOperations = transaction.operations.filter(op =>
    op.type !== 'core_metrics' && op.type !== 'coreMetrics' && op.type !== 'core-metrics'
  );

  // Create sequential edges between operations - using straight edges for horizontal alignment
  for (let i = 0; i < validOperations.length - 1; i++) {
    edges.push({
      id: `edge-seq-${i}`,
      source: `op-${i}`,
      target: `op-${i + 1}`,
      type: 'straight',
      animated: true,
      style: {
        stroke: '#2563eb',
        strokeWidth: 3
      },
      markerEnd: {
        type: 'arrowclosed' as any,
        width: 25,
        height: 25,
        color: '#2563eb',
      }
    });
  }

  // Create edges from operations to state changes
  validOperations.forEach((op, index) => {
    const sorobanOp = transaction.sorobanOperations?.find((sop, idx) => idx === index);

    if (sorobanOp?.stateChanges && sorobanOp.stateChanges.length > 0) {
      sorobanOp.stateChanges.forEach((stateChange, changeIdx) => {
        edges.push({
          id: `edge-op${index}-state${changeIdx}`,
          source: `op-${index}`,
          target: `state-${index}-${changeIdx}`,
          type: 'straight',
          animated: false,
          style: {
            stroke: '#10b981',
            strokeWidth: 2
          },
          markerEnd: {
            type: 'arrowclosed' as any,
            width: 16,
            height: 16,
            color: '#10b981',
          }
        });
      });
    }
  });
  return edges;
};

export const simulateTransactionWithDebugger = async (hash: string, horizonTx?: any) => {

  try {
    const tx = horizonTx || await server.transactions().transaction(hash).call();
    const operations = await server.operations().forTransaction(hash).limit(200).call();

    // Normalize source_account fields immediately - Horizon sometimes returns arrays
    operations.records = operations.records.map(op => ({
      ...op,
      source_account: extractAccountAddress(op.source_account)
    }));

    // Decode result XDR to get proper error codes
    let errorAnalysis: any = null;
    if (tx.result_xdr) {
      try {
        const transactionResult = StellarSdk.xdr.TransactionResult.fromXDR(tx.result_xdr, 'base64');
        errorAnalysis = analyzeTransactionErrors(transactionResult);
      } catch (error) {
      }
    }

    // Check if Soroban transaction
    const hasSorobanOps = operations.records.some(op => op.type === 'invoke_host_function');

    // Query Soroban RPC for real resource usage
    let sorobanData = null;
    let simulationData = null;
    if (hasSorobanOps) {
      try {
        sorobanData = await querySorobanRpc(hash);

        // Extract actual consumed resources directly from RPC response
        // Stellar RPC returns CPU and memory in the transaction result
        if (sorobanData) {

          // Check for direct CPU/memory fields
          const possibleCpuFields = ['cpuInsns', 'cpu_instructions', 'totalCpuInsns'];
          const possibleMemFields = ['memBytes', 'memory_bytes', 'totalMemBytes'];

          for (const field of possibleCpuFields) {
            if (sorobanData[field] !== undefined) {
            }
          }

          for (const field of possibleMemFields) {
            if (sorobanData[field] !== undefined) {
            }
          }
        }

        // Try to simulate the transaction to get resource usage
        if (tx.envelope_xdr && tx.successful) {
          try {
            const transaction = StellarSdk.TransactionBuilder.fromXDR(tx.envelope_xdr, networkConfig.networkPassphrase) as StellarSdk.Transaction;

            // Use official Stellar RPC to simulate (free public endpoint)
            const rpcUrl = networkConfig.isTestnet
              ? 'https://soroban-testnet.stellar.org'
              : 'https://soroban-rpc.mainnet.stellar.gateway.fm';

            const rpcServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: false });
            const simResult = await rpcServer.simulateTransaction(transaction);

            simulationData = simResult;
          } catch (simError: any) {
          }
        }
      } catch (err) {
      }
    }

    // For failed Soroban transactions, note that we can't re-simulate
    // because the original transaction state may no longer exist
    let simulationDiagnostics: any = null;
    if (!tx.successful && hasSorobanOps) {
      simulationDiagnostics = {
        note: 'Diagnostic events are only available for successful Soroban transactions. For failed transactions, the XDR error codes provide the failure reason.'
      };
    }

    // Extract real resource usage from simulation or Soroban RPC metadata
    let realResourceUsage = {
      cpuInstructions: 0,
      memoryBytes: 0,
      readBytes: 0,
      writeBytes: 0,
      readLedgerEntries: 0,
      writeLedgerEntries: 0,
      budgetedCpuInstructions: 0,
      budgetedMemoryBytes: 0,
      isActual: false
    };

    // First, try to get resource usage from envelope sorobanData (for historical transactions)

    // Skip trying to extract actual from invoke result - we'll get it from metadata later

    // Always try to extract BUDGETED resources from envelope sorobanData
    if ((tx as any).__envelopeSorobanData) {
      try {
        const sorobanData = StellarSdk.xdr.SorobanTransactionData.fromXDR((tx as any).__envelopeSorobanData, 'base64');
        const resources = sorobanData.resources();

        // Extract budgeted CPU instructions
        if (resources.instructions) {
          const budgetedCpu = Number(resources.instructions());
          realResourceUsage.budgetedCpuInstructions = budgetedCpu;

          // Only use as actual if we don't have actual values
          if (realResourceUsage.cpuInstructions === 0) {
            realResourceUsage.cpuInstructions = budgetedCpu;
          } else {
          }
        }

        if ((resources as any).readBytes) {
          realResourceUsage.readBytes = Number((resources as any).readBytes());
        }
        if ((resources as any).writeBytes) {
          realResourceUsage.writeBytes = Number((resources as any).writeBytes());
        }

        // Try different field names for memory (budgeted)
        const memoryFields = ['memBytes', 'memoryBytes', 'memory'];
        for (const field of memoryFields) {
          if ((resources as any)[field]) {
            const budgetedMem = Number((resources as any)[field]());
            realResourceUsage.budgetedMemoryBytes = budgetedMem;

            // Only use as actual if we don't have actual values
            if (realResourceUsage.memoryBytes === 0) {
              realResourceUsage.memoryBytes = budgetedMem;
            } else {
            }
            break;
          }
        }

        // If no budgeted memory but we have I/O bytes, calculate budgeted memory
        if (realResourceUsage.budgetedMemoryBytes === 0 && (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0)) {
          realResourceUsage.budgetedMemoryBytes = realResourceUsage.readBytes + realResourceUsage.writeBytes;
        }

        // If memory not found directly, use read+write bytes
        // In Soroban, memory usage for ledger operations = read + write bytes
        if (realResourceUsage.memoryBytes === 0 && (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0)) {
          realResourceUsage.memoryBytes = realResourceUsage.readBytes + realResourceUsage.writeBytes;
        }
        // Try to extract ledger entry counts
        if ((resources as any).readLedgerEntries) {
          realResourceUsage.readLedgerEntries = Number((resources as any).readLedgerEntries());
        }
        if ((resources as any).writeLedgerEntries) {
          realResourceUsage.writeLedgerEntries = Number((resources as any).writeLedgerEntries());
        }

        // If not found directly, try to get from footprint in RESOURCES (not sorobanData)
        if (realResourceUsage.readLedgerEntries === 0 || realResourceUsage.writeLedgerEntries === 0) {

          try {
            // Get footprint from RESOURCES, not sorobanData!
            const footprint = (resources as any).footprint ? (resources as any).footprint() : null;

            if (footprint) {

              const readOnly = footprint.readOnly ? footprint.readOnly() : [];
              const readWrite = footprint.readWrite ? footprint.readWrite() : [];

              if (realResourceUsage.readLedgerEntries === 0) {
                realResourceUsage.readLedgerEntries = readOnly.length + readWrite.length;
              }

              if (realResourceUsage.writeLedgerEntries === 0) {
                realResourceUsage.writeLedgerEntries = readWrite.length;
              }
            } else {
            }
          } catch (footprintError: any) {
          }
        } else {
        }
      } catch (envDataError: any) {
      }
    }

    // Next, try to get resource usage from simulation's transactionData
    if (simulationData && 'transactionData' in simulationData && realResourceUsage.cpuInstructions === 0) {
      try {
        const txData = (simulationData as any).transactionData;

        if (txData) {
          // Check if it's already a parsed object with resources() method
          if (typeof txData.resources === 'function') {
            const resources = txData.resources();

            if (resources.instructions) {
              realResourceUsage.cpuInstructions = Number(resources.instructions());
            }
            if (resources.readBytes) realResourceUsage.readBytes = Number(resources.readBytes());
            if (resources.writeBytes) realResourceUsage.writeBytes = Number(resources.writeBytes());
            if (resources.readLedgerEntries) realResourceUsage.readLedgerEntries = Number(resources.readLedgerEntries());
            if (resources.writeLedgerEntries) realResourceUsage.writeLedgerEntries = Number(resources.writeLedgerEntries());

            // If entry counts not found, try footprint from the parsed data
            if ((realResourceUsage.readLedgerEntries === 0 || realResourceUsage.writeLedgerEntries === 0) && typeof txData.footprint === 'function') {
              try {
                const footprint = txData.footprint();
                const readOnly = footprint.readOnly ? footprint.readOnly() : [];
                const readWrite = footprint.readWrite ? footprint.readWrite() : [];

                if (realResourceUsage.readLedgerEntries === 0) {
                  realResourceUsage.readLedgerEntries = readOnly.length + readWrite.length;
                }

                if (realResourceUsage.writeLedgerEntries === 0) {
                  realResourceUsage.writeLedgerEntries = readWrite.length;
                }
              } catch (footprintError: any) {
              }
            }
          }
          // If it's an XDR object/string, try to parse it
          else if (txData.toXDR || typeof txData === 'string') {
            try {
              const txDataXdr = typeof txData === 'string' ? txData : txData.toXDR('base64');

              const parsedTxData = StellarSdk.xdr.SorobanTransactionData.fromXDR(txDataXdr, 'base64');
              const resources = parsedTxData.resources();

              if (resources.instructions) {
                realResourceUsage.cpuInstructions = Number(resources.instructions());
              }
              if ((resources as any).readBytes) realResourceUsage.readBytes = Number((resources as any).readBytes());
              if ((resources as any).writeBytes) realResourceUsage.writeBytes = Number((resources as any).writeBytes());
              if ((resources as any).readLedgerEntries) realResourceUsage.readLedgerEntries = Number((resources as any).readLedgerEntries());
              if ((resources as any).writeLedgerEntries) realResourceUsage.writeLedgerEntries = Number((resources as any).writeLedgerEntries());

              // If entry counts not found, extract from footprint
              if (realResourceUsage.readLedgerEntries === 0 || realResourceUsage.writeLedgerEntries === 0) {
                try {
                  const footprint = (parsedTxData as any).footprint ? (parsedTxData as any).footprint() : null;
                  if (footprint) {
                    const readOnly = footprint.readOnly ? footprint.readOnly() : [];
                    const readWrite = footprint.readWrite ? footprint.readWrite() : [];

                    if (realResourceUsage.readLedgerEntries === 0) {
                      realResourceUsage.readLedgerEntries = readOnly.length + readWrite.length;
                    }

                    if (realResourceUsage.writeLedgerEntries === 0) {
                      realResourceUsage.writeLedgerEntries = readWrite.length;
                    }
                  }
                } catch (footprintError: any) {
                }
              }
            } catch (xdrError: any) {
            }
          }
        }
      } catch (txDataError: any) {
      }
    }

    // Fallback: try to get resource usage from simulation cost
    if (realResourceUsage.cpuInstructions === 0 && simulationData && 'cost' in simulationData) {
      try {
        const cost = (simulationData as any).cost;
        if (cost) {
          if (cost.cpuInsns) realResourceUsage.cpuInstructions = parseInt(cost.cpuInsns);
          if (cost.memBytes) realResourceUsage.memoryBytes = parseInt(cost.memBytes);
          if (cost.readBytes) realResourceUsage.readBytes = parseInt(cost.readBytes);
          if (cost.writeBytes) realResourceUsage.writeBytes = parseInt(cost.writeBytes);
        }
      } catch (costError: any) {
      }
    }

    // Parse metadata XDR - try multiple sources

    if (sorobanData) {
    }

    // Priority order: Soroban RPC > Horizon soroban_meta_xdr > Horizon result_meta_xdr
    let metaXdr = sorobanData?.resultMetaXdr || sorobanData?.result_meta_xdr;

    // If Soroban RPC returned NOT_FOUND or no metaXdr, use Horizon's XDR
    if (!metaXdr) {
      if ((tx as any).soroban_meta_xdr) {
        metaXdr = (tx as any).soroban_meta_xdr;
      } else if ((tx as any).result_meta_xdr) {
        metaXdr = (tx as any).result_meta_xdr;
      }
    } else {
    }

    if (metaXdr) {
      try {
        const meta = StellarSdk.xdr.TransactionMeta.fromXDR(metaXdr, 'base64');
        const metaSwitch = meta.switch();
        const metaType = (metaSwitch as any).name || String(metaSwitch);

        // Handle both v3 and v4 transaction meta
        if (metaType === 'transactionMetaV3' || metaType === '3' || metaType === 'transactionMetaV4' || metaType === '4') {
          const metaVersion = (metaType === 'transactionMetaV4' || metaType === '4') ? (meta as any).v4() : meta.v3();

          if (metaVersion.sorobanMeta && metaVersion.sorobanMeta()) {
            const sorobanMeta = metaVersion.sorobanMeta();

            // Extract diagnostic events for contract execution logs
            try {
              const diagnosticEvents = sorobanMeta.diagnosticEvents ? sorobanMeta.diagnosticEvents() : [];

              if (diagnosticEvents.length > 0) {
                diagnosticEvents.forEach((event: any, idx: number) => {
                  try {
                    const inSuccessfulContractCall = event.inSuccessfulContractCall();
                    const eventData = event.event();

                    // Extract contract ID if available
                    let contractId = 'unknown';
                    try {
                      const contractIdHash = eventData.contractId && eventData.contractId();
                      if (contractIdHash) {
                        contractId = StellarSdk.StrKey.encodeContract(contractIdHash);
                      }
                    } catch { }

                    // Extract event body
                    const body = eventData.body();
                    const bodySwitch = body.switch();
                    const bodyType = (bodySwitch as any).name || String(bodySwitch);

                    // Extract topics and data from contract events
                    if (bodyType === 'contractEvent' || bodyType === '0') {
                      try {
                        const v0 = body.v0();
                        const topics = v0.topics ? v0.topics() : [];
                        const data = v0.data();

                        logs.push(`📍 Event ${idx + 1}: ${contractId.substring(0, 12)}...`);
                        topics.forEach((topic: any, topicIdx: number) => {
                          try {
                            const topicStr = decodeScVal(topic);
                            logs.push(`   Topic ${topicIdx}: ${safeStringify(topicStr)}`);
                          } catch { }
                        });

                        try {
                          const dataStr = decodeScVal(data);
                          logs.push(`   Data: ${safeStringify(dataStr)}`);
                        } catch { }
                      } catch (bodyError: any) {
                      }
                    }
                  } catch (eventError: any) {
                  }
                });
              }
            } catch (diagError: any) {
            }

            // First, let's log what's directly available on sorobanMeta

            // Extract ACTUAL resource usage from sorobanMeta
            // The structure is: sorobanMeta.ext().v1().ext().v0() contains actual consumed resources
            try {
              const ext = sorobanMeta.ext();
              const extSwitch = ext.switch();

              if (extSwitch === 1) {
                // Get v1 extension which contains resource info
                const v1Ext = (ext as any).v1?.() || (ext as any)._value;

                if (!v1Ext) {
                  throw new Error('v1 extension not accessible');
                }

                // Try to get ext which contains the actual resource consumption
                // Protocol 20+: v1Ext.ext().v0() contains actual consumed resources
                const v1ExtExt = v1Ext.ext?.();
                if (v1ExtExt) {
                  const v1ExtExtSwitch = v1ExtExt.switch?.();

                  if (v1ExtExtSwitch === 0) {
                    // Protocol 20: Get actual consumed resources from v0
                    const consumedResources = (v1ExtExt as any).v0?.() || (v1ExtExt as any)._value;
                    if (consumedResources) {

                      // Extract CPU and memory
                      const cpuInsns = consumedResources.ext?.()?.v0?.()?.cpuInsns?.();
                      const memBytes = consumedResources.ext?.()?.v0?.()?.memBytes?.();

                      if (cpuInsns) {
                        realResourceUsage.cpuInstructions = Number(cpuInsns);
                        realResourceUsage.isActual = true;
                      }

                      if (memBytes) {
                        realResourceUsage.memoryBytes = Number(memBytes);
                        realResourceUsage.isActual = true;
                      }
                    }
                  }
                }

                // Fallback: try old protocol structure
                if (!realResourceUsage.isActual && typeof v1Ext.ext === 'function') {
                  try {
                    const innerExt = v1Ext.ext();
                    const switchVal = innerExt.switch?.();

                    if (switchVal === 0 && typeof innerExt.v0 === 'function') {
                      const v0Data = innerExt.v0();

                      // Extract from v0Data - try both full names and abbreviations
                      const cpuExtractors = ['cpuInsns', 'cpuInstructions', 'totalCpuInsns'];
                      const memExtractors = ['memBytes', 'memoryBytes', 'totalMemBytes'];

                      for (const method of cpuExtractors) {
                        if (typeof v0Data[method] === 'function') {
                          realResourceUsage.cpuInstructions = Number(v0Data[method]());
                          realResourceUsage.isActual = true;
                          break;
                        }
                      }

                      for (const method of memExtractors) {
                        if (typeof v0Data[method] === 'function') {
                          realResourceUsage.memoryBytes = Number(v0Data[method]());
                          realResourceUsage.isActual = true;
                          break;
                        }
                      }

                      if (typeof v0Data.readBytes === 'function') {
                        const rb = Number(v0Data.readBytes());
                        realResourceUsage.readBytes = rb;
                      }
                      if (typeof v0Data.writeBytes === 'function') {
                        const wb = Number(v0Data.writeBytes());
                        realResourceUsage.writeBytes = wb;
                      }
                      if (typeof v0Data.readLedgerEntries === 'function') {
                        const rle = Number(v0Data.readLedgerEntries());
                        realResourceUsage.readLedgerEntries = rle;
                      }
                      if (typeof v0Data.writeLedgerEntries === 'function') {
                        const wle = Number(v0Data.writeLedgerEntries());
                        realResourceUsage.writeLedgerEntries = wle;
                      }
                    }
                  } catch (extCallError: any) {
                  }
                }

                // Try multiple paths to extract resource usage
                let resourceMetrics = null;

                // Path 1: Direct access (try both as functions and properties)
                try {
                  // Try calling as functions first (most common in XDR)
                  if (typeof v1Ext.totalCpuInsns === 'function') {
                    const cpuValue = v1Ext.totalCpuInsns();
                    const memValue = typeof v1Ext.totalMemBytes === 'function' ? v1Ext.totalMemBytes() : 0;

                    realResourceUsage.cpuInstructions = Number(cpuValue);
                    realResourceUsage.memoryBytes = Number(memValue);
                    realResourceUsage.isActual = true;
                    resourceMetrics = v1Ext;
                  }
                  // Fallback to direct properties
                  else if (v1Ext.totalCpuInsns !== undefined) {
                    realResourceUsage.cpuInstructions = Number(v1Ext.totalCpuInsns);
                    realResourceUsage.memoryBytes = Number(v1Ext.totalMemBytes || 0);
                    realResourceUsage.isActual = true;
                    resourceMetrics = v1Ext;
                  }
                } catch (directError: any) {
                }

                // Path 2: From ext.v1 - ALWAYS try this for complete metrics
                if (v1Ext.ext) {
                  try {
                    const extV1 = v1Ext.ext();
                    const extV1Switch = extV1.switch();
                    const extV1Type = (extV1Switch as any).name || String(extV1Switch);

                    if (extV1Type === '1' && extV1.v1) {
                      const resourceUsageExt = extV1.v1();

                      if (resourceUsageExt.resourceFeeCharged) {
                      }

                      // Try ext.v1.ext.v1 for detailed metrics
                      if (resourceUsageExt.ext) {
                        const resourceExtV1 = resourceUsageExt.ext();
                        const resourceExtV1Switch = resourceExtV1.switch();
                        const resourceExtV1Type = (resourceExtV1Switch as any).name || String(resourceExtV1Switch);

                        if (resourceExtV1Type === '1' && resourceExtV1.v1) {
                          const actualMetrics = resourceExtV1.v1();

                          // Extract all available metrics (override if better data available)
                          if (actualMetrics.cpuInstructions) {
                            const cpu = Number(actualMetrics.cpuInstructions());
                            if (cpu > 0) {
                              realResourceUsage.cpuInstructions = cpu;
                              realResourceUsage.isActual = true;
                            }
                          }
                          if (actualMetrics.memoryBytes) {
                            const mem = Number(actualMetrics.memoryBytes());
                            if (mem > 0) {
                              realResourceUsage.memoryBytes = mem;
                              realResourceUsage.isActual = true;
                            }
                          }
                          if (actualMetrics.readBytes) {
                            const rb = Number(actualMetrics.readBytes());
                            realResourceUsage.readBytes = rb;
                          }
                          if (actualMetrics.writeBytes) {
                            const wb = Number(actualMetrics.writeBytes());
                            realResourceUsage.writeBytes = wb;
                          }
                          if (actualMetrics.readLedgerEntries) {
                            const rle = Number(actualMetrics.readLedgerEntries());
                            realResourceUsage.readLedgerEntries = rle;
                          }
                          if (actualMetrics.writeLedgerEntries) {
                            const wle = Number(actualMetrics.writeLedgerEntries());
                            realResourceUsage.writeLedgerEntries = wle;
                          }

                          // Calculate memory from I/O if not available
                          if (realResourceUsage.memoryBytes === 0 && (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0)) {
                            realResourceUsage.memoryBytes = realResourceUsage.readBytes + realResourceUsage.writeBytes;
                          }
                          resourceMetrics = actualMetrics;
                        }
                      }
                    }
                  } catch (nestedError: any) {
                  }
                }

                // Extract fee information
                try {
                  if (v1Ext.totalNonRefundableResourceFeeCharged) {
                  }
                  if (v1Ext.totalRefundableResourceFeeCharged) {
                  }
                } catch { }
              }
            } catch (extError: any) {
            }
          }
        } else {
        }
      } catch (metaError: any) {
      }
    } else {

      // Try to extract footprint from sorobanData at transaction level
      if (sorobanData && sorobanData.resources) {
        try {
          const resources = sorobanData.resources;

          if (resources.footprint) {
            const footprint = resources.footprint;

            const readOnly = footprint.read_only || footprint.readOnly || [];
            const readWrite = footprint.read_write || footprint.readWrite || [];

            if (readOnly.length > 0 || readWrite.length > 0) {
              realResourceUsage.readLedgerEntries = readOnly.length + readWrite.length;
              realResourceUsage.writeLedgerEntries = readWrite.length;

              // Calculate bytes from footprint entries - they are base64 XDR strings
              readOnly.forEach((entry: any, idx: number) => {
                const xdr = entry.xdr || entry;
                const size = typeof xdr === 'string' ? xdr.length : 0;
                realResourceUsage.readBytes += size;
              });

              readWrite.forEach((entry: any, idx: number) => {
                const xdr = entry.xdr || entry;
                const size = typeof xdr === 'string' ? xdr.length : 0;
                realResourceUsage.readBytes += size;
                realResourceUsage.writeBytes += size;
              });
            } else {
            }
          } else {
          }
        } catch (footprintError: any) {
        }
      } else if (sorobanData) {

        // Try to stringify to see the structure
        try {
        } catch (e) {
        }

        // Try direct property access

        // Try method calls
        if (typeof (sorobanData as any).resources === 'function') {
          const res = (sorobanData as any).resources();
        }
      }
    }

    // Get the actual fee charged (not max_fee which is just authorization limit)
    const feePaid = Number((tx as any).fee_charged || (tx as any).fee_paid || 0);

    const logs: string[] = [
      `📊 Transaction Analysis: ${hash.substring(0, 12)}...`,
      `🌐 Network: ${networkConfig.isTestnet ? 'Testnet' : 'Mainnet'}`,
      `${tx.successful ? '✅' : '❌'} Status: ${tx.successful ? 'Success' : 'Failed'}`,
      `📦 Operations: ${tx.operation_count}`,
      `💰 Fee charged: ${feePaid.toLocaleString()} stroops (${(feePaid / 10000000).toFixed(7)} XLM)`,
      `🔧 Transaction type: ${hasSorobanOps ? 'Soroban Smart Contract' : 'Classic Stellar'}`,
      ''
    ];

    // Add error information at the top if transaction failed
    if (!tx.successful && errorAnalysis) {
      logs.push('❌ TRANSACTION FAILED');
      logs.push('');
      if (errorAnalysis.transactionError) {
        logs.push(`Transaction Error: ${errorAnalysis.transactionError}`);
      }
      if (errorAnalysis.operationErrors && errorAnalysis.operationErrors.length > 0) {
        logs.push(`Operation Errors:`);
        errorAnalysis.operationErrors.forEach((err: any) => {
          logs.push(`  • Operation ${err.operation + 1}: ${err.description || err.error}`);
        });
      }
      logs.push('');
    }

    // Add simulation diagnostics for failed Soroban transactions
    if (simulationDiagnostics) {
      logs.push('=== DIAGNOSTIC INFORMATION ===');
      logs.push('');
      if (simulationDiagnostics.note) {
        logs.push(`ℹ️ ${simulationDiagnostics.note}`);
      }
      logs.push('');
    }

    // Add real resource usage metrics if available
    if (hasSorobanOps) {
      logs.push('=== RESOURCE USAGE ===');
      logs.push('');
      if (realResourceUsage.cpuInstructions > 0) {
        logs.push(`🖥️  CPU Instructions: ${realResourceUsage.cpuInstructions.toLocaleString()}${realResourceUsage.isActual ? ' (actual consumed)' : ' (budgeted)'}`);
        logs.push(`💾 Memory Usage: ${realResourceUsage.memoryBytes.toLocaleString()} bytes${realResourceUsage.isActual ? ' (actual consumed)' : ' (budgeted)'}`);

        if (realResourceUsage.budgetedCpuInstructions > 0 && realResourceUsage.budgetedCpuInstructions !== realResourceUsage.cpuInstructions) {
          logs.push(`📊 Budgeted CPU: ${realResourceUsage.budgetedCpuInstructions.toLocaleString()}`);
          logs.push(`💡 CPU Saved: ${(realResourceUsage.budgetedCpuInstructions - realResourceUsage.cpuInstructions).toLocaleString()}`);
        }

        if (realResourceUsage.budgetedMemoryBytes > 0 && realResourceUsage.budgetedMemoryBytes !== realResourceUsage.memoryBytes) {
          logs.push(`📊 Budgeted Memory: ${realResourceUsage.budgetedMemoryBytes.toLocaleString()} bytes`);
          logs.push(`💡 Memory Saved: ${(realResourceUsage.budgetedMemoryBytes - realResourceUsage.memoryBytes).toLocaleString()} bytes`);
        }

        if (realResourceUsage.memoryBytes === 0 && realResourceUsage.cpuInstructions > 0) {
          logs.push('');
          logs.push('⚠️ Memory tracking not available for this transaction');
          logs.push('   Possible reasons:');
          logs.push('   • Transaction uses older protocol version (pre-Protocol 21)');
          logs.push('   • Contract execution had no ledger I/O operations');
          logs.push('   • Metadata format doesn\'t include memory metrics');
        }

        if (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0) {
          logs.push('');
          logs.push(`📖 Read Operations: ${realResourceUsage.readLedgerEntries} entries (${realResourceUsage.readBytes.toLocaleString()} bytes)`);
          logs.push(`✍️  Write Operations: ${realResourceUsage.writeLedgerEntries} entries (${realResourceUsage.writeBytes.toLocaleString()} bytes)`);
        }
      } else {
        logs.push('⚠️ Resource usage data not available from Soroban RPC');
        logs.push('This could mean:');
        logs.push('  • The transaction is too old (RPC only keeps recent data)');
        logs.push('  • The RPC endpoint did not return metadata');
        logs.push('  • Network connectivity issues');
      }
      logs.push('');
    }

    // For Classic transactions, explain there are no CPU/memory metrics
    if (!hasSorobanOps) {
      logs.push('ℹ️ Classic Stellar Transaction');
      logs.push('This is a traditional Stellar protocol transaction.');
      logs.push('Classic operations (payments, trustlines, offers) have flat costs.');
      logs.push('There are no CPU instructions or memory metrics.');
      logs.push(`Base fee: 100 stroops per operation × ${tx.operation_count} operations = ${tx.operation_count * 100} stroops minimum`);
      logs.push('');
    }

    // This section is no longer needed since we get data from Soroban RPC
    if (false && tx.result_meta_xdr) {
      try {
        const meta = StellarSdk.xdr.TransactionMeta.fromXDR(tx.result_meta_xdr, 'base64');
        const metaSwitch = meta.switch();
        const metaType = (metaSwitch as any).name || String(metaSwitch);

        logs.push(`Transaction meta type: ${metaType}`);

        // For Soroban transactions (v3 or v4 meta)
        if (metaType === 'transactionMetaV3' || metaType === 'transactionMetaV4' || metaType === '3' || metaType === '4') {
          const v3 = (metaType === 'transactionMetaV4' || metaType === '4') ? meta.v4() : meta.v3();

          if (v3.sorobanMeta && v3.sorobanMeta()) {
            const sorobanMeta = v3.sorobanMeta();

            // Extract CPU instructions and memory from return value
            try {
              const returnValue = sorobanMeta.returnValue();
              if (returnValue) {
                logs.push(`Contract returned value (type: ${returnValue.switch().name})`);
              }
            } catch (e) {
              // No return value or unable to parse
            }

            // Extract real resource usage from ext.v1
            try {
              const ext = sorobanMeta.ext();
              const extSwitch = ext.switch();
              const extType = (extSwitch as any).name || String(extSwitch);
              logs.push(`Soroban meta ext type: ${extType}`);

              if (extType === 'sorobanTransactionMetaExtV1' || (ext as any).v1) {
                const v1Ext = (ext as any).v1();
                logs.push('✅ Found v1 extension');

                // Extract CPU instructions
                try {
                  if (v1Ext.totalCpuInsns) {
                    const cpuValue = v1Ext.totalCpuInsns();
                    realResourceUsage.cpuInstructions = Number(cpuValue);
                    logs.push(`✅ CPU Instructions extracted: ${realResourceUsage.cpuInstructions.toLocaleString()}`);
                  } else {
                    logs.push('⚠️ totalCpuInsns field not found in v1 ext');
                  }
                } catch (e: any) {
                  logs.push(`⚠️ Could not extract CPU instructions: ${e.message}`);
                }

                // Extract memory bytes
                try {
                  if (v1Ext.totalMemBytes) {
                    const memValue = v1Ext.totalMemBytes();
                    realResourceUsage.memoryBytes = Number(memValue);
                    logs.push(`✅ Memory bytes extracted: ${realResourceUsage.memoryBytes.toLocaleString()}`);
                  } else {
                    logs.push('⚠️ totalMemBytes field not found in v1 ext');
                  }
                } catch (e: any) {
                  logs.push(`⚠️ Could not extract memory bytes: ${e.message}`);
                }

                // Get real resource fees
                try {
                  if (v1Ext.totalNonRefundableResourceFeeCharged) {
                    const fee = Number(v1Ext.totalNonRefundableResourceFeeCharged());
                    logs.push(`Non-refundable resource fee: ${fee} stroops`);
                  }
                } catch (e) {
                  // Skip if field not available
                }
                try {
                  if (v1Ext.totalRefundableResourceFeeCharged) {
                    const fee = Number(v1Ext.totalRefundableResourceFeeCharged());
                    logs.push(`Refundable resource fee: ${fee} stroops`);
                  }
                } catch (e) {
                  // Skip if field not available
                }
              } else {
                logs.push('⚠️ No v1 extension found in soroban meta');
              }
            } catch (extError) {
              logs.push('⚠️ Could not extract extension data');
            }

            // Extract real diagnostic events as logs
            try {
              const events = (sorobanMeta as any).events();
              if (events && events.length > 0) {
                logs.push(`📡 Diagnostic events: ${events.length} events emitted`);
                logs.push('');
                logs.push('=== CONTRACT EXECUTION LOGS ===');

                events.forEach((event: any, idx: number) => {
                  try {
                    const contractId = event.contractId();
                    const topics = event.body().v0().topics();
                    const data = event.body().v0().data();

                    // Format contract ID
                    const contractIdStr = contractId ? StellarSdk.StrKey.encodeContract(contractId) : 'N/A';
                    logs.push(`\n[Event ${idx + 1}] Contract: ${contractIdStr.substring(0, 12)}...`);

                    // Parse topics (function name, parameters)
                    if (topics && topics.length > 0) {
                      topics.forEach((topic: any, topicIdx: number) => {
                        try {
                          const scVal = topic;
                          const valType = scVal.switch().name || String(scVal.switch());

                          if (valType === 'scvSymbol') {
                            const symbol = scVal.sym().toString();
                            logs.push(`  Topic ${topicIdx}: "${symbol}" (Symbol)`);
                          } else if (valType === 'scvString') {
                            const str = scVal.str().toString();
                            logs.push(`  Topic ${topicIdx}: "${str}" (String)`);
                          } else if (valType === 'scvU32' || valType === 'scvI32') {
                            const num = Number(valType === 'scvU32' ? scVal.u32() : scVal.i32());
                            logs.push(`  Topic ${topicIdx}: ${num} (Number)`);
                          } else if (valType === 'scvU64' || valType === 'scvI64') {
                            const num = valType === 'scvU64' ? scVal.u64().toString() : scVal.i64().toString();
                            logs.push(`  Topic ${topicIdx}: ${num} (BigInt)`);
                          } else if (valType === 'scvBool') {
                            const bool = scVal.b();
                            logs.push(`  Topic ${topicIdx}: ${bool} (Boolean)`);
                          } else if (valType === 'scvBytes') {
                            const bytes = scVal.bytes();
                            logs.push(`  Topic ${topicIdx}: 0x${bytes.toString('hex').substring(0, 16)}... (Bytes)`);
                          } else {
                            logs.push(`  Topic ${topicIdx}: <${valType}>`);
                          }
                        } catch (e) {
                          logs.push(`  Topic ${topicIdx}: <parsing error>`);
                        }
                      });
                    }

                    // Parse event data
                    try {
                      const dataType = data.switch().name || String(data.switch());
                      if (dataType === 'scvString') {
                        logs.push(`  Data: "${data.str().toString()}"`);
                      } else if (dataType === 'scvU32' || dataType === 'scvI32') {
                        const num = Number(dataType === 'scvU32' ? data.u32() : data.i32());
                        logs.push(`  Data: ${num}`);
                      } else if (dataType === 'scvU64' || dataType === 'scvI64') {
                        const num = dataType === 'scvU64' ? data.u64().toString() : data.i64().toString();
                        logs.push(`  Data: ${num}`);
                      } else if (dataType === 'scvBool') {
                        logs.push(`  Data: ${data.b()}`);
                      } else if (dataType === 'scvBytes') {
                        const bytes = data.bytes();
                        logs.push(`  Data: 0x${bytes.toString('hex').substring(0, 32)}...`);
                      } else if (dataType === 'scvVec') {
                        const vec = data.vec();
                        logs.push(`  Data: Array[${vec.length}]`);
                      } else if (dataType === 'scvMap') {
                        const map = data.map();
                        logs.push(`  Data: Map{${map.length} entries}`);
                      } else {
                        logs.push(`  Data: <${dataType}>`);
                      }
                    } catch (e) {
                      logs.push(`  Data: <parsing error>`);
                    }
                  } catch (eventError) {
                    logs.push(`[Event ${idx + 1}] <parsing error>`);
                  }
                });

                logs.push('');
                logs.push('=== END CONTRACT LOGS ===');
                logs.push('');
              }
            } catch (e) {
              logs.push('⚠️ Could not extract diagnostic events');
            }

            // Count ledger entry changes for I/O metrics
            try {
              const operations = v3.operations ? v3.operations() : [];
              operations.forEach((op: any) => {
                try {
                  const changes = op.changes ? op.changes() : [];
                  realResourceUsage.readLedgerEntries += changes.length;

                  changes.forEach((change: any) => {
                    try {
                      const changeSwitch = change.switch();
                      const changeType = (changeSwitch as any).name || String(changeSwitch);
                      if (changeType === 'ledgerEntryRestored') {
                        const entry = change.restored();
                        realResourceUsage.readBytes += entry.toXDR('base64').length;
                      } else if (changeType === 'ledgerEntryCreated' || changeType === 'ledgerEntryUpdated') {
                        const entry = changeType === 'ledgerEntryCreated' ? change.created() : change.updated();
                        realResourceUsage.writeBytes += entry.toXDR('base64').length;
                        realResourceUsage.writeLedgerEntries++;
                      }
                    } catch (e) {
                      // Skip if unable to parse change
                    }
                  });
                } catch (e) {
                  // Skip if unable to parse operation changes
                }
              });

              logs.push(`Ledger entries read: ${realResourceUsage.readLedgerEntries}`);
              logs.push(`Ledger entries written: ${realResourceUsage.writeLedgerEntries}`);
              logs.push(`Total read bytes: ${realResourceUsage.readBytes}`);
              logs.push(`Total write bytes: ${realResourceUsage.writeBytes}`);
            } catch (e) {
              logs.push('⚠️ Could not extract I/O metrics');
            }
          }
        }

        // Calculate metrics based on available data (ONLY for Soroban transactions)
        if (hasSorobanOps) {
          if (realResourceUsage.cpuInstructions === 0) {
            logs.push(`⚠️ CPU Instructions: Could not extract from metadata`);
          } else {
            logs.push(`✅ CPU Instructions (real): ${realResourceUsage.cpuInstructions.toLocaleString()}`);
          }

          if (realResourceUsage.memoryBytes === 0) {
            logs.push(`⚠️ Memory Usage: Could not extract from metadata`);
          } else {
            logs.push(`✅ Memory Usage (real): ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
          }
        } else {
          // For Classic transactions, don't report CPU/memory
          logs.push('ℹ️ No CPU/memory metrics for Classic transactions');
        }

        // Add metadata size as a real metric
        const metaSize = tx.result_meta_xdr ? tx.result_meta_xdr.length : 0;
        if (metaSize > 0) {
          logs.push(`📄 Transaction metadata size: ${metaSize.toLocaleString()} bytes`);
        }

      } catch (metaError: any) {
      }
    }

    logs.push('✅ Analysis completed');

    // Extract real stack traces from failed transactions
    const stackTrace: Array<{ phase: string; error: string; stack: string }> = [];

    if (!tx.successful) {
      logs.push('');
      logs.push('=== ERROR ANALYSIS ===');

      const resultCodes = (tx as any).result_codes;
      if (resultCodes) {
        // Transaction-level error
        if (resultCodes.transaction) {
          stackTrace.push({
            phase: 'transaction',
            error: resultCodes.transaction,
            stack: `Transaction failed with code: ${resultCodes.transaction}`
          });
          logs.push(`❌ Transaction Error: ${resultCodes.transaction}`);
        }

        // Operation-level errors
        if (resultCodes.operations && Array.isArray(resultCodes.operations)) {
          resultCodes.operations.forEach((opCode: string, idx: number) => {
            if (opCode !== 'op_success') {
              stackTrace.push({
                phase: `operation_${idx}`,
                error: opCode,
                stack: `Operation ${idx + 1} failed with code: ${opCode}`
              });
              logs.push(`❌ Operation ${idx + 1} Error: ${opCode}`);
            }
          });
        }
      }

      // Extract Soroban-specific error details
      if (tx.result_meta_xdr) {
        try {
          const meta = StellarSdk.xdr.TransactionMeta.fromXDR(tx.result_meta_xdr, 'base64');
          const metaSwitch = meta.switch();
          const metaType = (metaSwitch as any).name || String(metaSwitch);

          if (metaType === 'transactionMetaV3' || metaType === 'transactionMetaV4' || metaType === '3' || metaType === '4') {
            const v3 = (metaType === 'transactionMetaV4' || metaType === '4') ? meta.v4() : meta.v3();
            if (v3.sorobanMeta && v3.sorobanMeta()) {
              const sorobanMeta = v3.sorobanMeta();

              // Check for return value that might contain error info
              try {
                const returnValue = sorobanMeta.returnValue();
                if (returnValue) {
                  const valType = (returnValue.switch() as any).name || String(returnValue.switch());
                  if (valType === 'scvString') {
                    const errorMsg = returnValue.str().toString();
                    logs.push(`❌ Contract Error Message: "${errorMsg}"`);
                    stackTrace.push({
                      phase: 'contract_execution',
                      error: errorMsg,
                      stack: `Smart contract returned error: ${errorMsg}`
                    });
                  }
                }
              } catch (e) {
                // No return value or couldn't parse
              }

              // Check diagnostic events for error logs
              try {
                const events = (sorobanMeta as any).events();
                if (events && events.length > 0) {
                  logs.push(`\n📋 Error Context from ${events.length} diagnostic events:`);
                  events.forEach((event: any, idx: number) => {
                    try {
                      const topics = event.body().v0().topics();
                      const data = event.body().v0().data();

                      // Look for error-related topics
                      if (topics && topics.length > 0) {
                        topics.forEach((topic: any) => {
                          try {
                            const valType = (topic.switch() as any).name || String(topic.switch());
                            if (valType === 'scvSymbol' || valType === 'scvString') {
                              const value = valType === 'scvSymbol' ? topic.sym().toString() : topic.str().toString();
                              if (value.toLowerCase().includes('error') || value.toLowerCase().includes('fail')) {
                                logs.push(`  [Event ${idx + 1}] Error indicator: "${value}"`);
                              }
                            }
                          } catch (e) {
                            // Skip
                          }
                        });
                      }
                    } catch (e) {
                      // Skip event
                    }
                  });
                }
              } catch (e) {
                // No events
              }
            }
          }
        } catch (e) {
          // Couldn't extract error details
        }
      }

      logs.push('=== END ERROR ANALYSIS ===');
      logs.push('');
    }

    // Final consolidation: if memory is still 0 but we have I/O bytes, calculate it
    if (realResourceUsage.memoryBytes === 0 && (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0)) {
      realResourceUsage.memoryBytes = realResourceUsage.readBytes + realResourceUsage.writeBytes;
    }

    // FINAL AGGRESSIVE FOOTPRINT EXTRACTION - Last resort to get entry counts

    if (realResourceUsage.readLedgerEntries === 0 || realResourceUsage.writeLedgerEntries === 0) {

      try {
        // Try to parse envelope XDR and extract footprint
        const envelopeXdr = (tx as any).envelope_xdr;

        if (envelopeXdr) {
          const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');

          let txEnvelope: any = null;
          const envSwitch = envelope.switch();

          if (envSwitch.name === 'envelopeTypeTx' || String(envSwitch) === '2') {
            txEnvelope = envelope.v1();
          } else if (envSwitch.name === 'envelopeTypeTxV0' || String(envSwitch) === '0') {
            txEnvelope = envelope.v0();
          } else if (envSwitch.name === 'envelopeTypeTxFeeBump' || String(envSwitch) === '5') {
            const feeBump = envelope.feeBump();
            txEnvelope = feeBump.tx().innerTx().v1();
          }

          if (txEnvelope) {
            const txBody = txEnvelope.tx();
            const ext = txBody.ext();

            if (ext && ext.switch && ext.switch().value === 1) {
              const sorobanData = ext.sorobanData();
              const footprint = sorobanData.resources().footprint();

              const readOnly = footprint.readOnly();
              const readWrite = footprint.readWrite();

              if (realResourceUsage.readLedgerEntries === 0) {
                realResourceUsage.readLedgerEntries = readOnly.length + readWrite.length;
              }

              if (realResourceUsage.writeLedgerEntries === 0) {
                realResourceUsage.writeLedgerEntries = readWrite.length;
              }
            } else {
            }
          } else {
          }
        } else {
        }
      } catch (finalError: any) {
      }
    }

    // Enhanced simulation with debug information
    const simulation: SimulationResult = {
      success: tx.successful,
      estimatedFee: String((tx as any).fee_charged || (tx as any).fee_paid || '100'),
      potentialErrors: tx.successful ? [] : [(tx as any).result_codes?.transaction || 'Transaction failed'],
      resourceUsage: {
        cpuUsage: hasSorobanOps ? realResourceUsage.cpuInstructions : 0,
        memoryUsage: hasSorobanOps ? realResourceUsage.memoryBytes : 0
      },
      enhancedDebugInfo: {
        logs,
        stackTrace,
        resourceUsage: realResourceUsage,
        timing: {
          simulationTime: Date.now() - new Date(tx.created_at).getTime(),
          networkLatency: 0
        },
        operationBreakdown: []
      }
    };

    // Add operation breakdown with real detailed logs
    simulation.enhancedDebugInfo!.operationBreakdown = operations.records.map((op, index) => {
      const opLogs = [
        `╔═══ Operation ${index + 1} ═══`,
        `║ Type: ${op.type}`,
        `║ Source Account: ${extractAccountAddress(op.source_account).substring(0, 12)}...`,
        `║ Created: ${op.created_at}`,
        `║ Transaction: ${op.transaction_hash.substring(0, 16)}...`
      ];

      // Add operation-specific detailed logs
      if (op.type === 'invoke_host_function') {
        const invokeFn = op as any;
        opLogs.push(`║ ─── Smart Contract Invocation ───`);

        if (invokeFn.function) {
          opLogs.push(`║ Function Type: ${invokeFn.function}`);
        }

        // Try to decode parameters
        try {
          if (invokeFn.parameters && Array.isArray(invokeFn.parameters)) {
            opLogs.push(`║ Parameters: ${invokeFn.parameters.length} argument(s)`);
            invokeFn.parameters.forEach((param: any, idx: number) => {
              if (param.type === 'Address' && param.value) {
                try {
                  const decoded = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');
                  if (decoded.switch().name === 'scvAddress') {
                    const addr = decoded.address();
                    if (addr.switch().name === 'scAddressTypeContract') {
                      const contractId = StellarSdk.StrKey.encodeContract(Buffer.from(Array.from(addr.contractId() as any)));
                      opLogs.push(`║   [${idx}] Contract Address: ${contractId.substring(0, 20)}...`);
                    } else if (addr.switch().name === 'scAddressTypeAccount') {
                      const accountId = StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(Array.from(addr.accountId().ed25519() as any)));
                      opLogs.push(`║   [${idx}] Account Address: ${accountId.substring(0, 20)}...`);
                    }
                  }
                } catch {
                  opLogs.push(`║   [${idx}] ${param.type}`);
                }
              } else if (param.type === 'Sym' && param.value) {
                try {
                  const decoded = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');
                  if (decoded.switch().name === 'scvSymbol') {
                    const symbol = decoded.sym().toString();
                    opLogs.push(`║   [${idx}] Function Name: "${symbol}"`);
                  }
                } catch {
                  opLogs.push(`║   [${idx}] ${param.type}`);
                }
              } else if (param.type === 'I128' && param.value) {
                try {
                  const decoded = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');
                  if (decoded.switch().name === 'scvI128') {
                    const i128 = decoded.i128();
                    const hi = i128.hi();
                    const lo = i128.lo();
                    // Simple approximation for display
                    const hiStr = String(hi);
                    if (hiStr === '0') {
                      opLogs.push(`║   [${idx}] Integer: ${lo.toString()}`);
                    } else {
                      opLogs.push(`║   [${idx}] Large Integer (128-bit)`);
                    }
                  }
                } catch {
                  opLogs.push(`║   [${idx}] ${param.type}`);
                }
              } else if (param.type === 'U64' && param.value) {
                try {
                  const decoded = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');
                  if (decoded.switch().name === 'scvU64') {
                    const u64 = decoded.u64();
                    opLogs.push(`║   [${idx}] Unsigned Integer: ${u64.toString()}`);
                  }
                } catch {
                  opLogs.push(`║   [${idx}] ${param.type}`);
                }
              } else if (param.type === 'Vec' && param.value) {
                try {
                  const decoded = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');
                  if (decoded.switch().name === 'scvVec') {
                    const vec = decoded.vec();
                    opLogs.push(`║   [${idx}] Vector with ${vec ? vec.length : 0} items`);
                  }
                } catch {
                  opLogs.push(`║   [${idx}] ${param.type}`);
                }
              } else {
                opLogs.push(`║   [${idx}] ${param.type}`);
              }
            });
          }
        } catch (e) {
          opLogs.push(`║ Parameters: [unable to decode]`);
        }

        // Show real resource usage if available
        if (realResourceUsage.cpuInstructions > 0) {
          opLogs.push(`║ ─── Resource Usage ───`);
          opLogs.push(`║ CPU: ${realResourceUsage.cpuInstructions.toLocaleString()} instructions`);
          opLogs.push(`║ Memory: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
          if (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0) {
            opLogs.push(`║ I/O: ${realResourceUsage.readBytes.toLocaleString()}B read, ${realResourceUsage.writeBytes.toLocaleString()}B written`);
          }
        }

      } else if (op.type === 'payment') {
        const payment = op as any;
        opLogs.push(`║ ─── Payment Operation ───`);
        opLogs.push(`║ From: ${payment.from.substring(0, 12)}...`);
        opLogs.push(`║ To: ${payment.to.substring(0, 12)}...`);
        opLogs.push(`║ Amount: ${payment.amount} ${payment.asset_type === 'native' ? 'XLM' : payment.asset_code || 'ASSET'}`);

      } else if (op.type === 'create_account') {
        const createOp = op as any;
        opLogs.push(`║ ─── Create Account ───`);
        opLogs.push(`║ New Account: ${createOp.account.substring(0, 12)}...`);
        opLogs.push(`║ Starting Balance: ${createOp.starting_balance} XLM`);

      } else if (op.type === 'path_payment_strict_send' || op.type === 'path_payment_strict_receive') {
        const pathPayment = op as any;
        opLogs.push(`║ ─── Path Payment ───`);
        opLogs.push(`║ From: ${pathPayment.from.substring(0, 12)}...`);
        opLogs.push(`║ To: ${pathPayment.to ? pathPayment.to.substring(0, 12) + '...' : 'N/A'}`);
        opLogs.push(`║ Source Asset: ${pathPayment.source_asset_type === 'native' ? 'XLM' : pathPayment.source_asset_code || 'ASSET'}`);
        opLogs.push(`║ Destination Asset: ${pathPayment.asset_type === 'native' ? 'XLM' : pathPayment.asset_code || 'ASSET'}`);
        opLogs.push(`║ Amount: ${pathPayment.amount}`);

      } else if (op.type.includes('offer')) {
        const offer = op as any;
        opLogs.push(`║ ─── Manage Offer ───`);
        opLogs.push(`║ Offer ID: ${offer.offer_id || 'new'}`);
        opLogs.push(`║ Buying: ${offer.buying_asset_type === 'native' ? 'XLM' : offer.buying_asset_code || 'ASSET'}`);
        opLogs.push(`║ Selling: ${offer.selling_asset_type === 'native' ? 'XLM' : offer.selling_asset_code || 'ASSET'}`);
        opLogs.push(`║ Amount: ${offer.amount}`);
        opLogs.push(`║ Price: ${offer.price}`);

      } else if (op.type === 'change_trust') {
        const trust = op as any;
        opLogs.push(`║ ─── Change Trust ───`);
        opLogs.push(`║ Asset: ${trust.asset_code || 'ASSET'}`);
        opLogs.push(`║ Issuer: ${trust.asset_issuer ? trust.asset_issuer.substring(0, 12) + '...' : 'N/A'}`);
        opLogs.push(`║ Limit: ${trust.limit}`);

      } else {
        opLogs.push(`║ ─── ${op.type.replace(/_/g, ' ').toUpperCase()} ───`);
        opLogs.push(`║ Details: See operation data`);
      }

      opLogs.push(`╚══════════════════`);

      // Use error analysis from XDR if available, otherwise fall back to result_codes
      let opSuccess = tx.successful;
      let opError: string | undefined = undefined;

      if (errorAnalysis?.operationErrors && errorAnalysis.operationErrors.length > 0) {
        const errorInfo = errorAnalysis.operationErrors.find((e: any) => e.operation === index);
        if (errorInfo) {
          opSuccess = false;
          opError = errorInfo.description || errorInfo.error;
        }
      } else {
        const resultCodes = (tx as any).result_codes;
        opSuccess = resultCodes?.operations?.[index] === 'op_success' || tx.successful;
        if (!opSuccess && resultCodes?.operations?.[index]) {
          opError = getOperationErrorDescription(resultCodes.operations[index]);
        }
      }

      return {
        operation: index,
        type: op.type,
        success: opSuccess,
        error: opError,
        resourceCost: {
          cpu: op.type === 'invoke_host_function' ? 10000 : (op.type.includes('path_payment') ? 500 : 1000),
          memory: op.type === 'invoke_host_function' ? 2048 : 512
        },
        logs: opLogs
      };
    });

    // Return the enhanced debug info from the simulation object
    return {
      simulation,
      debugInfo: simulation.enhancedDebugInfo
    };

  } catch (error: any) {

    const simulation: SimulationResult = {
      success: false,
      estimatedFee: '0',
      potentialErrors: [error.message || 'Enhanced simulation failed'],
      resourceUsage: {
        cpuUsage: 0,
        memoryUsage: 0
      },
      enhancedDebugInfo: {
        logs: [
          `Transaction ${hash} simulation failed`,
          `Error: ${error.message}`,
          'Simulation aborted'
        ],
        stackTrace: [
          {
            phase: 'simulation',
            error: error.message || 'Unknown error',
            stack: error.stack || 'No stack trace available'
          }
        ],
        resourceUsage: {
          cpuInstructions: 0,
          memoryBytes: 0,
          readBytes: 0,
          writeBytes: 0,
          readLedgerEntries: 0,
          writeLedgerEntries: 0,
          budgetedCpuInstructions: 0,
          budgetedMemoryBytes: 0,
          isActual: false
        },
        timing: {
          simulationTime: 0,
          networkLatency: 0
        },
        operationBreakdown: []
      }
    };

    return {
      simulation,
      debugInfo: simulation.enhancedDebugInfo
    };
  }
};

export { simpleContractMetadataService };
