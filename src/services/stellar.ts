import { Horizon } from '@stellar/stellar-sdk';
import * as StellarSdk from '@stellar/stellar-sdk';
import type { 
  TransactionDetails, 
  NetworkConfig, 
  SorobanOperation, 
  ContractEvent, 
  SimulationResult 
} from '../types/stellar';
import { Node, Edge } from 'reactflow';

let server: Horizon.Server;
let networkConfig: NetworkConfig = {
  isTestnet: false,
  networkUrl: 'https://horizon.stellar.org',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
};

export const setNetwork = (config: NetworkConfig) => {
  networkConfig = config;
  server = new Horizon.Server(config.networkUrl);
};

// Initialize with testnet by default
setNetwork(networkConfig);

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

  try {
    // FIRST: Check for special XDR types that scValToNative might not handle well
    try {
      const scValType = scVal.switch?.()?.name || scVal._switch?.name;
      if (scValType === 'scvLedgerKeyContractInstance') {
        return 'ContractInstance';
      }
      if (scValType === 'scvLedgerKeyNonce') {
        return 'Nonce';
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
              return StellarSdk.StrKey.encodeContract(bytes);
            } catch {
              try {
                return StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
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
              return StellarSdk.StrKey.encodeContract(bytes);
            } catch {
              try {
                return StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
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
              return StellarSdk.StrKey.encodeEd25519PublicKey(nativeValue);
            } catch (e1) {
              try {
                // Try as contract address (C...)
                return StellarSdk.StrKey.encodeContract(nativeValue);
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
              return StellarSdk.StrKey.encodeEd25519PublicKey(nativeValue);
            } catch (e1) {
              try {
                // Try as contract address (C...)
                return StellarSdk.StrKey.encodeContract(nativeValue);
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
      console.warn('scValToNative failed, using manual decode:', nativeError);
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
        return 'Nonce';
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
    console.warn('ScVal decode error:', e);
    return '(decode error)';
  }
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
  try {
    console.log('📡 Fetching transaction:', hash);
    console.log('🌐 Network:', networkConfig.isTestnet ? 'TESTNET' : 'MAINNET');
    console.log('🌐 Horizon URL:', networkConfig.networkUrl);
    console.log('🔧 Server instance:', server ? 'initialized' : 'NOT INITIALIZED');

    if (!server) {
      throw new Error('Horizon server not initialized. Please refresh the page.');
    }

    console.log('⏳ Calling Horizon API...');
    const tx = await server.transactions().transaction(hash).call();

    // Fetch full transaction data from Horizon to get XDR fields
    let resultMetaXdr = null;
    let sorobanMetaXdr = null;
    try {
      const horizonUrl = `${networkConfig.networkUrl}/transactions/${hash}`;
      console.log('🔍 Fetching transaction data from:', horizonUrl);
      const response = await fetch(horizonUrl);
      const txData = await response.json();

      const xdrFields = Object.keys(txData).filter(k => k.includes('xdr') || k.includes('meta'));
      console.log('🔍 XDR fields in Horizon response:', xdrFields);
      console.log('🔍 result_meta_xdr available in outer tx:', !!txData.result_meta_xdr);
      console.log('🔍 resultMetaXdr field:', !!txData.resultMetaXdr);
      console.log('🔍 All XDR field values:', xdrFields.map(f => ({ field: f, exists: !!(txData as any)[f] })));

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
        console.log('✅ Found soroban_meta_xdr in response');
      }

      // Check if this is a fee-bumped transaction
      const envelopeXdr = txData.envelope_xdr;
      if (envelopeXdr) {
        try {
          const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
          const envelopeType = envelope.switch().name;
          console.log('🔍 Envelope type:', envelopeType);

          if (envelopeType === 'envelopeTypeTxFeeBump' && envelope.feeBump()) {
            console.log('🎯 Fee-bumped transaction detected!');
            const innerTx = envelope.feeBump().tx().innerTx();
            const innerTxType = innerTx.switch().name;
            console.log('🔍 Inner transaction type:', innerTxType);

            // Check if inner_transaction field exists in Horizon response
            console.log('🔍 Checking for inner_transaction field...');
            console.log('  - txData.inner_transaction exists:', !!txData.inner_transaction);
            if (txData.inner_transaction) {
              console.log('  - inner_transaction keys:', Object.keys(txData.inner_transaction));
            }

            // For fee-bumped Soroban transactions, the inner transaction hash is available in Horizon response
            if (txData.inner_transaction && txData.inner_transaction.hash) {
              const innerHash = txData.inner_transaction.hash;
              console.log('🔍 Inner transaction hash from Horizon:', innerHash);

              // Fetch the inner transaction to get soroban_meta_xdr
              const innerUrl = `${networkConfig.networkUrl}/transactions/${innerHash}`;
              console.log('🔍 Fetching inner transaction from:', innerUrl);
              try {
                const innerResponse = await fetch(innerUrl);
                const innerTxData = await innerResponse.json();

                console.log('🔍 Inner transaction response keys:', Object.keys(innerTxData));
                const innerXdrFields = Object.keys(innerTxData).filter(k => k.includes('xdr') || k.includes('meta'));
                console.log('🔍 XDR fields in inner transaction:', innerXdrFields);
                innerXdrFields.forEach(field => {
                  console.log(`  - ${field}: ${innerTxData[field] ? 'EXISTS' : 'null'}`);
                });

                // Try to get soroban_meta_xdr from inner transaction
                if (innerTxData.soroban_meta_xdr) {
                  sorobanMetaXdr = innerTxData.soroban_meta_xdr;
                  (tx as any).soroban_meta_xdr = sorobanMetaXdr;
                  console.log('✅ Found soroban_meta_xdr in INNER transaction');
                }

                // For result_meta_xdr, check inner transaction (it may have more detailed data)
                if (innerTxData.result_meta_xdr) {
                  console.log('✅ Using result_meta_xdr from inner transaction');
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
                  console.log('ℹ️ Keeping result_meta_xdr from outer transaction');
                  // Keep the outer transaction's result_meta_xdr (already set above)
                }
              } catch (innerErr) {
                console.warn('⚠️ Could not fetch inner transaction:', innerErr);
              }
            }
          }
        } catch (xdrErr) {
          console.warn('⚠️ Could not decode envelope XDR:', xdrErr);
        }
      }

      // If result_meta_xdr is not available, try to extract resources from result_xdr
      if (!resultMetaXdr && txData.result_xdr) {
        console.log('ℹ️ result_meta_xdr not available, will extract resources from result_xdr');
        try {
          const resultXdr = StellarSdk.xdr.TransactionResult.fromXDR(txData.result_xdr, 'base64');
          const resultCode = resultXdr.result().switch().name;
          console.log('🔍 Transaction result code:', resultCode);

          // For successful Soroban transactions, extract resource usage from result
          if (resultCode === 'txSuccess' || resultCode === 'txFeeBumpInnerSuccess') {
            const results = resultCode === 'txFeeBumpInnerSuccess'
              ? resultXdr.result().innerResultPair().result().result().results()
              : resultXdr.result().results();

            console.log('🔍 Number of operation results:', results?.length || 0);

            // Look for InvokeHostFunction results
            if (results && results.length > 0) {
              for (let i = 0; i < results.length; i++) {
                const opResult = results[i];
                const opCode = opResult.tr().switch().name;
                console.log(`🔍 Operation ${i} result type:`, opCode);

                if (opCode === 'invokeHostFunction') {
                  const invokeResult = opResult.tr().invokeHostFunctionResult();
                  const invokeCode = invokeResult.switch().name;
                  console.log(`  - InvokeHostFunction result code:`, invokeCode);

                  if (invokeCode === 'invokeHostFunctionSuccess') {
                    console.log('✅ Found successful InvokeHostFunction result, storing for resource extraction');
                    // Store the result for later resource extraction
                    (tx as any).__sorobanInvokeResult = invokeResult;
                  }
                }
              }
            }
          }
        } catch (resultErr) {
          console.warn('⚠️ Could not parse result_xdr:', resultErr);
        }
      }

      console.log('📦 XDR Summary:', {
        result_meta_xdr: !!resultMetaXdr,
        soroban_meta_xdr: !!sorobanMetaXdr,
        envelope_xdr: !!txData.envelope_xdr,
        result_xdr: !!txData.result_xdr,
        has_soroban_result: !!(tx as any).__sorobanInvokeResult
      });

      // Extract resource usage from envelope sorobanData (for historical transactions)
      console.log('🔍 Checking if we should extract from envelope:', {
        has_envelope_xdr: !!txData.envelope_xdr,
        has_result_meta_xdr: !!resultMetaXdr,
        has_soroban_meta_xdr: !!sorobanMetaXdr,
        should_extract: !!(txData.envelope_xdr && !resultMetaXdr && !sorobanMetaXdr)
      });

      if (txData.envelope_xdr && !resultMetaXdr && !sorobanMetaXdr) {
        console.log('🔍 Attempting to extract resources from envelope sorobanData...');
        try {
          const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(txData.envelope_xdr, 'base64');
          let txToCheck = null;

          console.log('🔍 Envelope type:', envelope.switch().name);

          // Handle fee-bumped transactions
          if (envelope.switch().name === 'envelopeTypeTxFeeBump' && envelope.feeBump()) {
            console.log('🔍 Processing fee-bumped envelope...');
            const innerTx = envelope.feeBump().tx().innerTx();
            console.log('🔍 Inner tx type:', innerTx.switch().name);
            if (innerTx.switch().name === 'envelopeTypeTx') {
              txToCheck = innerTx.v1().tx();
              console.log('✅ Got inner transaction to check');
            }
          } else if (envelope.switch().name === 'envelopeTypeTx' && envelope.v1()) {
            console.log('🔍 Processing standard envelope...');
            txToCheck = envelope.v1().tx();
            console.log('✅ Got transaction to check');
          }

          if (txToCheck) {
            console.log('🔍 Checking transaction ext...');
            console.log('🔍 txToCheck keys:', Object.keys(txToCheck));
            console.log('🔍 txToCheck._attributes:', txToCheck._attributes ? Object.keys(txToCheck._attributes) : 'none');

            const ext = txToCheck.ext ? txToCheck.ext() : null;
            console.log('🔍 Ext result:', ext);
            console.log('🔍 Ext switch:', ext ? (ext.switch ? ext.switch().name : 'no switch method') : 'null');

            if (ext) {
              // Check the internal structure (_switch: 1 means v1 extension)
              const extSwitch = (ext as any)._switch;
              const extArm = (ext as any)._arm;
              const extValue = (ext as any)._value;

              console.log('🔍 Extension internal structure:', {
                _switch: extSwitch,
                _arm: extArm,
                _value: !!extValue
              });

              // _switch: 1 means v1 extension (Soroban)
              if (extSwitch === 1 && extArm === 'sorobanData' && extValue) {
                console.log('✅ Found v1 extension with sorobanData!');

                try {
                  // The sorobanData is in _value
                  const sorobanData = extValue;
                  console.log('✅ Got sorobanData from extension._value');

                  // Store for later extraction
                  (tx as any).__envelopeSorobanData = sorobanData.toXDR('base64');
                  console.log('✅ Stored sorobanData XDR for later extraction');
                } catch (xdrErr) {
                  console.error('❌ Error converting sorobanData to XDR:', xdrErr);
                }
              } else {
                console.log('❌ Extension structure not recognized:', {
                  extSwitch,
                  extArm,
                  hasValue: !!extValue
                });
              }
            } else {
              console.log('❌ Transaction has no extension (ext is null)');
            }
          } else {
            console.log('❌ txToCheck is null - could not extract transaction');
          }
        } catch (envErr) {
          console.warn('⚠️ Could not extract sorobanData from envelope:', envErr);
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch transaction XDR data:', err);
    }

    console.log('✅ Transaction fetched successfully:', {
      id: tx.id,
      successful: tx.successful,
      operation_count: tx.operation_count,
      created_at: tx.created_at,
      has_result_meta_xdr: !!resultMetaXdr,
      has_envelope_xdr: !!(tx as any).envelope_xdr
    });

    console.log('🔍 Transaction successful status:', tx.successful);

    console.log('⏳ Fetching operations...');
    const operations = await server.operations()
      .forTransaction(hash)
      .limit(200)
      .call();

    // Normalize source_account fields immediately - Horizon sometimes returns arrays
    operations.records = operations.records.map(op => ({
      ...op,
      source_account: extractAccountAddress(op.source_account)
    }));

    console.log('✅ Operations fetched:', operations.records.length);
    
    // Log each operation in detail
    operations.records.forEach((op, index) => {
      console.log(`\n🔍 OPERATION ${index + 1} DETAILED ANALYSIS:`);
      console.log(`Type: ${op.type}`);
      console.log(`Full Operation Object:`, JSON.stringify(op, null, 2));
      
      if (op.type === 'invoke_host_function') {
        console.log(`\n🎯 INVOKE_HOST_FUNCTION OPERATION ${index + 1}:`);
        console.log('All available fields:', Object.keys(op));
        
        // Check every possible field that might contain contract info
        const possibleContractFields = [
          'contract_id', 'contractId', 'contract_address', 'contractAddress',
          'address', 'contract', 'target', 'destination', 'account_id',
          'host_function', 'hostFunction', 'function', 'invoke_contract',
          'parameters', 'args', 'auth', 'footprint', 'resource_fee'
        ];
        
        possibleContractFields.forEach(field => {
          if ((op as any)[field] !== undefined) {
            console.log(`Found field '${field}':`, (op as any)[field]);
          }
        });

        // Deep scan for any field containing 'C' followed by base32 characters
        const scanForContractIds = (obj: any, path = ''): void => {
          if (typeof obj === 'string' && /^C[A-Z2-7]{55,62}$/.test(obj)) {
            console.log(`🎯 POTENTIAL CONTRACT ID FOUND at ${path}:`, obj);
          }
          if (typeof obj === 'object' && obj !== null) {
            Object.entries(obj).forEach(([key, value]) => {
              scanForContractIds(value, path ? `${path}.${key}` : key);
            });
          }
        };
        
        console.log('🔍 Scanning entire operation for contract IDs...');
        scanForContractIds(op, 'operation');
      }
    });

    // Enhanced Soroban processing
    const sorobanOperations: SorobanOperation[] = [];
    const events: ContractEvent[] = [];

    // Try to get Soroban details for both testnet and mainnet
    let sorobanData = null;
    try {
      sorobanData = await querySorobanRpc(hash);
      console.log('🔮 Soroban RPC response:', sorobanData);

      // CRITICAL: Add resultMetaXdr from RPC to tx object for state changes extraction
      if (sorobanData && sorobanData.resultMetaXdr) {
        (tx as any).result_meta_xdr = sorobanData.resultMetaXdr;
        console.log('✅ Added result_meta_xdr from Soroban RPC to tx object');
      } else if (sorobanData && sorobanData.status === 'NOT_FOUND') {
        // Transaction not found in primary RPC, try alternative endpoints
        console.log('⚠️ Transaction not found in primary Soroban RPC, trying alternatives...');

        const alternativeRpcUrls = networkConfig.isTestnet
          ? ['https://soroban-testnet.stellar.org', 'https://rpc-futurenet.stellar.org']
          : ['https://mainnet.sorobanrpc.com', 'https://soroban-rpc.mainnet.stellarchain.io'];

        for (const rpcUrl of alternativeRpcUrls) {
          try {
            console.log(`🔄 Trying alternative RPC: ${rpcUrl}`);
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
              console.log(`✅ Found transaction in alternative RPC: ${rpcUrl}`);
              sorobanData = altData.result;
              (tx as any).result_meta_xdr = altData.result.resultMetaXdr;
              break;
            }
          } catch (altError) {
            console.warn(`❌ Alternative RPC ${rpcUrl} failed:`, altError);
          }
        }
      }
    } catch (sorobanError) {
      console.warn('⚠️ Soroban RPC query failed:', sorobanError);
    }

    // Process operations and extract contract IDs
    const contractIds: Map<number, string> = new Map();

    for (let i = 0; i < operations.records.length; i++) {
      const op = operations.records[i];
      console.log(`🔍 Processing operation ${i}:`, op);

      if (op.type === 'invoke_host_function') {
        console.log('🎯 Found invoke_host_function operation:', op);

        // Try multiple extraction methods - pass transaction envelope XDR directly
        const contractId = await extractContractId(op, sorobanData, i, tx.hash, tx.envelope_xdr);

        if (contractId && contractId !== 'Unknown') {
          contractIds.set(i, contractId);
          console.log(`✅ Contract ID found for operation ${i}:`, contractId);

          // Fetch effects for this operation
          let opEffects: any[] = [];
          let opEvents: any[] = [];
          try {
            const effectsResponse = await server.effects().forOperation(op.id).limit(200).call();
            opEffects = effectsResponse.records || [];
            console.log(`✅ Fetched ${opEffects.length} effects for operation ${i}`);

            // Convert effects to events format for display
            opEvents = opEffects
              .filter((effect: any) => effect.type === 'contract_credited' || effect.type === 'contract_debited' || effect.type.includes('contract'))
              .map((effect: any) => ({
                type: effect.type.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                contractId,
                topics: [effect.type, effect.asset_code || effect.asset || contractId],
                data: effect.amount || effect.balance || effect,
                ...effect
              }));
          } catch (effectsError) {
            console.warn(`⚠️ Could not fetch effects for operation ${i}:`, effectsError);
          }

          // Extract function details with enhanced data
          const functionDetails = extractFunctionDetails(op, sorobanData, i, tx);

          // Merge fetched events with extracted events
          const allEvents = [...(functionDetails.events || []), ...opEvents];

          // Create ledger effects descriptions from state changes (more reliable for Soroban)
          // If Horizon API effects are available, include those too
          const ledgerEffects: any[] = [];

          // Add state changes as effects (these are the most reliable for Soroban)
          if (functionDetails.stateChanges && functionDetails.stateChanges.length > 0) {
            functionDetails.stateChanges.forEach((change: any) => {
              // Pass through ALL fields from the state change
              ledgerEffects.push({
                ...change,
                description: change.description || `${change.type} ${change.storageType || ''} data`,
                // Ensure we have the data field accessible as both 'after' and 'value' for compatibility
                after: change.value || change.data || change.after,
                value: change.value || change.data || change.after
              });
            });
          }

          // Also add any Horizon API effects if available (for classical operations)
          if (opEffects.length > 0) {
            opEffects.forEach((effect: any) => {
              ledgerEffects.push({
                type: effect.type,
                description: formatEffectDescription(effect, contractId)
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

          console.log(`📦 Pushed soroban operation ${i}:`, {
            contractId,
            functionName: functionDetails.functionName,
            argsCount: functionDetails.args?.length,
            eventsCount: functionDetails.events?.length,
            stateChangesCount: functionDetails.stateChanges?.length,
            ttlExtensionsCount: functionDetails.ttlExtensions?.length,
            hasResourceUsage: !!functionDetails.resourceUsage
          });

          // Extract events for this operation
          if (functionDetails.events && functionDetails.events.length > 0) {
            console.log(`🔍 Processing ${functionDetails.events.length} events for operation ${i}`);

            const filteredEvents = functionDetails.events
              .filter((event: any) => {
                // Keep events with topics OR data
                if (!event.topics && !event.data) {
                  console.log('  Filtering out event with no topics or data');
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
                      console.log(`  Filtering out diagnostic event: ${eventType}`);
                      return false;
                    }

                    console.log(`  Keeping event with type: ${eventType}`);
                  } catch (e) {
                    console.log('  Could not determine event type, keeping event');
                  }
                }

                return true;
              })
              .map((event: any) => {
                const decodedTopics = (event.topics || []).map((t: any) => decodeScVal(t));
                const decodedData = event.data ? decodeScVal(event.data) : null;

                console.log(`🔍 Decoded event:`, {
                  type: event.type,
                  rawTopics: event.topics,
                  decodedTopics,
                  rawData: event.data,
                  decodedData
                });

                return {
                  contractId: event.contractId || contractId,
                  type: event.type,
                  topics: decodedTopics,
                  data: decodedData,
                  inSuccessfulContractCall: event.inSuccessfulContractCall
                };
              });

            console.log(`✅ Added ${filteredEvents.length} events to transaction events array`);
            events.push(...filteredEvents);
          }
        } else {
          console.warn(`❌ Could not extract contract ID for operation ${i}`);
          
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

    // Fetch transaction effects
    let effects: any[] = [];
    try {
      console.log('🔍 Fetching effects for transaction:', hash);
      const effectsResponse = await tx.effects({ limit: 200 });
      effects = effectsResponse.records || [];
      console.log(`✅ Fetched ${effects.length} effects`);
    } catch (effectsError: any) {
      console.warn('⚠️ Could not fetch effects:', effectsError.message);
    }

    const result: TransactionDetails = {
      hash: tx.hash,
      sourceAccount: extractAccountAddress(tx.source_account),
      fee: String((tx as any).fee_charged || (tx as any).fee_paid || '0'),
      feeCharged: String((tx as any).fee_charged || (tx as any).fee_paid || '0'),
      maxFee: String(tx.max_fee || '0'),
      operations: operations.records,
      status: tx.successful ? 'success' : 'failed',
      sorobanOperations,
      events,
      effects,
      ledgerTimestamp: new Date(tx.created_at).getTime()
    };

    // Add error information for failed transactions
    if (!tx.successful) {
      result.errorMessage = (tx as any).result_codes?.transaction;
      result.operationErrors = (tx as any).result_codes?.operations || [];
      result.resultCodes = (tx as any).result_codes;

      // Try to decode XDR for better error analysis
      try {
        result.debugInfo = await decodeTransactionXdr(tx);
        console.log('🔍 debugInfo set in fetchTransaction:', result.debugInfo);
        console.log('🔍 errorAnalysis in debugInfo:', result.debugInfo?.errorAnalysis);
      } catch (xdrError) {
        console.warn('XDR decoding failed:', xdrError);
      }
    }

    // Add simulation result for Soroban transactions
    if (sorobanOperations.length > 0) {
      try {
        console.log('🔬 Generating simulation result for Soroban transaction...');
        console.log('🔍 tx has __sorobanInvokeResult:', !!(tx as any).__sorobanInvokeResult);
        // Attach XDR metadata to tx object for use in simulation
        const txWithMeta = {
          ...tx,
          result_meta_xdr: resultMetaXdr,
          soroban_meta_xdr: sorobanMetaXdr
        };
        console.log('🔍 txWithMeta has __sorobanInvokeResult:', !!(txWithMeta as any).__sorobanInvokeResult);
        const simResult = await simulateTransactionWithDebugger(hash, txWithMeta);
        result.simulationResult = {
          ...simResult.simulation,
          enhancedDebugInfo: simResult.debugInfo
        };
        console.log('✅ Simulation result attached with enhanced debug info:', !!result.simulationResult);
        console.log('✅ Debug info logs count:', simResult.debugInfo?.logs?.length || 0);
      } catch (simError) {
        console.warn('⚠️ Failed to generate simulation result:', simError);
      }
    }

    console.log('🎉 Final transaction result:', result);
    return result;

  } catch (error: any) {
    console.error('❌ Error fetching transaction:', error);
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
        } catch {}
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
    : 'https://mainnet.sorobanrpc.com';

  console.log('🔮 Querying Soroban RPC:', rpcUrl);

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

  console.log('🔍 RPC Response keys:', data.result ? Object.keys(data.result) : 'null');
  console.log('🔍 RPC Response.resultMetaXdr type:', typeof data.result?.resultMetaXdr);

  // Log all field names to find the meta XDR
  if (data.result) {
    console.log('🔍 All RPC fields:');
    Object.keys(data.result).forEach(key => {
      const value = data.result[key];
      const type = typeof value;
      const preview = type === 'string' ? (value.length > 50 ? `${value.substring(0, 50)}...` : value) : type;
      console.log(`  ${key}: ${type} = ${preview}`);
    });

    // Check if status is SUCCESS and resultMetaXdr exists
    if (data.result.status === 'SUCCESS' && data.result.resultMetaXdr) {
      console.log('✅ Transaction successful with resultMetaXdr');
    } else if (data.result.status === 'NOT_FOUND') {
      console.log('⚠️ Transaction not found in Soroban RPC (may be too old or not yet indexed)');
    } else if (data.result.status === 'FAILED') {
      console.log('⚠️ Transaction failed');
    }
  }

  return data.result;
};

const extractContractId = async (operation: any, sorobanData: any, operationIndex: number, transactionHash?: string, envelopeXdr?: string): Promise<string> => {
  console.log(`\n🔍 EXTRACTING CONTRACT ID FOR OPERATION ${operationIndex}:`);
  console.log(`Network: ${networkConfig.isTestnet ? 'TESTNET' : 'MAINNET'}`);
  console.log(`Operation type: ${operation.type}`);
  console.log(`Transaction hash provided: ${transactionHash || 'NO'}`);
  console.log(`Envelope XDR provided: ${envelopeXdr ? 'YES' : 'NO'}`);
  
  if (operation.type !== 'invoke_host_function') {
    console.log('❌ Not an invoke_host_function operation, skipping');
    return `Non_Contract_Op${operationIndex + 1}`;
  }
  
  // Method 0: Direct field extraction with extensive logging
  console.log('🔍 METHOD 0: Direct field extraction');
  const directFields = [
    'contract_id', 'contractId', 'contract_address', 'contractAddress',
    'address', 'contract', 'target', 'destination', 'account_id'
  ];

  for (const field of directFields) {
    if (operation[field]) {
      console.log(`Found ${field}:`, operation[field]);
      if (typeof operation[field] === 'string' && /^C[A-Z2-7]{55,62}$/.test(operation[field])) {
        console.log(`✅ METHOD 0 SUCCESS - Valid contract ID found in ${field}:`, operation[field]);
        return operation[field];
      }
    }
  }

  // Method 0.5: Check parameters array for contract address
  console.log('🔍 METHOD 0.5: Parameters array extraction');
  if (operation.parameters && Array.isArray(operation.parameters)) {
    console.log(`Found parameters array with ${operation.parameters.length} items`);
    for (let i = 0; i < operation.parameters.length; i++) {
      const param = operation.parameters[i];
      console.log(`Parameter ${i}:`, param);

      if (param.type === 'Address' && param.value) {
        try {
          // The value is base64 XDR, decode it
          const scVal = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');
          console.log('Decoded ScVal type:', scVal.switch().name);

          if (scVal.switch() === StellarSdk.xdr.ScValType.scvAddress()) {
            const address = scVal.address();
            console.log('Found address in ScVal, type:', address.switch().name);

            if (address.switch() === StellarSdk.xdr.ScAddressType.scAddressTypeContract()) {
              const contractId = StellarSdk.StrKey.encodeContract(address.contractId());
              console.log(`✅ METHOD 0.5 SUCCESS - Contract ID from parameters[${i}]:`, contractId);
              return contractId;
            }
          }
        } catch (paramError) {
          console.log(`Failed to decode parameter ${i}:`, paramError.message);
        }
      }
    }
  }
  
  // Method 1: Host function field extraction
  console.log('🔍 METHOD 1: Host function field extraction');
  if (operation.type === 'invoke_host_function' && operation.host_function) {
    console.log('Found host_function field:', operation.host_function);
    try {
      const hostFunctionXdr = operation.host_function;
      
      const hostFunction = StellarSdk.xdr.HostFunction.fromXDR(hostFunctionXdr, 'base64');
      
      if (hostFunction.switch() === StellarSdk.xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
        const invokeContract = hostFunction.invokeContract();
        const contractAddress = invokeContract.contractAddress();
        
        if (contractAddress.switch() === StellarSdk.xdr.ScAddressType.scAddressTypeContract()) {
          const contractId = contractAddress.contractId();
          const contractIdStr = StellarSdk.StrKey.encodeContract(contractId);
          console.log('✅ Extracted contract ID from host_function:', contractIdStr);
          return contractIdStr;
        }
      }
    } catch (hostFunctionError) {
      console.log('❌ METHOD 1 FAILED:', hostFunctionError.message);
    }
  }
  
  // Method 2: Parameters extraction
  console.log('🔍 METHOD 2: Parameters extraction');
  if (operation.parameters) {
    console.log('Found parameters:', operation.parameters);
    try {
      const params = operation.parameters;
      if (params.contractAddress) {
        console.log('✅ METHOD 2 SUCCESS - Contract address in parameters:', params.contractAddress);
        return params.contractAddress;
      }
      if (params.contractId) {
        console.log('✅ METHOD 2 SUCCESS - Contract ID in parameters:', params.contractId);
        return params.contractId;
      }
    } catch (paramError) {
      console.log('❌ METHOD 2 FAILED:', paramError.message);
    }
  }

  // Method 3: Soroban RPC data
  console.log('🔍 METHOD 3: Soroban RPC data');
  if (sorobanData) {
    console.log('Found Soroban RPC data:', sorobanData);
    
    try {
      if (sorobanData.createContractResult?.contractId) {
        console.log('✅ METHOD 3 SUCCESS - Contract ID from creation result:', sorobanData.createContractResult.contractId);
        return sorobanData.createContractResult.contractId;
      }

      if (sorobanData.results && sorobanData.results[operationIndex]) {
        const opResult = sorobanData.results[operationIndex];
        console.log(`Operation ${operationIndex} result:`, opResult);
        
        if (opResult.contractId) {
          console.log('✅ METHOD 3 SUCCESS - Contract ID from operation result:', opResult.contractId);
          return opResult.contractId;
        }
        if (opResult.contractAddress && opResult.contractAddress.startsWith('C')) {
          console.log('✅ METHOD 3 SUCCESS - Contract address from operation result:', opResult.contractAddress);
          return opResult.contractAddress;
        }
      }
    } catch (rpcError) {
      console.log('❌ METHOD 3 FAILED:', rpcError.message);
    }
  }

  // Method 4: Transaction envelope XDR extraction
  console.log('🔍 METHOD 4: Transaction envelope XDR extraction');

  try {
    if (!envelopeXdr) {
      console.log('❌ No envelope XDR provided');
      throw new Error('No envelope XDR available');
    }

    console.log('Decoding transaction envelope XDR...');
    const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');

    let transaction;
    if (envelope.switch() === StellarSdk.xdr.EnvelopeType.envelopeTypeTx()) {
      transaction = envelope.v1().tx();
      console.log('Using v1 transaction');
    } else if (envelope.switch() === StellarSdk.xdr.EnvelopeType.envelopeTypeTxV0()) {
      transaction = envelope.v0().tx();
      console.log('Using v0 transaction');
    } else {
      console.log('❌ Unsupported envelope type:', envelope.switch().name);
      throw new Error('Unsupported envelope type');
    }

    const operations = transaction.operations();
    console.log(`Found ${operations.length} operations in envelope`);

    if (operations && operations[operationIndex]) {
      const op = operations[operationIndex];
      console.log(`Processing operation ${operationIndex} from envelope`);

      if (op.body().switch() === StellarSdk.xdr.OperationType.invokeHostFunction()) {
        console.log('✅ Found invoke_host_function operation in envelope');
        const invokeHostFunctionOp = op.body().invokeHostFunctionOp();
        const hostFunc = invokeHostFunctionOp.hostFunction();

        console.log('Host function type:', hostFunc.switch().name);

        if (hostFunc.switch() === StellarSdk.xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
          console.log('✅ Found invoke contract in host function');
          const invokeContract = hostFunc.invokeContract();
          const contractAddress = invokeContract.contractAddress();

          console.log('Contract address type:', contractAddress.switch().name);

          if (contractAddress.switch() === StellarSdk.xdr.ScAddressType.scAddressTypeContract()) {
            const contractId = contractAddress.contractId();
            const contractIdStr = StellarSdk.StrKey.encodeContract(contractId);
            console.log('✅✅✅ METHOD 4 SUCCESS - Contract ID from transaction envelope:', contractIdStr);
            return contractIdStr;
          } else {
            console.log('⚠️ Contract address is not a contract type, might be an account address');
          }
        } else {
          console.log('⚠️ Host function is not invokeContract type:', hostFunc.switch().name);
        }
      } else {
        console.log('❌ Operation is not invoke_host_function type');
      }
    } else {
      console.log(`❌ Operation index ${operationIndex} not found in envelope (total: ${operations.length})`);
    }
  } catch (xdrError) {
    console.log('❌ METHOD 4 FAILED:', xdrError.message);
  }

  console.log('❌ ALL METHODS FAILED - Could not extract contract ID from operation');
  console.log('📊 SUMMARY: All extraction methods failed for this operation');
  
  if (!networkConfig.isTestnet) {
    console.log('MAINNET: Contract ID extraction failed');
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
      return `${effect.type.replace(/_/g, ' ')}: ${JSON.stringify(effect).substring(0, 50)}...`;
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
        console.log(`🔍 Found contract ID in field '${field}':`, obj[field]);
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

const extractFunctionDetails = (operation: any, sorobanData: any, operationIndex: number, tx?: any) => {
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
        details.events = opResult.events || [];
      }

      if (sorobanData.auth && sorobanData.auth[operationIndex]) {
        details.auth = sorobanData.auth[operationIndex];
      }

      // Extract diagnostic events from XDR if available
      if (sorobanData.diagnosticEventsXdr) {
        console.log('🔍 Found diagnosticEventsXdr in Soroban RPC response');
        console.log('🔍 diagnosticEventsXdr type:', typeof sorobanData.diagnosticEventsXdr);
        console.log('🔍 diagnosticEventsXdr value:', sorobanData.diagnosticEventsXdr);

        try {
          // diagnosticEventsXdr is an array of base64 XDR strings, one per event
          const eventsXdrArray = Array.isArray(sorobanData.diagnosticEventsXdr)
            ? sorobanData.diagnosticEventsXdr
            : [sorobanData.diagnosticEventsXdr];

          console.log(`🔍 Processing ${eventsXdrArray.length} diagnostic event XDR strings`);

          eventsXdrArray.forEach((eventXdr: string, idx: number) => {
            try {
              console.log(`🔍 Parsing diagnostic event ${idx + 1}/${eventsXdrArray.length}`);
              const diagnosticEvent = StellarSdk.xdr.DiagnosticEvent.fromXDR(eventXdr, 'base64');
              console.log(`✅ Parsed diagnostic event ${idx + 1}:`, diagnosticEvent);

              const event = diagnosticEvent.event();
              const contractIdHash = event.contractId ? event.contractId() : null;
              const contractId = contractIdHash ?
                StellarSdk.StrKey.encodeContract(contractIdHash) : 'System';

              const topics = event.body().v0().topics().map((topic: any) => {
                try {
                  // Use decodeScVal instead of scValToNative to properly handle bytes
                  return decodeScVal(topic);
                } catch {
                  // Fallback to string representation
                  try {
                    return JSON.stringify(topic);
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

              console.log(`  ✅ Event ${idx + 1} extracted:`, {
                contractId,
                topicsCount: topics.length,
                inSuccessfulContractCall: diagnosticEvent.inSuccessfulContractCall()
              });
            } catch (err) {
              console.warn(`❌ Failed to parse diagnostic event ${idx}:`, err);
            }
          });
          console.log(`✅ Extracted ${details.events.length} events from diagnosticEventsXdr`);
        } catch (xdrError) {
          console.warn('❌ Failed to parse diagnosticEventsXdr:', xdrError);
        }
      }
    } catch (error) {
      console.warn('Error extracting function details from RPC:', error);
    }
  }

  // Try to extract from operation.function field (Horizon provides this)
  if (operation.function) {
    details.functionName = operation.function;
    console.log('✅ Extracted function name from operation.function:', operation.function);
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
            console.warn('Failed to decode arg, using toString:', e);
            return arg.toString();
          }
        });

        console.log('✅ Extracted function name from XDR:', functionName);
        console.log('✅ Decoded arguments:', details.args);
      }
    }
  } catch (error) {
    console.warn('Error extracting function details from XDR:', error);
  }

  // Parse parameters if available (only if XDR extraction didn't work)
  if (operation.parameters && Array.isArray(operation.parameters) && (!details.args || details.args.length === 0)) {
    try {
      details.args = operation.parameters.map((param: any) => {
        try {
          // Decode base64 XDR value to ScVal
          const scVal = StellarSdk.xdr.ScVal.fromXDR(param.value, 'base64');
          const decoded = decodeScVal(scVal);
          console.log(`  Parameter ${param.type}:`, decoded);
          return decoded;
        } catch (e) {
          console.warn(`  Could not decode parameter ${param.type}:`, e);
          return {
            type: param.type,
            value: param.value
          };
        }
      });
      console.log(`✅ Extracted and decoded ${details.args.length} parameters from operation`);
    } catch (error) {
      console.warn('Error extracting parameters:', error);
    }
  }

  // Extract diagnostic events and state changes from transaction meta
  console.log('🔍 Checking for tx and result_meta_xdr...', {
    hasTx: !!tx,
    hasResultMetaXdr: !!(tx && tx.result_meta_xdr),
    txKeys: tx ? Object.keys(tx).slice(0, 10) : []
  });

  if (tx && tx.result_meta_xdr) {
    try {
      console.log('🔍 Extracting meta details for operation', operationIndex);
      console.log('🔍 tx.result_meta_xdr length:', tx.result_meta_xdr.length);
      const meta = StellarSdk.xdr.TransactionMeta.fromXDR(tx.result_meta_xdr, 'base64');
      console.log('✅ Parsed TransactionMeta from XDR');
      const metaSwitch = meta.switch();
      console.log('🔍 Meta type:', metaSwitch && typeof metaSwitch === 'object' && (metaSwitch as any).name ? (metaSwitch as any).name : metaSwitch);
      const metaDetails = extractMetaDetails(meta, operationIndex);
      console.log('📊 metaDetails extracted:', metaDetails);
      console.log('📊 metaDetails.stateChanges count:', metaDetails.stateChanges?.length);
      console.log('📊 metaDetails.stateChanges:', metaDetails.stateChanges);
      console.log('📊 metaDetails.ttlExtensions:', metaDetails.ttlExtensions);
      details.events = [...details.events, ...metaDetails.events];
      details.stateChanges = metaDetails.stateChanges;
      console.log('📊 After assignment, details.stateChanges count:', details.stateChanges?.length);
      details.ttlExtensions = metaDetails.ttlExtensions;
      details.resourceUsage = metaDetails.resourceUsage;
      details.crossContractCalls = metaDetails.crossContractCalls;
      console.log('✅ Meta details extracted:', {
        events: details.events.length,
        stateChanges: details.stateChanges.length,
        ttlExtensions: details.ttlExtensions.length,
        resourceUsage: details.resourceUsage,
        crossContractCalls: details.crossContractCalls?.length || 0
      });
    } catch (error) {
      console.warn('❌ Error extracting meta details:', error);
      console.error('Full error:', error);
    }
  } else {
    console.warn('⚠️ No tx or result_meta_xdr available for meta extraction');
    console.log('🔍 tx exists:', !!tx);
    console.log('🔍 tx.result_meta_xdr exists:', !!(tx && tx.result_meta_xdr));
  }

  return details;
};

// Helper to extract data from a single ledger entry
const extractSingleEntryData = (ledgerEntry: any) => {
  if (!ledgerEntry) return null;

  const entryData = ledgerEntry.data();
  const entryType = entryData.switch().name;

  // Handle contract data entries
  if (entryType === 'contractData') {
    const contractData = entryData.contractData();
    const contractId = StellarSdk.StrKey.encodeContract(contractData.contract().contractId());
    const durability = contractData.durability().name;
    const storageType = durability === 'temporary' ? 'temporary' : durability === 'persistent' ? 'persistent' : 'instance';

    // Decode the key - check the RAW type first for special keys
    const keyScVal = contractData.key();
    let decodedKey: any;
    let isLedgerKeyContractInstance = false;

    try {
      // Check if this is a LedgerKeyContractInstance by inspecting the XDR type
      const keyType = keyScVal.switch?.()?.name || keyScVal._switch?.name;
      console.log(`  🔑 Key type: ${keyType}`);

      if (keyType === 'scvLedgerKeyContractInstance') {
        decodedKey = 'ContractInstance';
        isLedgerKeyContractInstance = true;
        console.log('  ✅ Detected LedgerKeyContractInstance');
      } else {
        decodedKey = decodeScVal(keyScVal);
        console.log(`  🔑 Decoded key:`, decodedKey);
      }
    } catch (e) {
      console.warn('  ⚠️ Error decoding key:', e);
      decodedKey = decodeScVal(keyScVal);
    }

    // Decode the value if present
    let decodedVal = null;
    try {
      const valScVal = contractData.val();
      decodedVal = decodeScVal(valScVal);
    } catch (e) {
      // Value might not be present or decodable
    }

    // Helper to format a key value (handles serialized buffers)
    const formatKeyValue = (k: any): string => {
      if (k === null || k === undefined) return 'undefined';
      if (typeof k === 'string') return `"${k}"`;
      if (typeof k === 'number' || typeof k === 'boolean') return String(k);

      // Check for serialized buffer
      if (typeof k === 'object' && isSerializedBuffer(k)) {
        const bytes = serializedBufferToUint8Array(k);
        if (bytes.length === 32) {
          try {
            const addr = StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
            return `"${addr.substring(0, 4)}…${addr.substring(addr.length - 4)}"`;
          } catch {
            try {
              const addr = StellarSdk.StrKey.encodeContract(bytes);
              return `"${addr.substring(0, 6)}…${addr.substring(addr.length - 6)}"`;
            } catch {
              const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
              return `"0x${hex.slice(0, 8)}…${hex.slice(-8)}"`;
            }
          }
        }
        const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
        if (hex.length > 20) {
          return `"0x${hex.slice(0, 8)}…${hex.slice(-8)}"`;
        }
        return `"0x${hex}"`;
      }

      if (typeof k === 'object') return JSON.stringify(k);
      return String(k);
    };

    // Format key display
    let keyDisplay = '';
    if (decodedKey === null || decodedKey === undefined) {
      // If key couldn't be decoded, check if this is a special entry type
      keyDisplay = '<Unknown Key>';
    } else if (decodedKey === 'ContractInstance' || decodedKey === 'LedgerKeyContractInstance') {
      keyDisplay = '<LedgerKeyContractInstance>';
    } else if (Array.isArray(decodedKey)) {
      keyDisplay = `[${decodedKey.map(formatKeyValue).join(', ')}]`;
    } else if (typeof decodedKey === 'object' && decodedKey !== null) {
      // Check if it's a serialized buffer
      if (isSerializedBuffer(decodedKey)) {
        keyDisplay = formatKeyValue(decodedKey);
      } else {
        keyDisplay = JSON.stringify(decodedKey);
      }
    } else {
      // String, number, or other primitive
      keyDisplay = `["${String(decodedKey)}"]`;
    }

    return {
      type: 'contractData',
      contractId,
      storageType,
      key: decodedKey,
      data: decodedVal,
      keyDisplay,
      before: undefined
    };
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
      hash: hash.toString('hex'),
      data: { hash: hash.toString('hex') },
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
    if (changeType === 'ledgerEntryState') {
      ledgerEntry = change.state();
    } else if (changeType === 'ledgerEntryCreated') {
      ledgerEntry = change.created();
    } else if (changeType === 'ledgerEntryUpdated') {
      // For updated entries, capture BOTH before and after values
      const updated = change.updated();

      // Get the previous state (before)
      if (updated && updated.state) {
        try {
          beforeEntry = updated.state();
        } catch (e) {
          // Previous state might not be available
        }
      }

      // Get the new state (after)
      if (updated && updated.newValue) {
        ledgerEntry = updated.newValue();
      } else {
        // Fallback: some SDK versions might return the entry directly
        ledgerEntry = updated;
      }
    } else if (changeType === 'ledgerEntryRemoved') {
      ledgerEntry = change.removed();
    } else {
      console.warn(`Unknown change type: ${changeType}`);
    }

    if (!ledgerEntry) return null;

    const entryInfo = extractSingleEntryData(ledgerEntry);
    if (!entryInfo) return null;

    // For updates, also extract the before value
    if (beforeEntry && changeType === 'ledgerEntryUpdated') {
      const beforeInfo = extractSingleEntryData(beforeEntry);
      if (beforeInfo && beforeInfo.data !== undefined) {
        entryInfo.before = beforeInfo.data;
      }
    }

    return entryInfo;
  } catch (err) {
    console.warn('Error extracting ledger entry data:', err);
    return null;
  }
};

const extractMetaDetails = (meta: any, operationIndex: number) => {
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
    console.log('🔍 Meta object type:', typeof meta);
    console.log('🔍 Meta object:', meta);
    const metaSwitch = meta.switch();
    console.log('🔍 Meta switch object:', metaSwitch);
    console.log('🔍 Meta switch type:', typeof metaSwitch);

    // Handle different switch return types
    let switchValue = metaSwitch;
    if (typeof metaSwitch === 'object' && metaSwitch !== null) {
      console.log('🔍 Meta switch properties:', Object.keys(metaSwitch));
      switchValue = metaSwitch.value !== undefined ? metaSwitch.value : metaSwitch;
    }

    // The switch might return a number directly
    const metaVersion = typeof switchValue === 'number' ? switchValue : (metaSwitch as any).value;
    console.log('📊 Transaction meta version:', metaVersion);

    // Extract from v3 or v4 meta (Soroban transactions)
    // v4 is the newer format but has same structure as v3
    const isV3 = metaVersion === 3;
    const isV4 = metaVersion === 4;

    if (isV3 || isV4) {
      console.log(`✅ Found Soroban transaction (v${metaVersion} meta)`);
      const v3 = isV4 ? meta.v4() : meta.v3();

      // FIRST: Extract ledger entry changes from v3.operations() - this is where the actual state changes are!
      console.log('🔍 Extracting ledger entry changes from v3.operations()...');
      try {
        if (v3.operations && v3.operations()) {
          const operations = v3.operations();
          console.log(`  Found ${operations.length} operations in v3`);

          if (operations[operationIndex]) {
            const operation = operations[operationIndex];
            console.log(`  Processing operation ${operationIndex}`);
            console.log(`  Operation type:`, typeof operation);

            if (operation.changes && operation.changes()) {
              const changes = operation.changes();
              console.log(`  ✅ Found ${changes.length} ledger entry changes for operation ${operationIndex}`);

              changes.forEach((change: any, idx: number) => {
                try {
                  const changeType = change.switch().name;
                  console.log(`    Change ${idx}: ${changeType}`);
                  const ledgerEntry = extractLedgerEntryData(change, changeType);

                  if (ledgerEntry) {
                    const isRemoval = changeType === 'ledgerEntryRemoved';
                    const isCreated = changeType === 'ledgerEntryCreated';
                    const isUpdated = changeType === 'ledgerEntryUpdated';

                    const actionType = isRemoval ? 'removed' : isCreated ? 'created' : 'updated';

                    const stateChange: any = {
                      type: actionType,
                      changeType: changeType,
                      ledgerEntryType: ledgerEntry.type,
                      contractId: ledgerEntry.contractId,
                      storageType: ledgerEntry.storageType,
                      key: ledgerEntry.key,
                      keyDisplay: ledgerEntry.keyDisplay,
                      description: `${actionType} ${ledgerEntry.storageType || ledgerEntry.type} data ${ledgerEntry.keyDisplay || ''}`
                    };

                    // Add before/after values
                    if (isUpdated) {
                      stateChange.before = ledgerEntry.before;
                      stateChange.after = ledgerEntry.data;
                    } else if (isCreated) {
                      stateChange.after = ledgerEntry.data;
                    } else if (isRemoval) {
                      stateChange.before = ledgerEntry.data;
                    } else {
                      stateChange.value = ledgerEntry.data;
                    }

                    details.stateChanges.push(stateChange);

                    console.log(`    ✅ Added state change: ${actionType} ${ledgerEntry.storageType} ${ledgerEntry.keyDisplay}`);
                    console.log(`    📊 Total state changes now: ${details.stateChanges.length}`);
                  }
                } catch (err) {
                  console.warn(`    ❌ Error extracting change ${idx}:`, err);
                }
              });
            } else {
              console.log(`  ⚠️ No changes() method on operation ${operationIndex}`);
            }
          } else {
            console.log(`  ⚠️ Operation ${operationIndex} not found in operations array`);
          }
        } else {
          console.log('  ⚠️ No operations() method on v3');
        }
      } catch (err) {
        console.error('  ❌ Error accessing v3.operations():', err);
      }

      console.log(`📊 Extracted ${details.stateChanges.length} state changes from v3.operations()`);
      if (details.stateChanges.length > 0) {
        console.log('📋 State changes summary:', details.stateChanges.map(sc => ({
          type: sc.type,
          storageType: sc.storageType,
          keyDisplay: sc.keyDisplay
        })));
      }

      // Extract Soroban metadata with resource usage
      if (v3.sorobanMeta && v3.sorobanMeta()) {
        const sorobanMeta = v3.sorobanMeta();

        // Extract resource usage
        try {
          console.log('💰 Extracting resource usage...');
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
              console.log('  Non-refundable fee:', resources.nonRefundableFee);
            }
            if (v1Ext.totalRefundableResourceFeeCharged) {
              resources.refundableFee = Number(v1Ext.totalRefundableResourceFeeCharged());
              console.log('  Refundable fee:', resources.refundableFee);
            }

            details.resourceUsage = resources;
            console.log('✅ Resource usage extracted:', resources);
          } else {
            console.warn('  No v1 extension found in soroban meta');
          }
        } catch (err) {
          console.warn('Error extracting resource usage:', err);
        }

        // Extract storage data from ledger entry changes
        console.log('💾 Extracting storage data from soroban meta...');
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
                  console.log('  Host function type:', details.hostFunctionType);
                }
              }
            }
          }
        } catch (err) {
          console.warn('  Could not extract host function type:', err);
        }

        // Parse storage from soroban return value and events
        if (sorobanMeta.returnValue && sorobanMeta.returnValue()) {
          try {
            const returnVal = sorobanMeta.returnValue();
            const decodedReturn = decodeScVal(returnVal);
            console.log('  Return value (decoded):', decodedReturn);

            // If return value is a map/object, treat as storage
            if (typeof decodedReturn === 'object' && !Array.isArray(decodedReturn)) {
              details.instanceStorage = { ...details.instanceStorage, ...decodedReturn };
            }
          } catch (err) {
            console.warn('  Could not decode return value:', err);
          }
        }


        // Extract TTL extensions (always check and add if present)
        try {
          console.log('⏱️ Checking for TTL extensions...');
          if (sorobanMeta.ext && sorobanMeta.ext().v1) {
            const ext = sorobanMeta.ext().v1();
            if (ext.ext && ext.ext().v1) {
              details.ttlExtensions.push({
                description: 'Time-to-live extended for contract state entries'
              });
              console.log('✅ TTL extension added');
            }
          }
        } catch (err) {
          console.warn('Error extracting TTL:', err);
        }
      } else {
        console.warn('  No sorobanMeta found in v3');
      }

      // Extract diagnostic events with detailed data
      console.log('🔍 Checking for diagnostic events...');
      console.log('🔍 v3 object:', v3);
      console.log('🔍 v3.diagnosticEvents exists:', typeof v3.diagnosticEvents);
      console.log('🔍 v3.diagnosticEvents():', v3.diagnosticEvents ? v3.diagnosticEvents() : 'undefined');

      if (v3.diagnosticEvents && v3.diagnosticEvents()) {
        const events = v3.diagnosticEvents();
        console.log(`📡 Found ${events.length} diagnostic events`);
        console.log(`📡 Events array:`, events);
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
                  console.warn('Could not decode topic:', e);
                }
              });
            }

            // Determine contractId
            // CRITICAL: For fn_call events, event.contractId() returns the EMITTING contract,
            // but we need the CALLED contract which is in topics[1]
            let contractId: string;

            if (topics.length > 1 && topics[0] === 'fn_call' && typeof topics[1] === 'string') {
              // For fn_call events, ALWAYS use topics[1] (the contract being called)
              contractId = topics[1];
            } else if (event.contractId) {
              // For other events, use event.contractId()
              contractId = StellarSdk.StrKey.encodeContract(event.contractId());
            } else {
              contractId = 'System';
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
              console.warn('Could not extract event data:', e);
            }

            // Check first topic to identify event type
            const firstTopic = topics.length > 0 ? topics[0] : null;
            const eventType = typeof firstTopic === 'string'
              ? firstTopic.toLowerCase()
              : String(firstTopic).toLowerCase();

            // Don't filter fn_call and fn_return - we need them for displaying contract calls!
            // Only skip generic diagnostic_event if needed
            if (eventType === 'diagnostic_event') {
              console.log(`  Filtering out diagnostic event: ${eventType}`);
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
            console.log(`  Event ${eventIdx + 1}:`, eventInfo);

            // Detect cross-contract calls from diagnostic events
            // Diagnostic events show when a contract calls another contract
            // We can detect this by looking for events from different contracts in sequence
            if (contractId !== 'System' && details.events.length > 1) {
              const prevEvent = details.events[details.events.length - 2];
              if (prevEvent.contractId !== contractId && prevEvent.contractId !== 'System') {
                // Different contract emitted this event - likely a cross-contract call
                const crossCall = {
                  fromContract: prevEvent.contractId,
                  toContract: contractId,
                  functionName: topics.length > 0 ? topics[0] : undefined,
                  success: eventInfo.inSuccessfulContractCall
                };
                details.crossContractCalls.push(crossCall);
                console.log(`  🔗 Detected cross-contract call:`, crossCall);
              }
            }
          } catch (err) {
            console.warn('Error decoding event:', err);
          }
        });
        console.log(`✅ Extracted ${details.events.length} events`);
        console.log(`📊 All extracted events:`, details.events);
        if (details.crossContractCalls.length > 0) {
          console.log(`🔗 Detected ${details.crossContractCalls.length} cross-contract calls`);
        }
      } else {
        console.warn('⚠️ No diagnostic events found or v3.diagnosticEvents() returned empty');
        console.log('🔍 v3 object keys:', Object.keys(v3));
        console.log('🔍 v3._attributes:', v3._attributes);
      }
    } else {
      console.warn('⚠️ Not a Soroban transaction (v3 meta not found)');
    }
  } catch (error) {
    console.warn('Error extracting meta details:', error);
  }

  console.log('📤 Returning meta details:', details);
  console.log('📊 State changes count:', details.stateChanges.length);
  console.log('📊 Events count:', details.events.length);
  if (details.stateChanges.length > 0) {
    console.log('✅ First state change:', details.stateChanges[0]);
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
        console.log('🔍 Decoding envelope_xdr...');
        const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, 'base64');
        debugInfo.decodedEnvelope = envelope;

        // Check if this is a fee bump transaction
        const envelopeType = envelope.switch()?.name || String(envelope.switch());
        console.log('📨 Envelope type:', envelopeType);
        debugInfo.envelopeType = envelopeType;

        if (envelopeType === 'envelopeTypeTxFeeBump' || envelopeType === 'envelopeTypeFeeBump') {
          isFeeBump = true;
          console.log('💰 Fee bump transaction detected');
          try {
            const feeBumpTx = envelope.feeBump();
            innerEnvelope = feeBumpTx.tx().innerTx();
            debugInfo.feeBumpInfo = {
              feeSource: feeBumpTx.tx().feeSource().toString(),
              fee: feeBumpTx.tx().fee().toString()
            };
            console.log('✅ Fee bump info extracted:', debugInfo.feeBumpInfo);
          } catch (e) {
            console.warn('⚠️ Could not extract fee bump details:', e);
          }
        }
      } catch (error) {
        console.warn('❌ Failed to decode envelope XDR:', error);
      }
    }

    // Decode result XDR for error analysis
    if (tx.result_xdr) {
      try {
        console.log('🔍 Decoding result_xdr for transaction...');
        const transactionResult = StellarSdk.xdr.TransactionResult.fromXDR(tx.result_xdr, 'base64');
        debugInfo.decodedResult = transactionResult;

        const errorAnalysis = analyzeTransactionErrors(transactionResult, isFeeBump);
        console.log('🔍 Error analysis result:', errorAnalysis);
        if (errorAnalysis && (errorAnalysis.outerError || errorAnalysis.innerError || errorAnalysis.operationErrors?.length > 0)) {
          debugInfo.errorAnalysis = errorAnalysis;
          console.log('✅ Error analysis attached to debugInfo');
        } else {
          console.log('ℹ️ No errors found in transaction');
        }
      } catch (error) {
        console.warn('❌ Failed to decode result XDR:', error);
      }
    }

    return debugInfo;
  } catch (error) {
    console.warn('Failed to decode transaction XDR:', error);
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

    console.log('🔍 Transaction result code:', resultName);

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
        console.log('💰 Fee bump succeeded, but inner transaction failed');

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
            console.log('🔍 Inner transaction error:', innerResultName);
          }
        } catch (e) {
          console.warn('⚠️ Could not extract inner result:', e);
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
        console.log('🔍 Transaction-level error detected:', resultName);
      }
    }

    // Check operation-level errors - only if results exist
    // For fee bump transactions, we need to get results from the inner transaction
    let opResults = null;
    try {
      if (isFeeBump && resultName === 'txFeeBumpInnerFailed') {
        // Extract operation results from inner transaction
        console.log('🔍 Attempting to extract inner transaction results...');
        try {
          const result = transactionResult.result();
          console.log('🔍 Transaction result object:', result);
          console.log('🔍 Result keys:', Object.keys(result));
          console.log('🔍 Result methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(result)));

          const innerPair = result.innerResultPair();
          console.log('🔍 Inner result pair:', innerPair);

          if (innerPair) {
            const innerResult = innerPair.result();
            console.log('🔍 Inner result:', innerResult);

            if (innerResult) {
              const innerResultObj = innerResult.result();
              console.log('🔍 Inner result object:', innerResultObj);

              opResults = innerResultObj.results();
              console.log('✅ Extracted operation results from inner transaction:', opResults);
            }
          }
        } catch (e) {
          console.warn('⚠️ Could not extract inner operation results:', e);
          console.warn('⚠️ Error details:', e instanceof Error ? e.message : String(e));
        }
      } else {
        // Regular transaction or successful fee bump
        opResults = transactionResult.result().results();
      }
      if (opResults && opResults.length > 0) {
        opResults.forEach((opResult: any, index: number) => {
          try {
            console.log(`🔍 Raw opResult for operation ${index}:`, opResult);
            console.log(`🔍 opResult keys:`, Object.keys(opResult));
            console.log(`🔍 opResult._switch:`, opResult._switch);
            console.log(`🔍 opResult._arm:`, opResult._arm);

            // Try to get the operation result code
            let codeType: string | undefined;

            // Method 1: Try .switch() method
            if (typeof opResult.switch === 'function') {
              const sw = opResult.switch();
              codeType = (sw as any).name || String(sw);
              console.log(`✅ Method 1 (switch()): ${codeType}`);
            }
            // Method 2: Try ._switch.name
            else if (opResult._switch?.name) {
              codeType = opResult._switch.name;
              console.log(`✅ Method 2 (_switch.name): ${codeType}`);
            }
            // Method 3: Try ._arm
            else if (opResult._arm) {
              codeType = opResult._arm;
              console.log(`✅ Method 3 (_arm): ${codeType}`);
            }

            if (!codeType) {
              console.warn(`⚠️ Could not determine code type for operation ${index}`);
              codeType = 'unknown';
            }

            console.log(`Operation ${index} code type: ${codeType}`);

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
            console.log(`🔍 tr object:`, tr);
            console.log(`🔍 tr keys:`, Object.keys(tr));

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
              console.warn(`⚠️ Unknown operation type: ${operationType}`);
              return;
            }

            console.log(`✅ Operation ${index} type: ${operationType}`);
            console.log(`🔍 Operation result:`, operationResult);

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

            console.log(`✅ Operation ${index} result code: ${resultCode}`);

            // Check if it's a success code (ends with "Success")
            if (resultCode && !resultCode.endsWith('Success')) {
              console.log(`❌ Operation ${index} failed with: ${resultCode}`);
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
              console.log(`✅ Operation ${index} succeeded`);
            }
          } catch (e) {
            console.warn(`Could not parse inner result for operation ${index}:`, e);
          }
        }
          } catch (opError) {
            console.warn(`Error processing operation ${index}:`, opError);
          }
        });
      }
    } catch (resultsError) {
      console.log('🔍 No operation results available (transaction-level failure)');
    }

    return analysis;
  } catch (error) {
    console.warn('Error analyzing transaction errors:', error);
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

export const createOperationNodes = (transaction: TransactionDetails): Node[] => {
  console.log(`🎨 Creating nodes for ${transaction.operations.length} operations`);

  // Filter out core_metrics operations - these are internal Horizon operations, not real transaction operations
  const validOperations = transaction.operations.filter(op =>
    op.type !== 'core_metrics' && op.type !== 'coreMetrics' && op.type !== 'core-metrics'
  );

  console.log(`📊 Filtered to ${validOperations.length} valid operations (removed ${transaction.operations.length - validOperations.length} internal operations)`);

  const allNodes: Node[] = [];
  let globalNodeIndex = 0;

  validOperations.forEach((op, index) => {
    const sorobanOp = transaction.sorobanOperations?.find((sop, idx) => idx === index);

    console.log(`🔍 Creating node ${index + 1}/${validOperations.length}:`, {
      type: op.type,
      id: op.id,
      hasSorobanOp: !!sorobanOp,
      sorobanOpIndex: transaction.sorobanOperations?.findIndex((sop, idx) => idx === index),
      totalSorobanOps: transaction.sorobanOperations?.length,
      resourceUsage: sorobanOp?.resourceUsage,
      stateChanges: sorobanOp?.stateChanges?.length,
      events: sorobanOp?.events?.length
    });

    if (!sorobanOp && transaction.sorobanOperations && transaction.sorobanOperations.length > 0) {
      console.warn(`⚠️ No sorobanOp found for operation ${index}, but ${transaction.sorobanOperations.length} soroban operations exist`);
      console.log(`Available soroban operations:`, transaction.sorobanOperations);
    }

    const operationNode: Node = {
      id: `op-${index}`,
      type: 'operation',
      position: { x: globalNodeIndex * 450, y: 50 },
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
        ...extractOperationSpecificData(op)
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
      console.log(`📢 Creating ${operationEvents.length} event nodes for operation ${index}`);
      console.log(`📊 SorobanOp data:`, {
        stateChangesCount: sorobanOp?.stateChanges?.length || 0,
        ttlExtensionsCount: sorobanOp?.ttlExtensions?.length || 0,
        stateChanges: sorobanOp?.stateChanges,
        ttlExtensions: sorobanOp?.ttlExtensions
      });

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
          console.log(`🔍 Creating event node ${eventIdx}, sorobanOp.stateChanges:`, sorobanOp.stateChanges);
          console.log(`🔍 stateChanges array length:`, sorobanOp.stateChanges?.length);

          const eventNode: Node = {
            id: `event-${index}-${eventIdx}`,
            type: 'event',
            position: { x: globalNodeIndex * 450, y: 50 },
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
          console.warn(`Skipping invalid event at index ${eventIdx}:`, event);
        }
      });
    }

    if (sorobanOp?.stateChanges && sorobanOp.stateChanges.length > 0) {
      console.log(`📝 Creating ${sorobanOp.stateChanges.length} state change nodes for operation ${index}`);

      sorobanOp.stateChanges.forEach((stateChange, changeIdx) => {
        const stateChangeNode: Node = {
          id: `state-${index}-${changeIdx}`,
          type: 'stateChange',
          position: { x: globalNodeIndex * 450, y: 50 + 200 },
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
      console.log(`💫 Creating ${operationEffects.length} effect nodes for operation ${index}`);

      operationEffects.forEach((effect, effectIdx) => {
        const effectNode: Node = {
          id: `effect-${index}-${effectIdx}`,
          type: 'effect',
          position: { x: globalNodeIndex * 450, y: 50 },
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
  });

  console.log(`✅ Successfully created ${allNodes.length} total nodes (operations + events + state changes + effects)`);
  return allNodes;
};

const extractOperationSpecificData = (op: any) => {
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
      data.price = op.price;
      data.offerId = op.offer_id;
      data.selling_asset_type = op.selling_asset_type;
      data.selling_asset_code = op.selling_asset_code;
      data.selling_asset_issuer = op.selling_asset_issuer;
      data.buying_asset_type = op.buying_asset_type;
      data.buying_asset_code = op.buying_asset_code;
      data.buying_asset_issuer = op.buying_asset_issuer;
      break;
      
    case 'manage_buy_offer':
      data.buyAmount = op.buy_amount || op.amount;
      data.price = op.price;
      data.offerId = op.offer_id;
      data.selling_asset_type = op.selling_asset_type;
      data.selling_asset_code = op.selling_asset_code;
      data.selling_asset_issuer = op.selling_asset_issuer;
      data.buying_asset_type = op.buying_asset_type;
      data.buying_asset_code = op.buying_asset_code;
      data.buying_asset_issuer = op.buying_asset_issuer;
      break;
      
    case 'create_passive_sell_offer':
      data.amount = op.amount;
      data.price = op.price;
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

  // Create sequential edges between operations
  for (let i = 0; i < validOperations.length - 1; i++) {
    edges.push({
      id: `edge-seq-${i}`,
      source: `op-${i}`,
      target: `op-${i + 1}`,
      type: 'smoothstep',
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
          type: 'smoothstep',
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

  console.log('🔗 Created edges:', edges.length, 'total');
  return edges;
};

export const simulateTransaction = async (hash: string): Promise<SimulationResult> => {
  console.log('🧪 Simulating transaction:', hash);
  
  try {
    // For now, return a basic simulation result
    // In a real implementation, this would use Soroban RPC to simulate the transaction
    return {
      success: true,
      estimatedFee: '100',
      potentialErrors: [],
      resourceUsage: {
        cpuUsage: 1000,
        memoryUsage: 512
      }
    };
  } catch (error: any) {
    console.error('❌ Simulation error:', error);
    return {
      success: false,
      estimatedFee: '0',
      potentialErrors: [error.message || 'Simulation failed'],
      resourceUsage: {
        cpuUsage: 0,
        memoryUsage: 0
      }
    };
  }
};

export const simulateTransactionWithDebugger = async (hash: string, horizonTx?: any) => {
  console.log('🔬 Enhanced simulation with debugger for:', hash);

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
        console.log('📋 Error Analysis:', errorAnalysis);
      } catch (error) {
        console.warn('Failed to decode result XDR:', error);
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
        console.log('✅ Got Soroban RPC data:', sorobanData);

        // Extract actual consumed resources directly from RPC response
        // Stellar RPC returns CPU and memory in the transaction result
        if (sorobanData) {
          console.log('🔍 Checking sorobanData for resource fields...');
          console.log('🔍 sorobanData keys:', Object.keys(sorobanData));

          // Check for direct CPU/memory fields
          const possibleCpuFields = ['cpuInsns', 'cpu_instructions', 'totalCpuInsns'];
          const possibleMemFields = ['memBytes', 'memory_bytes', 'totalMemBytes'];

          for (const field of possibleCpuFields) {
            if (sorobanData[field] !== undefined) {
              console.log(`✅ Found CPU in sorobanData.${field}:`, sorobanData[field]);
            }
          }

          for (const field of possibleMemFields) {
            if (sorobanData[field] !== undefined) {
              console.log(`✅ Found Memory in sorobanData.${field}:`, sorobanData[field]);
            }
          }
        }

        // Try to simulate the transaction to get resource usage
        if (tx.envelope_xdr && tx.successful) {
          try {
            console.log('🔄 Attempting to simulate transaction for resource data...');
            const transaction = StellarSdk.TransactionBuilder.fromXDR(tx.envelope_xdr, networkConfig.networkPassphrase) as StellarSdk.Transaction;

            // Use official Stellar RPC to simulate (free public endpoint)
            const rpcUrl = networkConfig.isTestnet
              ? 'https://soroban-testnet.stellar.org'
              : 'https://mainnet.sorobanrpc.com';

            const rpcServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: false });
            const simResult = await rpcServer.simulateTransaction(transaction);
            console.log('✅ Simulation result:', simResult);

            simulationData = simResult;
          } catch (simError: any) {
            console.warn('⚠️ Could not simulate transaction:', simError.message);
          }
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch Soroban RPC data:', err);
      }
    }

    // For failed Soroban transactions, note that we can't re-simulate
    // because the original transaction state may no longer exist
    let simulationDiagnostics: any = null;
    if (!tx.successful && hasSorobanOps) {
      console.log('ℹ️ Failed Soroban transaction - diagnostic events not available in failed tx metadata');
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
    console.log('🔍 Checking envelope sorobanData availability:', {
      has__envelopeSorobanData: !!(tx as any).__envelopeSorobanData,
      cpuInstructions: realResourceUsage.cpuInstructions
    });

    // Skip trying to extract actual from invoke result - we'll get it from metadata later

    // Always try to extract BUDGETED resources from envelope sorobanData
    if ((tx as any).__envelopeSorobanData) {
      try {
        console.log('📊 Parsing envelope sorobanData for BUDGETED resources...');
        const sorobanData = StellarSdk.xdr.SorobanTransactionData.fromXDR((tx as any).__envelopeSorobanData, 'base64');
        const resources = sorobanData.resources();

        console.log('🔍 Resources object keys:', Object.keys(resources));
        console.log('🔍 Resources object methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(resources)));

        // Extract budgeted CPU instructions
        if (resources.instructions) {
          const budgetedCpu = Number(resources.instructions());
          realResourceUsage.budgetedCpuInstructions = budgetedCpu;

          // Only use as actual if we don't have actual values
          if (realResourceUsage.cpuInstructions === 0) {
            realResourceUsage.cpuInstructions = budgetedCpu;
            console.log(`⚠️ CPU Instructions from envelope (BUDGETED, using as actual): ${realResourceUsage.cpuInstructions.toLocaleString()}`);
          } else {
            console.log(`📊 BUDGETED CPU Instructions: ${budgetedCpu.toLocaleString()} (actual: ${realResourceUsage.cpuInstructions.toLocaleString()})`);
          }
        }

        if ((resources as any).readBytes) {
          realResourceUsage.readBytes = Number((resources as any).readBytes());
          console.log(`✅ Read Bytes from envelope: ${realResourceUsage.readBytes.toLocaleString()}`);
        }
        if ((resources as any).writeBytes) {
          realResourceUsage.writeBytes = Number((resources as any).writeBytes());
          console.log(`✅ Write Bytes from envelope: ${realResourceUsage.writeBytes.toLocaleString()}`);
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
              console.log(`⚠️ Memory from envelope (BUDGETED, ${field}, using as actual): ${realResourceUsage.memoryBytes.toLocaleString()}`);
            } else {
              console.log(`📊 BUDGETED Memory (${field}): ${budgetedMem.toLocaleString()} bytes (actual: ${realResourceUsage.memoryBytes.toLocaleString()})`);
            }
            break;
          }
        }

        // If no budgeted memory but we have I/O bytes, calculate budgeted memory
        if (realResourceUsage.budgetedMemoryBytes === 0 && (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0)) {
          realResourceUsage.budgetedMemoryBytes = realResourceUsage.readBytes + realResourceUsage.writeBytes;
          console.log(`📊 BUDGETED Memory calculated from I/O: ${realResourceUsage.budgetedMemoryBytes.toLocaleString()} bytes`);
        }

        // If memory not found directly, use read+write bytes
        // In Soroban, memory usage for ledger operations = read + write bytes
        if (realResourceUsage.memoryBytes === 0 && (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0)) {
          realResourceUsage.memoryBytes = realResourceUsage.readBytes + realResourceUsage.writeBytes;
          console.log(`💡 Memory calculated from I/O: ${realResourceUsage.memoryBytes.toLocaleString()} bytes (${realResourceUsage.readBytes} read + ${realResourceUsage.writeBytes} write)`);
        }
        // Try to extract ledger entry counts
        if ((resources as any).readLedgerEntries) {
          realResourceUsage.readLedgerEntries = Number((resources as any).readLedgerEntries());
          console.log(`✅ Read Ledger Entries (direct): ${realResourceUsage.readLedgerEntries}`);
        }
        if ((resources as any).writeLedgerEntries) {
          realResourceUsage.writeLedgerEntries = Number((resources as any).writeLedgerEntries());
          console.log(`✅ Write Ledger Entries (direct): ${realResourceUsage.writeLedgerEntries}`);
        }

        // If not found directly, try to get from footprint in RESOURCES (not sorobanData)
        if (realResourceUsage.readLedgerEntries === 0 || realResourceUsage.writeLedgerEntries === 0) {
          console.log('🔍 Entry counts are 0, trying to extract from resources.footprint()...');
          console.log('🔍 resources type:', typeof resources);
          console.log('🔍 resources.footprint type:', typeof (resources as any).footprint);

          try {
            // Get footprint from RESOURCES, not sorobanData!
            const footprint = (resources as any).footprint ? (resources as any).footprint() : null;
            console.log('🔍 footprint result:', footprint);
            console.log('🔍 footprint type:', typeof footprint);

            if (footprint) {
              console.log('✅ Got footprint object from resources');
              console.log('🔍 footprint.readOnly type:', typeof footprint.readOnly);
              console.log('🔍 footprint.readWrite type:', typeof footprint.readWrite);

              const readOnly = footprint.readOnly ? footprint.readOnly() : [];
              const readWrite = footprint.readWrite ? footprint.readWrite() : [];

              console.log(`🔍 readOnly length: ${readOnly.length}`);
              console.log(`🔍 readWrite length: ${readWrite.length}`);

              if (realResourceUsage.readLedgerEntries === 0) {
                realResourceUsage.readLedgerEntries = readOnly.length + readWrite.length;
                console.log(`✅ Read Ledger Entries from footprint: ${realResourceUsage.readLedgerEntries} (${readOnly.length} read-only + ${readWrite.length} read-write)`);
              }

              if (realResourceUsage.writeLedgerEntries === 0) {
                realResourceUsage.writeLedgerEntries = readWrite.length;
                console.log(`✅ Write Ledger Entries from footprint: ${realResourceUsage.writeLedgerEntries}`);
              }
            } else {
              console.warn('⚠️ resources.footprint is null or undefined');
            }
          } catch (footprintError: any) {
            console.warn('⚠️ Could not extract from resources.footprint:', footprintError.message);
            console.error('Stack:', footprintError.stack);
          }
        } else {
          console.log('✅ Entry counts already set - read:', realResourceUsage.readLedgerEntries, 'write:', realResourceUsage.writeLedgerEntries);
        }

        console.log('✅ Extracted BUDGETED resource usage from envelope sorobanData:', realResourceUsage);
      } catch (envDataError: any) {
        console.warn('⚠️ Could not parse envelope sorobanData:', envDataError.message);
      }
    }

    // Next, try to get resource usage from simulation's transactionData
    if (simulationData && 'transactionData' in simulationData && realResourceUsage.cpuInstructions === 0) {
      try {
        const txData = (simulationData as any).transactionData;
        console.log('📊 Simulation has transactionData:', !!txData);
        console.log('📊 transactionData type:', typeof txData);
        console.log('📊 transactionData keys:', txData ? Object.keys(txData) : 'null');
        console.log('📊 transactionData.toXDR:', typeof txData?.toXDR);
        console.log('📊 transactionData value:', txData);

        if (txData) {
          // Check if it's already a parsed object with resources() method
          if (typeof txData.resources === 'function') {
            const resources = txData.resources();
            console.log('📊 Found parsed transactionData resources');

            if (resources.instructions) {
              realResourceUsage.cpuInstructions = Number(resources.instructions());
              console.log(`✅ CPU Instructions from parsed txData: ${realResourceUsage.cpuInstructions.toLocaleString()}`);
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
                  console.log(`✅ Read Ledger Entries from parsed footprint: ${realResourceUsage.readLedgerEntries}`);
                }

                if (realResourceUsage.writeLedgerEntries === 0) {
                  realResourceUsage.writeLedgerEntries = readWrite.length;
                  console.log(`✅ Write Ledger Entries from parsed footprint: ${realResourceUsage.writeLedgerEntries}`);
                }
              } catch (footprintError: any) {
                console.warn('⚠️ Could not extract from parsed footprint:', footprintError.message);
              }
            }

            console.log('✅ Extracted resource usage from parsed txData:', realResourceUsage);
          }
          // If it's an XDR object/string, try to parse it
          else if (txData.toXDR || typeof txData === 'string') {
            try {
              const txDataXdr = typeof txData === 'string' ? txData : txData.toXDR('base64');
              console.log('📊 Parsing transactionData XDR...');

              const parsedTxData = StellarSdk.xdr.SorobanTransactionData.fromXDR(txDataXdr, 'base64');
              const resources = parsedTxData.resources();

              if (resources.instructions) {
                realResourceUsage.cpuInstructions = Number(resources.instructions());
                console.log(`✅ CPU Instructions from XDR: ${realResourceUsage.cpuInstructions.toLocaleString()}`);
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
                      console.log(`✅ Read Ledger Entries from XDR footprint: ${realResourceUsage.readLedgerEntries}`);
                    }

                    if (realResourceUsage.writeLedgerEntries === 0) {
                      realResourceUsage.writeLedgerEntries = readWrite.length;
                      console.log(`✅ Write Ledger Entries from XDR footprint: ${realResourceUsage.writeLedgerEntries}`);
                    }
                  }
                } catch (footprintError: any) {
                  console.warn('⚠️ Could not extract from XDR footprint:', footprintError.message);
                }
              }

              console.log('✅ Extracted resource usage from XDR:', realResourceUsage);
            } catch (xdrError: any) {
              console.warn('⚠️ Could not parse transactionData XDR:', xdrError.message);
            }
          }
        }
      } catch (txDataError: any) {
        console.warn('⚠️ Could not extract resources from txData:', txDataError.message);
      }
    }

    // Fallback: try to get resource usage from simulation cost
    if (realResourceUsage.cpuInstructions === 0 && simulationData && 'cost' in simulationData) {
      try {
        const cost = (simulationData as any).cost;
        if (cost) {
          console.log('📊 Extracting resources from simulation cost:', cost);
          if (cost.cpuInsns) realResourceUsage.cpuInstructions = parseInt(cost.cpuInsns);
          if (cost.memBytes) realResourceUsage.memoryBytes = parseInt(cost.memBytes);
          if (cost.readBytes) realResourceUsage.readBytes = parseInt(cost.readBytes);
          if (cost.writeBytes) realResourceUsage.writeBytes = parseInt(cost.writeBytes);

          console.log(`✅ Simulation resources - CPU: ${realResourceUsage.cpuInstructions.toLocaleString()}, Memory: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
        }
      } catch (costError: any) {
        console.warn('⚠️ Could not extract cost from simulation:', costError.message);
      }
    }

    // Parse metadata XDR - try multiple sources
    console.log('🔍 Checking metadata sources...');
    console.log('  - sorobanData available:', !!sorobanData);
    console.log('  - tx.result_meta_xdr:', !!(tx as any).result_meta_xdr);
    console.log('  - tx.soroban_meta_xdr:', !!(tx as any).soroban_meta_xdr);

    if (sorobanData) {
      console.log('  - sorobanData.status:', sorobanData.status);
      console.log('  - sorobanData.resultMetaXdr:', !!sorobanData.resultMetaXdr);
    }

    // Priority order: Soroban RPC > Horizon soroban_meta_xdr > Horizon result_meta_xdr
    let metaXdr = sorobanData?.resultMetaXdr || sorobanData?.result_meta_xdr;

    // If Soroban RPC returned NOT_FOUND or no metaXdr, use Horizon's XDR
    if (!metaXdr) {
      if ((tx as any).soroban_meta_xdr) {
        console.log('✅ Using Horizon soroban_meta_xdr (fee-bumped transaction)');
        metaXdr = (tx as any).soroban_meta_xdr;
      } else if ((tx as any).result_meta_xdr) {
        console.log('✅ Using Horizon result_meta_xdr');
        metaXdr = (tx as any).result_meta_xdr;
      }
    } else {
      console.log('✅ Using Soroban RPC metaXdr');
    }

    if (metaXdr) {
      try {
        console.log('✅ Found meta XDR, parsing...');
        const meta = StellarSdk.xdr.TransactionMeta.fromXDR(metaXdr, 'base64');
        const metaSwitch = meta.switch();
        const metaType = (metaSwitch as any).name || String(metaSwitch);

        console.log(`📦 Soroban meta type: ${metaType}`);

        // Handle both v3 and v4 transaction meta
        if (metaType === 'transactionMetaV3' || metaType === '3' || metaType === 'transactionMetaV4' || metaType === '4') {
          const metaVersion = (metaType === 'transactionMetaV4' || metaType === '4') ? (meta as any).v4() : meta.v3();
          console.log(`🔍 Using meta version: ${metaType}`);

          if (metaVersion.sorobanMeta && metaVersion.sorobanMeta()) {
            const sorobanMeta = metaVersion.sorobanMeta();
            console.log('✅ Found sorobanMeta');

            // Extract diagnostic events for contract execution logs
            try {
              const diagnosticEvents = sorobanMeta.diagnosticEvents ? sorobanMeta.diagnosticEvents() : [];
              console.log(`🔍 Found ${diagnosticEvents.length} diagnostic events`);

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
                    } catch {}

                    // Extract event body
                    const body = eventData.body();
                    const bodySwitch = body.switch();
                    const bodyType = (bodySwitch as any).name || String(bodySwitch);

                    console.log(`📋 Event ${idx}: type=${bodyType}, contract=${contractId.substring(0, 12)}..., success=${inSuccessfulContractCall}`);

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
                            logs.push(`   Topic ${topicIdx}: ${JSON.stringify(topicStr)}`);
                          } catch {}
                        });

                        try {
                          const dataStr = decodeScVal(data);
                          logs.push(`   Data: ${JSON.stringify(dataStr)}`);
                        } catch {}
                      } catch (bodyError: any) {
                        console.warn(`⚠️ Could not parse event ${idx} body:`, bodyError.message);
                      }
                    }
                  } catch (eventError: any) {
                    console.warn(`⚠️ Could not process diagnostic event ${idx}:`, eventError.message);
                  }
                });
              }
            } catch (diagError: any) {
              console.warn('⚠️ Could not extract diagnostic events:', diagError.message);
            }

            // First, let's log what's directly available on sorobanMeta
            console.log('🔍 sorobanMeta available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(sorobanMeta)));

            // Extract ACTUAL resource usage from sorobanMeta
            // The structure is: sorobanMeta.ext().v1().ext().v0() contains actual consumed resources
            try {
              const ext = sorobanMeta.ext();
              const extSwitch = ext.switch();
              console.log(`🔍 Soroban ext switch value:`, extSwitch);

              if (extSwitch === 1) {
                // Get v1 extension which contains resource info
                const v1Ext = (ext as any).v1?.() || (ext as any)._value;

                if (!v1Ext) {
                  console.warn('⚠️ Could not access v1 extension');
                  throw new Error('v1 extension not accessible');
                }

                // Try to get ext which contains the actual resource consumption
                // Protocol 20+: v1Ext.ext().v0() contains actual consumed resources
                const v1ExtExt = v1Ext.ext?.();
                if (v1ExtExt) {
                  const v1ExtExtSwitch = v1ExtExt.switch?.();
                  console.log(`🔍 v1Ext.ext().switch():`, v1ExtExtSwitch);

                  if (v1ExtExtSwitch === 0) {
                    // Protocol 20: Get actual consumed resources from v0
                    const consumedResources = (v1ExtExt as any).v0?.() || (v1ExtExt as any)._value;
                    if (consumedResources) {
                      console.log('✅ Found actual consumed resources in v0');

                      // Extract CPU and memory
                      const cpuInsns = consumedResources.ext?.()?.v0?.()?.cpuInsns?.();
                      const memBytes = consumedResources.ext?.()?.v0?.()?.memBytes?.();

                      if (cpuInsns) {
                        realResourceUsage.cpuInstructions = Number(cpuInsns);
                        realResourceUsage.isActual = true;
                        console.log(`✅ [ACTUAL] CPU: ${realResourceUsage.cpuInstructions.toLocaleString()}`);
                      }

                      if (memBytes) {
                        realResourceUsage.memoryBytes = Number(memBytes);
                        realResourceUsage.isActual = true;
                        console.log(`✅ [ACTUAL] Memory: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
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
                      console.log('🔍 Got v0 data:', v0Data);
                      console.log('🔍 v0 keys:', Object.keys(v0Data));
                      console.log('🔍 v0 prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(v0Data)));

                      // Extract from v0Data - try both full names and abbreviations
                      const cpuExtractors = ['cpuInsns', 'cpuInstructions', 'totalCpuInsns'];
                      const memExtractors = ['memBytes', 'memoryBytes', 'totalMemBytes'];

                      for (const method of cpuExtractors) {
                        if (typeof v0Data[method] === 'function') {
                          realResourceUsage.cpuInstructions = Number(v0Data[method]());
                          realResourceUsage.isActual = true;
                          console.log(`✅ [ACTUAL v0.${method}] CPU: ${realResourceUsage.cpuInstructions.toLocaleString()}`);
                          break;
                        }
                      }

                      for (const method of memExtractors) {
                        if (typeof v0Data[method] === 'function') {
                          realResourceUsage.memoryBytes = Number(v0Data[method]());
                          realResourceUsage.isActual = true;
                          console.log(`✅ [ACTUAL v0.${method}] Memory: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
                          break;
                        }
                      }

                      if (typeof v0Data.readBytes === 'function') {
                        const rb = Number(v0Data.readBytes());
                        realResourceUsage.readBytes = rb;
                        console.log(`✅ [v0] Read: ${rb.toLocaleString()} bytes`);
                      }
                      if (typeof v0Data.writeBytes === 'function') {
                        const wb = Number(v0Data.writeBytes());
                        realResourceUsage.writeBytes = wb;
                        console.log(`✅ [v0] Write: ${wb.toLocaleString()} bytes`);
                      }
                      if (typeof v0Data.readLedgerEntries === 'function') {
                        const rle = Number(v0Data.readLedgerEntries());
                        realResourceUsage.readLedgerEntries = rle;
                        console.log(`✅ [v0] Read entries: ${rle}`);
                      }
                      if (typeof v0Data.writeLedgerEntries === 'function') {
                        const wle = Number(v0Data.writeLedgerEntries());
                        realResourceUsage.writeLedgerEntries = wle;
                        console.log(`✅ [v0] Write entries: ${wle}`);
                      }
                    }
                  } catch (extCallError: any) {
                    console.warn('⚠️ Error calling v1Ext.ext():', extCallError.message);
                    console.error(extCallError);
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
                    console.log(`🔍 [Functions] Raw CPU value:`, cpuValue, 'type:', typeof cpuValue);
                    console.log(`🔍 [Functions] Raw Mem value:`, memValue, 'type:', typeof memValue);

                    realResourceUsage.cpuInstructions = Number(cpuValue);
                    realResourceUsage.memoryBytes = Number(memValue);
                    realResourceUsage.isActual = true;
                    console.log(`✅ [Direct functions] CPU: ${realResourceUsage.cpuInstructions.toLocaleString()}, Memory: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
                    resourceMetrics = v1Ext;
                  }
                  // Fallback to direct properties
                  else if (v1Ext.totalCpuInsns !== undefined) {
                    realResourceUsage.cpuInstructions = Number(v1Ext.totalCpuInsns);
                    realResourceUsage.memoryBytes = Number(v1Ext.totalMemBytes || 0);
                    realResourceUsage.isActual = true;
                    console.log(`✅ [Direct properties] CPU: ${realResourceUsage.cpuInstructions.toLocaleString()}, Memory: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
                    resourceMetrics = v1Ext;
                  }
                } catch (directError: any) {
                  console.warn('⚠️ Direct access error:', directError.message);
                  console.error(directError);
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
                        console.log(`💰 Resource fee: ${Number(resourceUsageExt.resourceFeeCharged()).toLocaleString()} stroops`);
                      }

                      // Try ext.v1.ext.v1 for detailed metrics
                      if (resourceUsageExt.ext) {
                        const resourceExtV1 = resourceUsageExt.ext();
                        const resourceExtV1Switch = resourceExtV1.switch();
                        const resourceExtV1Type = (resourceExtV1Switch as any).name || String(resourceExtV1Switch);

                        if (resourceExtV1Type === '1' && resourceExtV1.v1) {
                          const actualMetrics = resourceExtV1.v1();

                          // Debug: Log all available fields
                          console.log('🔍 actualMetrics available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(actualMetrics)));

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
                            console.log(`✅ [Nested] readBytes: ${rb}`);
                          }
                          if (actualMetrics.writeBytes) {
                            const wb = Number(actualMetrics.writeBytes());
                            realResourceUsage.writeBytes = wb;
                            console.log(`✅ [Nested] writeBytes: ${wb}`);
                          }
                          if (actualMetrics.readLedgerEntries) {
                            const rle = Number(actualMetrics.readLedgerEntries());
                            realResourceUsage.readLedgerEntries = rle;
                            console.log(`✅ [Nested] readLedgerEntries: ${rle}`);
                          }
                          if (actualMetrics.writeLedgerEntries) {
                            const wle = Number(actualMetrics.writeLedgerEntries());
                            realResourceUsage.writeLedgerEntries = wle;
                            console.log(`✅ [Nested] writeLedgerEntries: ${wle}`);
                          }

                          // Calculate memory from I/O if not available
                          if (realResourceUsage.memoryBytes === 0 && (realResourceUsage.readBytes > 0 || realResourceUsage.writeBytes > 0)) {
                            realResourceUsage.memoryBytes = realResourceUsage.readBytes + realResourceUsage.writeBytes;
                            console.log(`💡 Calculated memory from I/O: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
                          }

                          console.log(`✅ [Nested ext.v1.ext.v1] CPU: ${realResourceUsage.cpuInstructions.toLocaleString()}, Memory: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
                          console.log(`✅ [Nested] I/O: Read ${realResourceUsage.readBytes} bytes, Write ${realResourceUsage.writeBytes} bytes`);
                          console.log(`✅ [Nested] Ledger entries: Read ${realResourceUsage.readLedgerEntries}, Write ${realResourceUsage.writeLedgerEntries}`);
                          resourceMetrics = actualMetrics;
                        }
                      }
                    }
                  } catch (nestedError: any) {
                    console.warn('⚠️ Could not extract from nested ext:', nestedError.message);
                  }
                }

                // Extract fee information
                try {
                  if (v1Ext.totalNonRefundableResourceFeeCharged) {
                    console.log(`💰 Non-refundable: ${v1Ext.totalNonRefundableResourceFeeCharged()} stroops`);
                  }
                  if (v1Ext.totalRefundableResourceFeeCharged) {
                    console.log(`💰 Refundable: ${v1Ext.totalRefundableResourceFeeCharged()} stroops`);
                  }
                } catch {}
              }
            } catch (extError: any) {
              console.warn('⚠️ Could not extract ext data:', extError.message);
            }
          }
        } else {
          console.warn(`⚠️ Unexpected meta type: ${metaType}`);
        }
      } catch (metaError: any) {
        console.warn('⚠️ Could not parse resultMetaXdr:', metaError.message);
        console.error(metaError);
      }
    } else {
      console.warn('⚠️ No sorobanData or resultMetaXdr available');
      console.log('sorobanData keys:', sorobanData ? Object.keys(sorobanData) : 'null');

      // Try to extract footprint from sorobanData at transaction level
      if (sorobanData && sorobanData.resources) {
        console.log('🔍 Attempting to extract footprint from transaction.sorobanData.resources');
        try {
          const resources = sorobanData.resources;
          console.log('resources:', resources);
          console.log('resources keys:', Object.keys(resources));

          if (resources.footprint) {
            console.log('✅ Found footprint in sorobanData');
            const footprint = resources.footprint;
            console.log('footprint keys:', Object.keys(footprint));

            const readOnly = footprint.read_only || footprint.readOnly || [];
            const readWrite = footprint.read_write || footprint.readWrite || [];

            console.log('readOnly array length:', readOnly.length);
            console.log('readWrite array length:', readWrite.length);

            if (readOnly.length > 0 || readWrite.length > 0) {
              realResourceUsage.readLedgerEntries = readOnly.length + readWrite.length;
              realResourceUsage.writeLedgerEntries = readWrite.length;

              console.log(`✅ Extracted from sorobanData.resources.footprint: ${readOnly.length} RO, ${readWrite.length} RW`);

              // Calculate bytes from footprint entries - they are base64 XDR strings
              readOnly.forEach((entry: any, idx: number) => {
                const xdr = entry.xdr || entry;
                const size = typeof xdr === 'string' ? xdr.length : 0;
                realResourceUsage.readBytes += size;
                if (idx === 0) console.log(`Sample RO entry:`, entry, `size: ${size}`);
              });

              readWrite.forEach((entry: any, idx: number) => {
                const xdr = entry.xdr || entry;
                const size = typeof xdr === 'string' ? xdr.length : 0;
                realResourceUsage.readBytes += size;
                realResourceUsage.writeBytes += size;
                if (idx === 0) console.log(`Sample RW entry:`, entry, `size: ${size}`);
              });

              console.log(`✅ Calculated bytes - Read: ${realResourceUsage.readBytes}, Write: ${realResourceUsage.writeBytes}`);
            } else {
              console.warn('⚠️ Footprint found but has 0 entries');
            }
          } else {
            console.warn('⚠️ resources.footprint not found, checking alternate locations');
            console.log('Available resource keys:', Object.keys(resources));
          }
        } catch (footprintError: any) {
          console.error('❌ Failed to extract footprint from sorobanData:', footprintError);
          console.error('Stack:', footprintError.stack);
        }
      } else if (sorobanData) {
        console.warn('⚠️ sorobanData exists but has no resources property');
        console.log('Full sorobanData:', sorobanData);
        console.log('sorobanData keys:', Object.keys(sorobanData));
        console.log('sorobanData type:', typeof sorobanData);

        // Try to stringify to see the structure
        try {
          console.log('sorobanData JSON:', JSON.stringify(sorobanData, null, 2));
        } catch (e) {
          console.log('Could not stringify sorobanData');
        }

        // Try direct property access
        console.log('sorobanData._attributes:', (sorobanData as any)._attributes);

        // Try method calls
        if (typeof (sorobanData as any).resources === 'function') {
          console.log('⚠️ resources is a function! Calling it...');
          const res = (sorobanData as any).resources();
          console.log('resources() result:', res);
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

        // For Soroban transactions (v3 meta)
        if (metaType === 'transactionMetaV3') {
          const v3 = meta.v3();

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
              const events = sorobanMeta.events();
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
                      if (changeType === 'ledgerEntryState') {
                        const entry = change.state();
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
        console.warn('Could not extract resource usage from metadata:', metaError.message);
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

          if (metaType === 'transactionMetaV3') {
            const v3 = meta.v3();
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
                const events = sorobanMeta.events();
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
      console.log(`💡 Final memory calculation from I/O: ${realResourceUsage.memoryBytes.toLocaleString()} bytes`);
    }

    // FINAL AGGRESSIVE FOOTPRINT EXTRACTION - Last resort to get entry counts
    console.log('🔍 FINAL CHECK: Ledger entry counts before return:', {
      readLedgerEntries: realResourceUsage.readLedgerEntries,
      writeLedgerEntries: realResourceUsage.writeLedgerEntries
    });

    if (realResourceUsage.readLedgerEntries === 0 || realResourceUsage.writeLedgerEntries === 0) {
      console.log('⚠️ Entry counts still 0, attempting final footprint extraction from envelope...');

      try {
        // Try to parse envelope XDR and extract footprint
        const envelopeXdr = (tx as any).envelope_xdr;
        console.log('📦 envelope_xdr exists:', !!envelopeXdr);

        if (envelopeXdr) {
          console.log('📦 Parsing envelope XDR for footprint...');
          const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
          console.log('✅ Envelope parsed successfully');

          let txEnvelope: any = null;
          const envSwitch = envelope.switch();
          console.log('📦 Envelope type:', envSwitch.name || String(envSwitch));

          if (envSwitch.name === 'envelopeTypeTx' || String(envSwitch) === '2') {
            txEnvelope = envelope.v1();
            console.log('✅ Using v1 envelope');
          } else if (envSwitch.name === 'envelopeTypeTxV0' || String(envSwitch) === '0') {
            txEnvelope = envelope.v0();
            console.log('✅ Using v0 envelope');
          } else if (envSwitch.name === 'envelopeTypeTxFeeBump' || String(envSwitch) === '5') {
            const feeBump = envelope.feeBump();
            txEnvelope = feeBump.tx().innerTx().v1();
            console.log('✅ Using fee-bumped envelope (inner v1)');
          }

          if (txEnvelope) {
            console.log('✅ txEnvelope obtained');
            const txBody = txEnvelope.tx();
            console.log('✅ txBody obtained');
            const ext = txBody.ext();
            console.log('📦 Extension switch value:', ext.switch ? ext.switch().value : 'no switch');

            if (ext && ext.switch && ext.switch().value === 1) {
              console.log('✅ Extension has Soroban data');
              const sorobanData = ext.sorobanData();
              console.log('✅ sorobanData obtained');
              const footprint = sorobanData.resources().footprint();
              console.log('✅ footprint obtained');

              const readOnly = footprint.readOnly();
              const readWrite = footprint.readWrite();
              console.log(`📊 Footprint: ${readOnly.length} read-only, ${readWrite.length} read-write`);

              if (realResourceUsage.readLedgerEntries === 0) {
                realResourceUsage.readLedgerEntries = readOnly.length + readWrite.length;
                console.log(`✅ FINAL: Read Ledger Entries from envelope footprint: ${realResourceUsage.readLedgerEntries} (${readOnly.length} RO + ${readWrite.length} RW)`);
              }

              if (realResourceUsage.writeLedgerEntries === 0) {
                realResourceUsage.writeLedgerEntries = readWrite.length;
                console.log(`✅ FINAL: Write Ledger Entries from envelope footprint: ${realResourceUsage.writeLedgerEntries}`);
              }
            } else {
              console.warn('⚠️ Extension does not contain Soroban data (ext.switch.value !== 1)');
            }
          } else {
            console.warn('⚠️ Could not extract txEnvelope from envelope');
          }
        } else {
          console.warn('⚠️ No envelope_xdr found in transaction');
        }
      } catch (finalError: any) {
        console.error('❌ Final footprint extraction failed:', finalError);
        console.error('Stack:', finalError.stack);
      }
    }

    console.log('📊 FINAL RESOURCE USAGE (actual data only):', realResourceUsage);

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
                      const contractId = StellarSdk.StrKey.encodeContract(addr.contractId());
                      opLogs.push(`║   [${idx}] Contract Address: ${contractId.substring(0, 20)}...`);
                    } else if (addr.switch().name === 'scAddressTypeAccount') {
                      const accountId = StellarSdk.StrKey.encodeEd25519PublicKey(addr.accountId().ed25519());
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
    console.error('❌ Enhanced simulation error:', error);
    
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