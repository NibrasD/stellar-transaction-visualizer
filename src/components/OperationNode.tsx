import React from 'react';
import { Handle, Position } from 'reactflow';
import { CircleDollarSign, ArrowRightCircle, AlertCircle, Code, Cpu, Zap, UserPlus, Settings, TrendingUp, Shield, Key, Users, ArrowLeftRight, Target, Repeat, ShoppingCart, ArrowRight, Sprout, Wheat } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as StellarSdk from '@stellar/stellar-sdk';

// Helper function to safely stringify values that might contain BigInt
const safeStringify = (value: any, space?: number): string => {
  return JSON.stringify(value, (key, val) =>
    typeof val === 'bigint' ? val.toString() : val
  , space);
};

// Decode base64 contract ID to Stellar address
const decodeContractId = (base64: string): string => {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const contractId = StellarSdk.StrKey.encodeContract(buffer);
    return contractId;
  } catch (e) {
    return base64; // Return original if decode fails
  }
};

// Format event topic/data for display - values are already decoded from stellar.ts
const formatEventValue = (value: any): string => {
  if (value === null || value === undefined) return 'null';

  // Values are ALREADY DECODED from stellar.ts, just format for display
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'bigint') return value.toString();

  // If it's an array, format each element
  if (Array.isArray(value)) {
    const formatted = value.map(item => formatEventValue(item));
    return formatted.join(', ');
  }

  // For objects, use safeStringify
  const str = safeStringify(value);
  // Truncate very long values
  if (str.length > 150) {
    return str.substring(0, 147) + '...';
  }
  return str;
};

// Helper to format object data in a readable way
const formatObjectData = (data: any, maxDepth = 2, currentDepth = 0): string => {
  if (data === null || data === undefined) return 'null';
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);

  if (currentDepth >= maxDepth) return '{...}';

  if (Array.isArray(data)) {
    const items = data.slice(0, 3).map(item => formatObjectData(item, maxDepth, currentDepth + 1));
    const more = data.length > 3 ? `, ...+${data.length - 3}` : '';
    return `[${items.join(', ')}${more}]`;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data).slice(0, 5);
    const entries = keys.map(k => `${k}: ${formatObjectData(data[k], maxDepth, currentDepth + 1)}`);
    const more = Object.keys(data).length > 5 ? ', ...' : '';
    return `{${entries.join(', ')}${more}}`;
  }

  return String(data);
};

// Check if string contains only printable ASCII characters
const isPrintableString = (str: string): boolean => {
  // Only allow printable ASCII chars, common symbols, and safe Unicode
  return /^[\x20-\x7E\s]*$/.test(str);
};

// Helper to check if an object looks like a serialized Buffer/Uint8Array
const isSerializedBuffer = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
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
};

// Helper to convert serialized buffer to Uint8Array
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
    const items = val.map(v => formatValueWithType(v, 40)).join(', ');
    if (items.length > maxLength) {
      return `[${items.substring(0, maxLength - 3)}…]`;
    }
    return `[${items}]`;
  }

  if (typeof val === 'object') {
    try {
      const entries = Object.entries(val).slice(0, 3).map(([k, v]) => {
        const key = typeof k === 'string' ? `"${k}"sym` : k;
        const value = formatValueWithType(v, 30);
        return `${key}: ${value}`;
      });
      const entriesStr = entries.join(', ');
      const hasMore = Object.keys(val).length > 3;
      return `{${entriesStr}${hasMore ? ', …' : ''}}`;
    } catch {
      return '{…}';
    }
  }

  return String(val);
};

// Format a single value in human-readable way
// Helper to clean up HostFunctionType display
const cleanHostFunctionType = (type: string): string => {
  // Remove duplicate "HostFunctionType" prefix if it exists
  return type.replace(/^HostFunctionType(HostFunctionType)?/, '');
};

// Helper to get argument type hint
const getArgType = (argValue: any): string => {
  if (argValue === null || argValue === undefined) return 'undefined';

  const formattedValue = typeof argValue === 'string' ? argValue : String(argValue);

  // Check for addresses
  if (formattedValue.startsWith('G')) return 'Address';
  if (formattedValue.startsWith('C')) return 'Contract';

  // Check for serialized buffer
  if (typeof argValue === 'object' && !Array.isArray(argValue) && isSerializedBuffer(argValue)) {
    const bytes = serializedBufferToUint8Array(argValue);
    // Could be address bytes or entropy
    if (bytes.length === 32) return 'Bytes32';
    return 'Bytes';
  }

  // Check for numbers
  if (typeof argValue === 'number') return 'u64';
  if (typeof argValue === 'bigint') return 'u128';
  if (typeof argValue === 'string' && /^\d+$/.test(argValue)) return 'u64';

  // Check for booleans
  if (typeof argValue === 'boolean') return 'bool';

  // Arrays and objects
  if (Array.isArray(argValue)) return 'Vec';
  if (typeof argValue === 'object') return 'Map';

  if (typeof argValue === 'string') return 'String';

  return 'unknown';
};

// Helper to get argument label based on function name and position
const getArgLabel = (functionName: string | undefined, idx: number, argValue: any): string => {
  if (!functionName) return `arg${idx}`;

  const formattedValue = typeof argValue === 'string' ? argValue : String(argValue);

  // Check if the value looks like different address types
  const isAccountAddress = formattedValue.startsWith('G');
  const isContractAddress = formattedValue.startsWith('C');
  const isAddress = isAccountAddress || isContractAddress;

  // Common patterns for different function types
  const commonPatterns: Record<string, string[]> = {
    'swap': ['from', 'to', 'amount_in', 'amount_out_min'],
    'transfer': ['from', 'to', 'amount'],
    'mint': ['to', 'amount'],
    'burn': ['from', 'amount'],
    'approve': ['spender', 'amount'],
    'balance': ['account'],
    'allowance': ['owner', 'spender'],
    'deposit': ['from', 'amount'],
    'withdraw': ['to', 'amount'],
    'claim': ['account', 'amount'],
    'stake': ['account', 'amount'],
    'unstake': ['account', 'amount'],
  };

  const fnLower = functionName.toLowerCase();
  const pattern = commonPatterns[fnLower];

  if (pattern && idx < pattern.length) {
    return pattern[idx];
  }

  // Generic smart labeling - distinguish between account and contract addresses
  if (idx === 0 && isContractAddress) return 'contract';
  if (idx === 0 && isAccountAddress) return 'account';
  if (idx === 1 && typeof formattedValue === 'string' && /^\d+$/.test(formattedValue)) return 'amount';

  return `arg${idx}`;
};

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return '';

  // CRITICAL: Check for serialized buffers FIRST
  if (typeof val === 'object' && !Array.isArray(val) && isSerializedBuffer(val)) {
    try {
      const bytes = serializedBufferToUint8Array(val);
      // Try to decode as Stellar address (32 bytes)
      if (bytes.length === 32) {
        try {
          const addr = StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
          return `${addr.substring(0, 4)}…${addr.substring(addr.length - 4)}`;
        } catch {
          try {
            const addr = StellarSdk.StrKey.encodeContract(bytes);
            return `${addr.substring(0, 6)}…${addr.substring(addr.length - 6)}`;
          } catch {
            const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
            return hex.length > 32 ? `0x${hex.slice(0, 16)}…${hex.slice(-16)}` : `0x${hex}`;
          }
        }
      }
      // For non-32-byte buffers, show as hex
      const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
      return hex.length > 32 ? `0x${hex.slice(0, 16)}…${hex.slice(-16)}` : `0x${hex}`;
    } catch (e) {
      console.warn('Failed to decode serialized buffer:', e);
    }
  }

  if (typeof val === 'string') {
    // Filter out non-printable characters
    if (!isPrintableString(val)) {
      // If it contains non-printable chars, show as [binary data] or just first/last 4 chars if looks like ID
      if (val.length > 20 && /^[A-Z0-9]+$/.test(val.replace(/[^\x20-\x7E]/g, ''))) {
        const cleaned = val.replace(/[^\x20-\x7E]/g, '');
        return `${cleaned.substring(0, 4)}…${cleaned.substring(cleaned.length - 4)}`;
      }
      return '[binary data]';
    }
    // Shorten long addresses
    if (val.length > 20 && val.match(/^[A-Z0-9]+$/)) {
      return `${val.substring(0, 4)}…${val.substring(val.length - 4)}`;
    }
    return val;
  }
  if (typeof val === 'number' || typeof val === 'bigint') {
    const numStr = val.toString();
    // Format large numbers with commas
    if (numStr.length > 4) {
      return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    return numStr;
  }
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const formatted = val.map(formatValue).filter(v => v && v !== '[binary data]');
    if (formatted.length === 0) return `[${val.length} items]`;
    if (formatted.length <= 3) return formatted.join(', ');
    return `[${formatted.length} items]`;
  }
  // Handle objects by trying to serialize with BigInt support
  if (typeof val === 'object') {
    try {
      const keys = Object.keys(val);

      // Check if this is an indexed array disguised as an object (e.g., {0: val, 1: val, 2: val})
      const isIndexedArray = keys.length > 0 && keys.every((k, idx) => k === String(idx));

      if (isIndexedArray) {
        // Check if this looks like a byte array (all values are small numbers)
        const values = keys.map(k => val[k]);
        const allNumbers = values.every(v => typeof v === 'number');
        const allSmallInts = allNumbers && values.every(v => Number.isInteger(v) && v >= 0 && v <= 255);

        if (allSmallInts && values.length > 4) {
          // This is likely a byte array - try to decode as Stellar address first
          const bytes = new Uint8Array(values);
          if (bytes.length === 32) {
            try {
              // Try as account address (G...)
              return StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
            } catch (e1) {
              try {
                // Try as contract address (C...)
                return StellarSdk.StrKey.encodeContract(bytes);
              } catch (e2) {
                // Not an address, show as hex
                const hex = values.map((v: number) => v.toString(16).padStart(2, '0')).join('');
                return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
              }
            }
          }
          // Not 32 bytes, convert to hex
          const hex = values.map((v: number) => v.toString(16).padStart(2, '0')).join('');
          return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
        }

        // Convert indexed object back to array format
        const arrayVals = keys.map(k => formatValue(val[k]));
        if (arrayVals.length > 3) {
          return `[${arrayVals.slice(0, 3).join(', ')}, +${arrayVals.length - 3} more]`;
        }
        return `[${arrayVals.join(', ')}]`;
      }

      const json = safeStringify(val);
      // If JSON is too long, summarize
      if (json.length > 100) {
        if (keys.length > 0) {
          const preview = keys.slice(0, 3).map(k => {
            const v = formatValue(val[k]);
            return v ? `${k}: ${v}` : null;
          }).filter(Boolean).join(', ');
          const more = keys.length > 3 ? `, +${keys.length - 3} more` : '';
          return `{${preview}${more}}`;
        }
        return '{...}';
      }
      return json;
    } catch {
      // If stringify fails, try to show at least some info
      const keys = Object.keys(val);
      if (keys.length > 0) {
        return `{${keys.slice(0, 2).join(', ')}${keys.length > 2 ? '...' : ''}}`;
      }
      return '{object}';
    }
  }
  // Try to stringify but catch errors with non-serializable data
  try {
    const str = String(val);
    return isPrintableString(str) && str !== '[object Object]' ? str : '[data]';
  } catch {
    return '[data]';
  }
};

// Map common function names to human-friendly labels
const getFunctionLabel = (fnName: string): { label: string; description: string } => {
  const name = fnName.toLowerCase();

  const mappings: Record<string, { label: string; description: string }> = {
    // Token operations
    'transfer': { label: '💸 Transfer Tokens', description: 'Moving tokens between accounts' },
    'mint': { label: '🏭 Create Tokens', description: 'Minting new tokens' },
    'burn': { label: '🔥 Burn Tokens', description: 'Destroying tokens' },
    'approve': { label: '✅ Approve Spending', description: 'Allowing another account to spend' },
    'allowance': { label: '👁️ Check Allowance', description: 'Viewing spending permission' },
    'balance': { label: '💰 Check Balance', description: 'Querying token balance' },
    'total_supply': { label: '📊 Total Supply', description: 'Getting total token supply' },

    // DeFi operations
    'swap': { label: '🔄 Swap Tokens', description: 'Exchanging one token for another' },
    'harvest': { label: '🌾 Claim Rewards', description: 'Collecting earned rewards' },
    'claim': { label: '🎁 Claim Rewards', description: 'Collecting earned tokens' },
    'stake': { label: '🔒 Stake Tokens', description: 'Locking tokens to earn rewards' },
    'unstake': { label: '🔓 Unstake Tokens', description: 'Unlocking staked tokens' },
    'deposit': { label: '📥 Deposit', description: 'Adding liquidity or tokens' },
    'withdraw': { label: '📤 Withdraw', description: 'Removing liquidity or tokens' },
    'add_liquidity': { label: '➕ Add Liquidity', description: 'Providing liquidity to pool' },
    'remove_liquidity': { label: '➖ Remove Liquidity', description: 'Withdrawing from liquidity pool' },
    'borrow': { label: '💳 Borrow', description: 'Taking out a loan' },
    'repay': { label: '💵 Repay', description: 'Paying back a loan' },
    'liquidate': { label: '⚠️ Liquidate', description: 'Liquidating under-collateralized position' },

    // NFT operations
    'mint_nft': { label: '🎨 Mint NFT', description: 'Creating a new NFT' },
    'transfer_nft': { label: '🖼️ Transfer NFT', description: 'Moving NFT ownership' },
    'burn_nft': { label: '🗑️ Burn NFT', description: 'Destroying an NFT' },

    // Governance
    'vote': { label: '🗳️ Vote', description: 'Casting a governance vote' },
    'propose': { label: '📝 Create Proposal', description: 'Submitting new proposal' },
    'execute': { label: '⚡ Execute Proposal', description: 'Executing approved proposal' },

    // Admin operations
    'initialize': { label: '🎬 Initialize Contract', description: 'Setting up contract' },
    'set_admin': { label: '👑 Set Admin', description: 'Changing admin address' },
    'upgrade': { label: '🔄 Upgrade Contract', description: 'Upgrading contract code' },
    'pause': { label: '⏸️ Pause Contract', description: 'Pausing contract operations' },
    'unpause': { label: '▶️ Unpause Contract', description: 'Resuming contract operations' },
  };

  // Try exact match first
  if (mappings[name]) {
    return mappings[name];
  }

  // Try partial matches
  for (const [key, value] of Object.entries(mappings)) {
    if (name.includes(key) || key.includes(name)) {
      return value;
    }
  }

  // Default: format the function name nicely
  const formatted = fnName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return { label: formatted, description: 'Contract function call' };
};

// Create human-readable event description
const describeEvent = (event: any): string => {
  const topics = event.topics || [];
  const data = event.data;

  if (topics.length === 0) return 'Contract event occurred';

  const eventType = topics[0];
  // Handle different event type formats
  let eventName = '';
  if (typeof eventType === 'string') {
    eventName = eventType.toLowerCase();
  } else if (Array.isArray(eventType)) {
    // Event type is a byte array - treat as generic event
    eventName = 'event';
  } else if (typeof eventType === 'object') {
    // Event type is an object (likely indexed byte array {0: val, 1: val})
    eventName = 'event';
  }

  // Format the contract ID
  const contractShort = event.contractId && event.contractId !== 'System'
    ? `${event.contractId.substring(0, 4)}…${event.contractId.substring(event.contractId.length - 4)}`
    : 'Contract';

  // Special handling for fn_call events
  if (eventName === 'fn_call' || eventName.includes('call')) {
    const parts: string[] = [];

    // Extract function name from topics if available
    if (topics.length > 1) {
      const fnName = formatValue(topics[1]);
      const fnInfo = getFunctionLabel(fnName);
      parts.push(fnInfo.label);
    }

    // Format data as parameters
    if (Array.isArray(data)) {
      const params = data.map((val, idx) => {
        const formatted = formatValue(val);
        return `param${idx}: ${formatted}`;
      }).join(', ');
      if (params) parts.push(params);
    } else if (data !== null && data !== undefined) {
      const formatted = formatValue(data);
      if (formatted && formatted !== '[data]') {
        parts.push(`result: ${formatted}`);
      }
    }

    return parts.length > 0
      ? `${contractShort} ${parts.join(' | ')}`
      : `${contractShort} function called`;
  }

  // Common event patterns
  if (eventName.includes('mint')) {
    const amount = formatValue(data);
    const to = topics.length > 1 ? formatValue(topics[1]) : '';
    const asset = topics.length > 2 ? formatValue(topics[2]) : '';

    if (amount && to) {
      return `${contractShort} minted ${amount}${asset ? ' ' + asset : ''} to ${to}`;
    }
    return `${contractShort} minted tokens`;
  }

  if (eventName.includes('transfer')) {
    const from = topics.length > 1 ? formatValue(topics[1]) : '';
    const to = topics.length > 2 ? formatValue(topics[2]) : '';
    const amount = formatValue(data);

    if (from && to && amount) {
      return `Transferred ${amount} from ${from} to ${to}`;
    }
    return `${contractShort} transferred tokens`;
  }

  if (eventName.includes('burn')) {
    const from = topics.length > 1 ? formatValue(topics[1]) : '';
    const amount = formatValue(data);

    if (from && amount) {
      return `${contractShort} burned ${amount} from ${from}`;
    }
    return `${contractShort} burned tokens`;
  }

  if (eventName.includes('approve')) {
    const owner = topics.length > 1 ? formatValue(topics[1]) : '';
    const spender = topics.length > 2 ? formatValue(topics[2]) : '';
    const amount = formatValue(data);

    if (owner && spender) {
      return `${owner} approved ${spender} to spend ${amount || 'tokens'}`;
    }
    return `${contractShort} approved spending`;
  }

  // Format event name nicely
  const eventLabel = typeof eventType === 'string'
    ? eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : 'Event';

  // Build parameter list from topics (skip first which is event name)
  const topicParams = topics.slice(1).map((topic, idx) => {
    const formatted = formatValue(topic);
    return formatted && formatted !== '[data]' ? `${formatted}` : null;
  }).filter(Boolean);

  // Format data value
  let dataStr = '';
  if (Array.isArray(data)) {
    // If data is an array, format each element
    const dataItems = data.map((val, idx) => {
      const formatted = formatValue(val);
      return formatted && formatted !== '[data]' ? `[${idx}]: ${formatted}` : null;
    }).filter(Boolean);

    if (dataItems.length > 0) {
      dataStr = dataItems.join(', ');
    }
  } else if (data !== null && data !== undefined) {
    const formatted = formatValue(data);
    if (formatted && formatted !== '[data]') {
      dataStr = formatted;
    }
  }

  // Combine everything
  const parts: string[] = [contractShort, eventLabel];

  if (topicParams.length > 0) {
    parts.push(`(${topicParams.join(', ')})`);
  }

  if (dataStr) {
    parts.push(`→ ${dataStr}`);
  }

  return parts.join(' ');
};

interface OperationNodeProps {
  data: {
    type: string;
    operation: any;
    amount?: string;
    asset?: string;
    from?: string;
    to?: string;
    destination?: string;
    startingBalance?: string;
    account?: string;
    trustor?: string;
    authorize?: boolean;
    limit?: string;
    homeDomain?: string;
    setFlags?: number;
    clearFlags?: number;
    masterWeight?: number;
    lowThreshold?: number;
    medThreshold?: number;
    highThreshold?: number;
    signer?: any;
    error?: string;
    contractId?: string;
    functionName?: string;
    args?: any[];
    auth?: any[];
    result?: any;
    events?: any[];
    hostFunctionType?: string;
    footprint?: any;
    resourceFee?: string;
    sourceAccount?: string;
    funder?: string;
    minimumBalance?: string;
    sequence?: string;
    assetIssuer?: string;
    memo?: string;
    memoType?: string;
    setFlagNames?: string[];
    clearFlagNames?: string[];
    assetCode?: string;
    sponsor?: string;
    sponsoredId?: string;
    action?: string;
    isExecuting?: boolean;
    executionState?: 'pending' | 'executing' | 'completed' | 'failed';
    sendAmount?: string;
    sendMax?: string;
    sendAsset?: string;
    destAmount?: string;
    destMin?: string;
    destAsset?: string;
    path?: any[];
    selling?: string;
    buying?: string;
    price?: string;
    offerId?: string;
    buyAmount?: string;
    bumpTo?: string;
    inflationDest?: string;
    sorobanOperation?: {
      functionName: string;
      args: any[];
      result?: any;
      error?: string;
      events?: any[];
    };
    resourceUsage?: {
      refundableFee?: number;
      nonRefundableFee?: number;
      rentFee?: number;
    };
    stateChanges?: any[];
    ttlExtensions?: any[];
  };
}

export function OperationNodeComponent({ data }: OperationNodeProps) {
  const getIcon = () => {
    // Check for specific contract functions
    if (data.type === 'invoke_host_function' || data.type === 'invokeHostFunction') {
      return <span className="text-2xl">🧱</span>;
    }

    switch (data.type) {
      case 'payment':
      case 'path_payment_strict_receive':
      case 'path_payment_strict_send':
        return <span className="text-2xl">💸</span>;
      case 'create_account':
        return <span className="text-2xl">🆕</span>;
      case 'change_trust':
        return <span className="text-2xl">🔗</span>;
      case 'create_claimable_balance':
      case 'claim_claimable_balance':
        return <span className="text-2xl">🎁</span>;
      case 'manage_data':
        return <span className="text-2xl">✏️</span>;
      case 'manage_offer':
      case 'manage_sell_offer':
      case 'manage_buy_offer':
      case 'create_passive_sell_offer':
        return <span className="text-2xl">🔁</span>;
      case 'begin_sponsoring_future_reserves':
        return <span className="text-2xl">🅢</span>;
      case 'end_sponsoring_future_reserves':
        return <span className="text-2xl">✅</span>;
      case 'revoke_sponsorship':
        return <span className="text-2xl">❌</span>;
      case 'set_options':
      case 'bump_sequence':
      case 'set_trust_line_flags':
      case 'allow_trust':
      case 'account_merge':
        return <span className="text-2xl">🔐</span>;
      default:
        return <span className="text-2xl">⚙️</span>;
    }
  };

  const formatAccountId = (accountId: string) => {
    if (!accountId) return '';
    return `${accountId.slice(0, 4)}...${accountId.slice(-4)}`;
  };

  const formatAsset = (assetType: string, assetCode?: string, assetIssuer?: string) => {
    if (assetType === 'native') {
      return 'XLM';
    }
    if (assetCode) {
      return assetIssuer ? `${assetCode}:${formatAccountId(assetIssuer)}` : assetCode;
    }
    return 'Unknown Asset';
  };

  const formatPrice = (price: string | number) => {
    if (!price) return 'N/A';
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return numPrice.toFixed(6);
  };

  const formatAmount = (amount: string | number) => {
    if (!amount) return '0';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return numAmount.toLocaleString(undefined, { maximumFractionDigits: 7 });
  };

  const getOperationDetails = () => {
    switch (data.type) {
      case 'invoke_host_function':
      case 'invokeHostFunction':
        // Extract the real function name from args
        // For InvokeContract, args[1] is typically the function name symbol
        let functionName = data.functionName || data.function || '';

        // If functionName is the host function type (like "InvokeContract"),
        // try to extract the real function name from args
        if (functionName === 'InvokeContract' || functionName.includes('HostFunctionType')) {
          // Check if args[1] looks like a function name (string without "G" or "C" prefix)
          if (data.args && data.args[1] && typeof data.args[1] === 'string' &&
              !data.args[1].startsWith('G') && !data.args[1].startsWith('C')) {
            functionName = data.args[1];
          }
        }

        // Clean up hostFunctionType if it appears as functionName
        functionName = cleanHostFunctionType(functionName);
        const fnInfo = functionName ? getFunctionLabel(functionName) : null;

        // Format compact operation summary
        const caller = data.auth && data.auth[0]?.credentials?.address
          ? formatAccountId(data.auth[0].credentials.address)
          : data.sourceAccount
          ? formatAccountId(data.sourceAccount)
          : 'Unknown';
        const contract = data.contractId && data.contractId.startsWith('C')
          ? formatAccountId(data.contractId)
          : 'Unknown';
        const func = functionName || 'unknown';

        // For the args display, skip the first 2 args if they are contract address and function name
        const allArgs = data.args || [];
        const args = (functionName !== 'InvokeContract' && allArgs.length > 2 &&
                     allArgs[0]?.startsWith && (allArgs[0].startsWith('C') || allArgs[0].startsWith('G')) &&
                     typeof allArgs[1] === 'string')
                    ? allArgs.slice(2)  // Skip contract and function name
                    : allArgs;

        return (
          <div className="space-y-4">
            {/* BOX 1: Invoke Contract - Caller & Contract */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1.5">Caller:</div>
                <code className="block bg-white px-2 py-1.5 rounded border border-slate-300 font-mono break-all text-slate-900 text-xs">
                  {data.auth && data.auth[0]?.credentials?.address || data.sourceAccount || 'Unknown'}
                </code>
              </div>

              {data.contractId && data.contractId.startsWith('C') && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">Contract:</div>
                  <code className="block bg-white px-2 py-1.5 rounded border border-slate-300 font-mono break-all text-slate-900 text-xs">
                    {data.contractId}
                  </code>
                </div>
              )}
            </div>

            {/* BOX 2: Function Call */}
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <div className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                <span>🔵</span>
                <span>FUNCTION CALL</span>
              </div>

              {/* JSON Structure Display */}
              <div className="font-mono text-xs">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-3 border-2 border-cyan-500/30">
                  {/* Contract address header */}
                  <div className="text-xs text-cyan-400 font-semibold mb-2 break-all">
                    Contract: <span className="font-mono text-emerald-400">{contract}</span>
                  </div>

                  <div className="text-slate-400">{'{'}</div>

                  {/* fn_call section */}
                  <div className="ml-3">
                    <div className="text-orange-400">"fn_call"<span className="text-slate-400">: {'{'}</span></div>

                    {/* topics */}
                    <div className="ml-3">
                      <div className="text-pink-400">"topics"<span className="text-slate-400">: [</span></div>
                      <div className="ml-3 space-y-0.5">
                        <div className="text-emerald-300">"{functionName || 'unknown'}",</div>
                        <div className="text-emerald-300">"{caller}"</div>
                      </div>
                      <div className="text-slate-400">],</div>
                    </div>

                    {/* data */}
                    <div className="ml-3">
                      <div className="text-pink-400">"data"<span className="text-slate-400">: [</span></div>
                      {args.length > 0 ? (
                        <div className="ml-3 space-y-0.5">
                          {args.map((arg: any, idx: number) => {
                            const cleanSymSuffix = (str: string): string => str.replace(/"sym$/g, '"');
                            const formattedArg = cleanSymSuffix(formatValueWithType(arg, 80));
                            return (
                              <div key={idx} className="text-yellow-300">
                                "{formattedArg}"{idx < args.length - 1 ? ',' : ''}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="ml-3 text-slate-500 italic">// no arguments</div>
                      )}
                      <div className="text-slate-400">]</div>
                    </div>

                    <div className="text-slate-400">{'}'}{data.result || data.returnValue ? ',' : ''}</div>
                  </div>

                  {/* fn_return section */}
                  {(data.result || data.returnValue) && (
                    <div className="ml-3">
                      <div className="text-orange-400">"fn_return"<span className="text-slate-400">: {'{'}</span></div>
                      <div className="ml-3">
                        <div className="text-pink-400">"data"<span className="text-slate-400">: [</span></div>
                        <div className="ml-3">
                          <div className="text-green-300">
                            "{(() => {
                              const cleanSymSuffix = (str: string): string => str.replace(/"sym$/g, '"');
                              return cleanSymSuffix(formatValueWithType(data.result || data.returnValue, 80));
                            })()}"
                          </div>
                        </div>
                        <div className="text-slate-400">]</div>
                      </div>
                      <div className="text-slate-400">{'}'}</div>
                    </div>
                  )}

                  <div className="text-slate-400">{'}'}</div>
                </div>
              </div>
            </div>

            {/* BOX 3: Contract Events */}
            {(() => {
              // Separate core_metrics from other events
              const coreMetricsEvents = data.events?.filter((event: any) => {
                const eventName = event.topics?.[0];
                return eventName === 'core_metrics' ||
                       (typeof eventName === 'string' && eventName.toLowerCase().includes('core_metrics'));
              }) || [];
              const regularEvents = data.events?.filter((event: any) => {
                const eventName = event.topics?.[0];
                return !(eventName === 'core_metrics' ||
                       (typeof eventName === 'string' && eventName.toLowerCase().includes('core_metrics')));
              }) || [];

              return (
                <>
                  {/* Contract Events Box */}
                  {regularEvents.length > 0 && (
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                      <div className="text-xs font-bold text-purple-700 mb-2 flex items-center gap-1.5">
                        <span>🟪</span>
                        <span>CONTRACT EVENTS ({regularEvents.length})</span>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                          {(() => {
                            // Group fn_call events with their matching fn_return
                            const grouped: any[] = [];
                            const usedIndices = new Set<number>();

                            // Debug: log all events to see structure
                            console.log('=== All Regular Events ===', regularEvents.length, 'events');
                            regularEvents.forEach((e: any, idx: number) => {
                              console.log(`[${idx}]`, {
                                type: e.topics?.[0],
                                topics_1_raw: e.topics?.[1],
                                topics_1_decoded: e.topics?.[1] ? decodeContractId(e.topics[1]) : null,
                                topics_2: e.topics?.[2],
                                topics: e.topics,
                                data: e.data,
                                contractId: e.contractId
                              });
                            });

                            for (let i = 0; i < regularEvents.length; i++) {
                              if (usedIndices.has(i)) continue;

                              const event = regularEvents[i];
                              const eventType = event.topics?.[0];

                              if (eventType === 'fn_call') {
                                const fnName = event.topics?.[2];
                                let returnEvent = null;
                                let returnIndex = -1;

                                console.log(`Looking for fn_return matching fn_call "${fnName}"`);

                                // Track nesting depth to find the MATCHING fn_return
                                let depth = 0;
                                for (let j = i + 1; j < regularEvents.length; j++) {
                                  if (usedIndices.has(j)) continue;
                                  const nextEvent = regularEvents[j];
                                  const nextType = nextEvent.topics?.[0];

                                  console.log(`  Checking [${j}]: ${nextType}, fn: ${nextEvent.topics?.[1] || nextEvent.topics?.[2]}, depth: ${depth}`);

                                  if (nextType === 'fn_call') {
                                    // Nested call, increase depth
                                    depth++;
                                    console.log(`    -> Nested fn_call, depth now: ${depth}`);
                                  } else if (nextType === 'fn_return') {
                                    if (depth === 0 && nextEvent.topics?.[1] === fnName) {
                                      // This is OUR return (at our depth level)
                                      console.log(`  ✓ MATCH FOUND at depth 0!`);
                                      returnEvent = nextEvent;
                                      returnIndex = j;
                                      break;
                                    } else if (depth > 0) {
                                      // This is a return for a nested call
                                      depth--;
                                      console.log(`    -> Nested fn_return, depth now: ${depth}`);
                                    }
                                  }
                                }

                                if (returnIndex !== -1) {
                                  usedIndices.add(returnIndex);
                                }

                                console.log(`Result: ${returnEvent ? 'PAIRED' : 'NO RETURN'}`);
                                grouped.push({ call: event, return: returnEvent });
                              } else if (eventType !== 'fn_return') {
                                // Only add non-fn_return events (fn_return should only appear paired)
                                grouped.push({ event });
                              }
                              // Skip standalone fn_return events (orphaned)
                            }

                            return grouped.map((item, idx) => {
                              // Grouped fn_call + fn_return
                              if (item.call) {
                                const callEvent = item.call;
                                const returnEvent = item.return;

                                const functionName = callEvent.topics?.[2];
                                // Use the event's contractId directly - it's already correctly extracted by the API
                                const contractAddress = callEvent.contractId && callEvent.contractId !== 'System'
                                  ? callEvent.contractId
                                  : data.contractId; // Fallback to operation contract

                                console.log(`🎯 Displaying fn_call #${idx}:`, {
                                  functionName,
                                  'callEvent.contractId': callEvent.contractId,
                                  'data.contractId': data.contractId,
                                  'selected contractAddress': contractAddress
                                });
                                // The caller (invoking account/contract) is in data[0]
                                const callerAddress = Array.isArray(callEvent.data) ? callEvent.data[0] : null;
                                // All arguments start from data index 1 (skip the caller at index 0)
                                const args = Array.isArray(callEvent.data) ? callEvent.data.slice(1) : [];
                                // Get return value - handle both single values and arrays
                                const returnValue = returnEvent?.data;
                                const hasReturn = returnEvent && returnValue !== undefined && returnValue !== null && returnValue !== 'void';

                                // Helper to remove "sym" suffix from strings
                                const cleanSymSuffix = (str: string): string => str.replace(/"sym$/g, '"');

                                // Build JSON structure
                                const fnCallTopics = [functionName, cleanSymSuffix(formatValueWithType(callerAddress, 80))];
                                const fnCallData = args.map(a => cleanSymSuffix(formatValueWithType(a, 80)));

                                return (
                                  <div key={idx} className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-lg border-2 border-cyan-500/30 p-3">
                                    {/* Contract address header */}
                                    <div className="text-xs text-cyan-400 font-semibold mb-2 break-all">
                                      Contract: <span className="font-mono text-emerald-400">{contractAddress}</span>
                                    </div>

                                    {/* JSON Structure Display */}
                                    <div className="font-mono text-xs">
                                      <div className="bg-black/40 rounded-lg p-2 border border-cyan-500/20">
                                        <div className="text-slate-400">{'{'}</div>

                                        {/* fn_call section */}
                                        <div className="ml-3">
                                          <div className="text-orange-400">"fn_call"<span className="text-slate-400">: {'{'}</span></div>

                                          {/* topics */}
                                          <div className="ml-3">
                                            <div className="text-pink-400">"topics"<span className="text-slate-400">: [</span></div>
                                            <div className="ml-3 space-y-0.5">
                                              {fnCallTopics.map((topic, i) => (
                                                <div key={i} className="text-emerald-300">
                                                  "{topic}"{i < fnCallTopics.length - 1 ? ',' : ''}
                                                </div>
                                              ))}
                                            </div>
                                            <div className="text-slate-400">],</div>
                                          </div>

                                          {/* data */}
                                          <div className="ml-3">
                                            <div className="text-pink-400">"data"<span className="text-slate-400">: [</span></div>
                                            <div className="ml-3 space-y-0.5">
                                              {fnCallData.map((dataItem, i) => (
                                                <div key={i} className="text-yellow-300">
                                                  "{dataItem}"{i < fnCallData.length - 1 ? ',' : ''}
                                                </div>
                                              ))}
                                            </div>
                                            <div className="text-slate-400">]</div>
                                          </div>

                                          <div className="text-slate-400">{'}'}{hasReturn ? ',' : ''}</div>
                                        </div>

                                        {/* fn_return section */}
                                        {hasReturn && (
                                          <div className="ml-3">
                                            <div className="text-orange-400">"fn_return"<span className="text-slate-400">: {'{'}</span></div>
                                            <div className="ml-3">
                                              <div className="text-pink-400">"data"<span className="text-slate-400">: [</span></div>
                                              <div className="ml-3">
                                                <div className="text-green-300">
                                                  "{cleanSymSuffix(formatValueWithType(returnValue, 80))}"
                                                </div>
                                              </div>
                                              <div className="text-slate-400">]</div>
                                            </div>
                                            <div className="text-slate-400">{'}'}</div>
                                          </div>
                                        )}

                                        <div className="text-slate-400">{'}'}</div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              // Standalone event (not fn_call/fn_return)
                              const event = item.event;
                              const eventType = event.topics?.[0] && typeof event.topics[0] === 'string'
                                ? event.topics[0]
                                : (event.type || event.name || 'contract');

                              return (
                                <div key={idx} className="bg-white p-2 rounded border border-purple-200">
                                  <div className="font-mono text-xs text-purple-900 font-bold mb-1">
                                    {eventType}
                                  </div>
                                  {event.topics && event.topics.length > 1 && (
                                    <div className="mt-1">
                                      <div className="text-xs text-purple-700 font-semibold mb-0.5">Topics:</div>
                                      <div className="ml-2 space-y-0.5 text-xs text-purple-800">
                                        {event.topics.slice(1).map((topic: any, topicIdx: number) => (
                                          <div key={topicIdx} className="break-all font-mono">
                                            {formatEventValue(topic)}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {event.data && (
                                    <div className="mt-1">
                                      <div className="text-xs text-purple-700 font-semibold mb-0.5">Data:</div>
                                      <div className="ml-2 text-xs text-purple-800 break-all font-mono">
                                        {formatEventValue(event.data)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            });
                          })()}
                      </div>
                    </div>
                  )}

                  {/* Contract Metrics Box */}
                  {coreMetricsEvents.length > 0 && (
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                      <div className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
                        <span>📊</span>
                        <span>CONTRACT METRICS ({coreMetricsEvents.length})</span>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {coreMetricsEvents.map((event: any, idx: number) => {
                          // Core metrics structure: topics = ['core_metrics', 'metric_name'], data = value
                          const metricName = event.topics?.[1] || 'unknown';
                          const metricValue = event.data;

                          return (
                            <div key={idx} className="bg-white p-2 rounded border border-amber-200 text-xs">
                              <div className="font-mono text-amber-700 font-semibold">
                                {metricName}: <span className="text-amber-900">{formatEventValue(metricValue)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* BOX: Ledger Effects */}
            {(data.effects && data.effects.length > 0) || (data.stateChanges && data.stateChanges.length > 0) ? (
              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                <div className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1.5">
                  <span>🟩</span>
                  <span>LEDGER EFFECTS ({data.effects?.length || data.stateChanges?.length || 0})</span>
                </div>
                {data.effects && data.effects.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {data.effects.map((effect: any, idx: number) => {
                    const contractId = effect.contractId || 'Unknown';
                    const contractShort = contractId.length > 12
                      ? `${contractId.slice(0, 4)}…${contractId.slice(-4)}`
                      : contractId;

                    const actionType = effect.type || 'updated';
                    const storageType = effect.storageType || 'data';
                    const keyDisplay = effect.keyDisplay || effect.key || '';

                    const dataToShow = effect.after !== undefined ? effect.after : effect.value;
                    const hasData = dataToShow !== undefined && dataToShow !== null && dataToShow !== 'ContractInstance';

                    return (
                      <div key={idx} className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200 text-xs shadow-sm">
                        <div className="flex items-start gap-2">
                          <div className="text-green-600 mt-0.5">🟢</div>
                          <div className="flex-1">
                            <div className="font-semibold text-green-900 mb-1.5 leading-tight">
                              Contract {contractShort} {actionType} {storageType} data {keyDisplay}
                            </div>
                            {hasData && (
                              <div className="ml-0.5">
                                <div className="text-green-700 font-mono text-[11px] bg-white/60 p-2 rounded border border-green-200 leading-relaxed">
                                  = {formatValueWithType(dataToShow, 80)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
              ) : data.stateChanges && data.stateChanges.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {data.stateChanges.map((change: any, idx: number) => {
                    const contractId = change.contractId || 'Unknown';
                    const contractShort = contractId.length > 12
                      ? `${contractId.slice(0, 4)}…${contractId.slice(-4)}`
                      : contractId;

                    const actionType = change.type || 'updated';
                    const storageType = change.storageType || 'data';
                    const keyDisplay = change.keyDisplay || change.key || '';

                    const dataToShow = change.after !== undefined ? change.after : change.value;
                    const hasData = dataToShow !== undefined && dataToShow !== null && dataToShow !== 'ContractInstance';

                    return (
                      <div key={idx} className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200 text-xs shadow-sm">
                        <div className="flex items-start gap-2">
                          <div className="text-green-600 mt-0.5">🟢</div>
                          <div className="flex-1">
                            <div className="font-semibold text-green-900 mb-1.5 leading-tight">
                              Contract {contractShort} {actionType} {storageType} data {keyDisplay}
                            </div>
                            {hasData && (
                              <div className="ml-0.5">
                                <div className="text-green-700 font-mono text-[11px] bg-white/60 p-2 rounded border border-green-200 leading-relaxed">
                                  = {formatValueWithType(dataToShow, 80)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              </div>
            ) : null}
          </div>
        );

      case 'create_account':
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-blue-600">Creating account</span>
            </p>
            {data.destination && (
              <p className="text-sm text-gray-600 break-words">
                For: <span className="font-mono text-blue-600">{data.destination}</span>
              </p>
            )}
            {!data.destination && (
              <p className="text-sm text-red-500 break-words">
                For: <span className="font-mono">Unknown destination</span>
              </p>
            )}
            {data.startingBalance && (
              <p className="text-sm text-gray-600 break-words">
                Starting Balance: <span className="font-medium text-green-600">{data.startingBalance} XLM</span>
              </p>
            )}
            {!data.startingBalance && (
              <p className="text-sm text-red-500 break-words">
                Starting Balance: <span className="font-medium">Unknown amount</span>
              </p>
            )}
            <p className="text-sm text-gray-600 break-words">
              Funded by: <span className="font-mono text-orange-600">{formatAccountId(data.funder || data.sourceAccount || '')}</span>
            </p>
            {data.minimumBalance && (
              <p className="text-sm text-gray-500 italic break-words">
                Min reserve: {data.minimumBalance} XLM
              </p>
            )}
            {data.sequence && (
              <p className="text-sm text-gray-500 break-words">
                Sequence: <span className="font-mono">{data.sequence}</span>
              </p>
            )}
          </div>
        );

      case 'payment':
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-green-600">Payment Transfer</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              From: <span className="font-mono text-blue-600">{formatAccountId(data.from || '')}</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              To: <span className="font-mono text-blue-600">{formatAccountId(data.to || '')}</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Amount: <span className="font-medium text-green-600">{data.amount} {data.asset}</span>
            </p>
            {data.assetIssuer && data.asset !== 'XLM' && (
              <p className="text-sm text-gray-500 break-words">
                Issuer: <span className="font-mono">{formatAccountId(data.assetIssuer)}</span>
              </p>
            )}
            {data.memo && (
              <p className="text-sm text-gray-500 italic break-words">
                Memo: {data.memo}
              </p>
            )}
            {data.memoType && (
              <p className="text-sm text-gray-500 break-words">
                Memo Type: <span className="font-mono">{data.memoType}</span>
              </p>
            )}
          </div>
        );

      case 'set_trust_line_flags':
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-red-600">Set Trustline Flags</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Issuer: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              For: <span className="font-mono text-blue-600">{formatAccountId(data.trustor || '')}</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Asset: <span className="font-medium text-green-600">{data.assetCode}</span>
            </p>
            {data.setFlagNames && data.setFlagNames.length > 0 && (
              <p className="text-sm text-green-600 break-words">
                ✅ Set: {data.setFlagNames.join(', ')}
              </p>
            )}
            {data.clearFlagNames && data.clearFlagNames.length > 0 && (
              <p className="text-sm text-red-600 break-words">
                ❌ Clear: {data.clearFlagNames.join(', ')}
              </p>
            )}
          </div>
        );

      case 'manage_sell_offer':
      case 'manage_offer':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-yellow-600">
                {data.offerId && data.offerId !== '0' ? 'Update Sell Offer' : 'Create Sell Offer'}
              </span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Trader: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>
            
            {/* Selling Details */}
            <div className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">Selling</span>
              </div>
              <p className="text-sm text-red-700 break-words">
                <span className="font-bold text-lg">{formatAmount(data.amount || data.selling_amount || '0')}</span>
                <span className="ml-2 font-medium">
                  {formatAsset(data.selling_asset_type || 'native', data.selling_asset_code, data.selling_asset_issuer)}
                </span>
              </p>
            </div>

            {/* Buying Details */}
            <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">Buying</span>
              </div>
              <p className="text-sm text-green-700 break-words">
                <span className="font-medium">
                  {formatAsset(data.buying_asset_type || 'native', data.buying_asset_code, data.buying_asset_issuer)}
                </span>
              </p>
            </div>

            {/* Price Details */}
            <div className="bg-blue-50 p-2 rounded">
              <p className="text-sm text-blue-700 break-words">
                <span className="font-medium">Price:</span> 
                <span className="font-bold ml-1">{formatPrice(data.price || '0')}</span>
                <span className="text-xs text-blue-600 ml-1">
                  {formatAsset(data.buying_asset_type || 'native', data.buying_asset_code, data.buying_asset_issuer)} per {formatAsset(data.selling_asset_type || 'native', data.selling_asset_code, data.selling_asset_issuer)}
                </span>
              </p>
            </div>

            {data.offerId && data.offerId !== '0' && (
              <p className="text-sm text-gray-600 break-words">
                Offer ID: <span className="font-mono text-purple-600">{data.offerId}</span>
              </p>
            )}
          </div>
        );

      case 'manage_buy_offer':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-yellow-600">
                {data.offerId && data.offerId !== '0' ? 'Update Buy Offer' : 'Create Buy Offer'}
              </span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Trader: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>
            
            {/* Buying Details */}
            <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">Buying</span>
              </div>
              <p className="text-sm text-green-700 break-words">
                <span className="font-bold text-lg">{formatAmount(data.buyAmount || data.amount || '0')}</span>
                <span className="ml-2 font-medium">
                  {formatAsset(data.buying_asset_type || 'native', data.buying_asset_code, data.buying_asset_issuer)}
                </span>
              </p>
            </div>

            {/* Selling Details */}
            <div className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">Selling</span>
              </div>
              <p className="text-sm text-red-700 break-words">
                <span className="font-medium">
                  {formatAsset(data.selling_asset_type || 'native', data.selling_asset_code, data.selling_asset_issuer)}
                </span>
              </p>
            </div>

            {/* Price Details */}
            <div className="bg-blue-50 p-2 rounded">
              <p className="text-sm text-blue-700 break-words">
                <span className="font-medium">Price:</span> 
                <span className="font-bold ml-1">{formatPrice(data.price || '0')}</span>
                <span className="text-xs text-blue-600 ml-1">
                  {formatAsset(data.selling_asset_type || 'native', data.selling_asset_code, data.selling_asset_issuer)} per {formatAsset(data.buying_asset_type || 'native', data.buying_asset_code, data.buying_asset_issuer)}
                </span>
              </p>
            </div>

            {data.offerId && data.offerId !== '0' && (
              <p className="text-sm text-gray-600 break-words">
                Offer ID: <span className="font-mono text-purple-600">{data.offerId}</span>
              </p>
            )}
          </div>
        );

      case 'create_passive_sell_offer':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-yellow-600">Create Passive Sell Offer</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Trader: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>
            
            {/* Selling Details */}
            <div className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">Selling (Passive)</span>
              </div>
              <p className="text-sm text-red-700 break-words">
                <span className="font-bold text-lg">{formatAmount(data.amount || '0')}</span>
                <span className="ml-2 font-medium">
                  {formatAsset(data.selling_asset_type || 'native', data.selling_asset_code, data.selling_asset_issuer)}
                </span>
              </p>
            </div>

            {/* Buying Details */}
            <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">Buying</span>
              </div>
              <p className="text-sm text-green-700 break-words">
                <span className="font-medium">
                  {formatAsset(data.buying_asset_type || 'native', data.buying_asset_code, data.buying_asset_issuer)}
                </span>
              </p>
            </div>

            {/* Price Details */}
            <div className="bg-blue-50 p-2 rounded">
              <p className="text-sm text-blue-700 break-words">
                <span className="font-medium">Price:</span> 
                <span className="font-bold ml-1">{formatPrice(data.price || '0')}</span>
              </p>
            </div>

            <div className="bg-yellow-50 p-2 rounded border-l-2 border-yellow-400">
              <p className="text-xs text-yellow-700">
                ℹ️ Passive offer - won't consume existing offers at this price
              </p>
            </div>
          </div>
        );

      case 'path_payment_strict_send':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-blue-600">Path Payment (Strict Send)</span>
            </p>

            {/* Account Information */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-xs text-gray-500 mb-1">From</p>
                <p className="text-sm font-mono text-blue-600 break-all">
                  {formatAccountId(data.from || data.sourceAccount || '')}
                </p>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-xs text-gray-500 mb-1">To</p>
                <p className="text-sm font-mono text-blue-600 break-all">
                  {formatAccountId(data.to || data.destination || '')}
                </p>
              </div>
            </div>

            {/* Send Details */}
            <div className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">Sending (Exact Amount)</span>
              </div>
              <p className="text-sm text-red-700 break-words">
                <span className="font-bold text-lg">{formatAmount(data.source_amount || '0')}</span>
                <span className="ml-2 font-medium">
                  {formatAsset(
                    data.source_asset_type || 'native',
                    data.source_asset_code,
                    data.source_asset_issuer
                  )}
                </span>
              </p>
            </div>

            {/* Receive Details */}
            <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">Receiving (Minimum)</span>
              </div>
              <p className="text-sm text-green-700 break-words mb-1">
                <span className="font-bold text-lg">≥ {formatAmount(data.destination_min || '0')}</span>
                <span className="ml-2 font-medium">
                  {formatAsset(
                    data.asset_type || 'native',
                    data.asset_code,
                    data.asset_issuer
                  )}
                </span>
              </p>
              <p className="text-xs text-green-600">
                ✓ Actually received: <span className="font-bold">{formatAmount(data.amount || '0')}</span>
              </p>
            </div>

            {/* Path Details */}
            {data.path && data.path.length > 0 && (
              <div className="bg-purple-50 p-3 rounded-lg border-l-2 border-purple-400">
                <div className="flex items-center gap-2 mb-2">
                  <Repeat className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-700">Trading Path</span>
                </div>
                <p className="text-xs text-purple-600 mb-2">{data.path.length} intermediate {data.path.length === 1 ? 'hop' : 'hops'}</p>
                <div className="space-y-1">
                  <div className="flex items-center text-xs">
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-medium">
                      {formatAsset(
                        data.send_asset_type || data.source_asset_type || 'native',
                        data.send_asset_code || data.source_asset_code,
                        data.send_asset_issuer || data.source_asset_issuer
                      )}
                    </span>
                    <ArrowRight className="w-3 h-3 mx-1 text-purple-500" />
                  </div>
                  {data.path.map((asset: any, index: number) => (
                    <div key={index} className="flex items-center text-xs ml-4">
                      <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded font-mono">
                        {formatAsset(asset.asset_type, asset.asset_code, asset.asset_issuer)}
                      </span>
                      {index < data.path.length - 1 && <ArrowRight className="w-3 h-3 mx-1 text-purple-500" />}
                    </div>
                  ))}
                  <div className="flex items-center text-xs ml-4">
                    {data.path.length > 0 && <ArrowRight className="w-3 h-3 mr-1 text-purple-500" />}
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-medium">
                      {formatAsset(
                        data.dest_asset_type || data.asset_type || 'native',
                        data.dest_asset_code || data.asset_code,
                        data.dest_asset_issuer || data.asset_issuer
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Details */}
            {(data.transaction_successful !== undefined || data.created_at) && (
              <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 space-y-1">
                {data.transaction_successful !== undefined && (
                  <p>
                    Status: <span className={data.transaction_successful ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {data.transaction_successful ? '✓ Successful' : '✗ Failed'}
                    </span>
                  </p>
                )}
                {data.created_at && (
                  <p>Time: {new Date(data.created_at).toLocaleString()}</p>
                )}
                {data.id && (
                  <p className="font-mono text-xs">ID: {data.id.substring(0, 20)}...</p>
                )}
              </div>
            )}
          </div>
        );

      case 'path_payment_strict_receive':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-blue-600">Path Payment (Strict Receive)</span>
            </p>

            {/* Account Information */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-xs text-gray-500 mb-1">From</p>
                <p className="text-sm font-mono text-blue-600 break-all">
                  {formatAccountId(data.from || data.sourceAccount || '')}
                </p>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-xs text-gray-500 mb-1">To</p>
                <p className="text-sm font-mono text-blue-600 break-all">
                  {formatAccountId(data.to || data.destination || '')}
                </p>
              </div>
            </div>

            {/* Send Details */}
            <div className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">Sending (Maximum)</span>
              </div>
              <p className="text-sm text-red-700 break-words mb-1">
                <span className="font-bold text-lg">≤ {formatAmount(data.source_max || '0')}</span>
                <span className="ml-2 font-medium">
                  {formatAsset(
                    data.source_asset_type || 'native',
                    data.source_asset_code,
                    data.source_asset_issuer
                  )}
                </span>
              </p>
              <p className="text-xs text-red-600">
                ✓ Actually sent: <span className="font-bold">{formatAmount(data.source_amount || '0')}</span>
              </p>
            </div>

            {/* Receive Details */}
            <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">Receiving (Exact Amount)</span>
              </div>
              <p className="text-sm text-green-700 break-words">
                <span className="font-bold text-lg">{formatAmount(data.amount || '0')}</span>
                <span className="ml-2 font-medium">
                  {formatAsset(
                    data.asset_type || 'native',
                    data.asset_code,
                    data.asset_issuer
                  )}
                </span>
              </p>
            </div>

            {/* Path Details */}
            {data.path && data.path.length > 0 && (
              <div className="bg-purple-50 p-3 rounded-lg border-l-2 border-purple-400">
                <div className="flex items-center gap-2 mb-2">
                  <Repeat className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-700">Trading Path</span>
                </div>
                <p className="text-xs text-purple-600 mb-2">{data.path.length} intermediate {data.path.length === 1 ? 'hop' : 'hops'}</p>
                <div className="space-y-1">
                  <div className="flex items-center text-xs">
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-medium">
                      {formatAsset(
                        data.send_asset_type || data.source_asset_type || 'native',
                        data.send_asset_code || data.source_asset_code,
                        data.send_asset_issuer || data.source_asset_issuer
                      )}
                    </span>
                    <ArrowRight className="w-3 h-3 mx-1 text-purple-500" />
                  </div>
                  {data.path.map((asset: any, index: number) => (
                    <div key={index} className="flex items-center text-xs ml-4">
                      <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded font-mono">
                        {formatAsset(asset.asset_type, asset.asset_code, asset.asset_issuer)}
                      </span>
                      {index < data.path.length - 1 && <ArrowRight className="w-3 h-3 mx-1 text-purple-500" />}
                    </div>
                  ))}
                  <div className="flex items-center text-xs ml-4">
                    {data.path.length > 0 && <ArrowRight className="w-3 h-3 mr-1 text-purple-500" />}
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-medium">
                      {formatAsset(
                        data.dest_asset_type || data.asset_type || 'native',
                        data.dest_asset_code || data.asset_code,
                        data.dest_asset_issuer || data.asset_issuer
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Details */}
            {(data.transaction_successful !== undefined || data.created_at) && (
              <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 space-y-1">
                {data.transaction_successful !== undefined && (
                  <p>
                    Status: <span className={data.transaction_successful ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {data.transaction_successful ? '✓ Successful' : '✗ Failed'}
                    </span>
                  </p>
                )}
                {data.created_at && (
                  <p>Time: {new Date(data.created_at).toLocaleString()}</p>
                )}
                {data.id && (
                  <p className="font-mono text-xs">ID: {data.id.substring(0, 20)}...</p>
                )}
              </div>
            )}
          </div>
        );

      case 'begin_sponsoring_future_reserves':
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-purple-600">Starting Sponsorship</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Sponsor: <span className="font-mono text-purple-600">{formatAccountId(data.sponsor || data.sourceAccount || '')}</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              For: <span className="font-mono text-blue-600">{formatAccountId(data.sponsoredId || '')}</span>
            </p>
            <p className="text-sm text-gray-500 italic break-words">
              Will pay reserves
            </p>
          </div>
        );

      case 'end_sponsoring_future_reserves':
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-purple-600">Ending Sponsorship</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              By: <span className="font-mono text-purple-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>
            <p className="text-sm text-gray-500 italic break-words">
              Account pays own reserves
            </p>
          </div>
        );

      case 'revoke_sponsorship':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-purple-600">Revoke Sponsorship</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Source: <span className="font-mono text-purple-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>

            <div className="bg-purple-50 p-3 rounded-lg border-l-4 border-purple-400">
              <p className="text-sm font-medium text-purple-700 mb-2">Revoking Sponsorship For:</p>

              {data.operation?.account_id && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Account:</p>
                  <p className="text-sm font-mono text-purple-800 break-all">{formatAccountId(data.operation.account_id)}</p>
                </div>
              )}

              {data.operation?.claimable_balance_id && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Claimable Balance:</p>
                  <p className="text-sm font-mono text-purple-800 break-all">{data.operation.claimable_balance_id}</p>
                </div>
              )}

              {data.operation?.data_account_id && data.operation?.data_name && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Data Entry:</p>
                  <p className="text-sm text-purple-800">
                    Name: <span className="font-mono">{data.operation.data_name}</span>
                  </p>
                  <p className="text-sm font-mono text-purple-800 break-all">
                    Account: {formatAccountId(data.operation.data_account_id)}
                  </p>
                </div>
              )}

              {data.operation?.offer_id && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Offer:</p>
                  <p className="text-sm font-mono text-purple-800">ID: {data.operation.offer_id}</p>
                  {data.operation.seller && (
                    <p className="text-sm text-purple-800">
                      Seller: <span className="font-mono">{formatAccountId(data.operation.seller)}</span>
                    </p>
                  )}
                </div>
              )}

              {data.operation?.trustline_account_id && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Trustline:</p>
                  <p className="text-sm font-mono text-purple-800 break-all">{formatAccountId(data.operation.trustline_account_id)}</p>
                  {data.operation.trustline_asset && (
                    <p className="text-sm text-purple-800">
                      Asset: <span className="font-medium">{data.operation.trustline_asset}</span>
                    </p>
                  )}
                </div>
              )}

              {data.operation?.signer_account_id && data.operation?.signer_key && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Signer:</p>
                  <p className="text-sm font-mono text-purple-800 break-all">
                    Account: {formatAccountId(data.operation.signer_account_id)}
                  </p>
                  <p className="text-sm font-mono text-purple-800 break-all">
                    Key: {formatAccountId(data.operation.signer_key)}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-amber-50 p-2 rounded border-l-2 border-amber-400">
              <p className="text-xs text-amber-700">
                The sponsoring account will no longer pay for the reserves of this ledger entry
              </p>
            </div>
          </div>
        );

      case 'change_trust':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-indigo-600">
                {data.operation?.limit === '0' ? 'Remove Trustline' : (data.limit === '0' ? 'Remove Trustline' : 'Establish Trustline')}
              </span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Trustor: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>

            <div className="bg-indigo-50 p-3 rounded-lg border-l-4 border-indigo-400">
              <p className="text-xs text-indigo-600 font-medium mb-2">Asset Details:</p>

              {data.operation?.asset_type === 'liquidity_pool_shares' ? (
                <div>
                  <p className="text-sm text-indigo-800 font-medium">Liquidity Pool Shares</p>
                  {data.operation?.liquidity_pool_id && (
                    <p className="text-xs font-mono text-indigo-700 break-all mt-1">
                      Pool: {data.operation.liquidity_pool_id}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-indigo-800 font-medium">
                    {data.operation?.asset_code || data.assetCode || 'Unknown Asset'}
                  </p>
                  {(data.operation?.asset_issuer || data.assetIssuer) && (
                    <div className="mt-1">
                      <p className="text-xs text-indigo-600">Issuer:</p>
                      <p className="text-xs font-mono text-indigo-700 break-all">
                        {data.operation?.asset_issuer || data.assetIssuer}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
              <p className="text-xs text-blue-600 font-medium mb-1">Trust Limit:</p>
              {(data.operation?.limit === '922337203685.4775807' || data.limit === '922337203685.4775807') ? (
                <p className="text-sm text-blue-800">
                  <span className="font-bold">Maximum</span>
                  <span className="text-xs text-blue-600 ml-2">(unlimited)</span>
                </p>
              ) : (data.operation?.limit === '0' || data.limit === '0') ? (
                <p className="text-sm text-red-600">
                  <span className="font-bold">0</span>
                  <span className="text-xs text-red-500 ml-2">(removing trustline)</span>
                </p>
              ) : (
                <p className="text-sm text-blue-800 font-bold">
                  {formatAmount(data.operation?.limit || data.limit || '0')}
                </p>
              )}
            </div>

            {(data.operation?.limit === '0' || data.limit === '0') ? (
              <div className="bg-red-50 p-2 rounded border-l-2 border-red-400">
                <p className="text-xs text-red-700">
                  This operation removes the trustline. The account will no longer be able to hold this asset.
                </p>
              </div>
            ) : (
              <div className="bg-green-50 p-2 rounded border-l-2 border-green-400">
                <p className="text-xs text-green-700">
                  This allows the account to receive and hold up to the specified limit of this asset.
                </p>
              </div>
            )}
          </div>
        );

      case 'manage_data':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-cyan-600">
                {data.operation?.value ? 'Set Data Entry' : 'Remove Data Entry'}
              </span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Account: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>

            <div className="bg-cyan-50 p-3 rounded-lg border-l-4 border-cyan-400">
              <p className="text-xs text-cyan-600 font-medium mb-2">Data Entry Name:</p>
              <p className="text-sm font-mono text-cyan-800 break-all bg-cyan-100 px-2 py-1 rounded">
                {data.operation?.name || data.name || 'N/A'}
              </p>
            </div>

            {data.operation?.value ? (
              <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                <p className="text-xs text-blue-600 font-medium mb-2">Value:</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-blue-500 mb-1">Base64:</p>
                    <p className="text-xs font-mono text-blue-800 break-all bg-blue-100 px-2 py-1 rounded max-h-20 overflow-y-auto">
                      {data.operation.value}
                    </p>
                  </div>
                  {(() => {
                    try {
                      const decoded = atob(data.operation.value);
                      return (
                        <div>
                          <p className="text-xs text-blue-500 mb-1">Decoded (UTF-8):</p>
                          <p className="text-xs font-mono text-blue-800 break-all bg-blue-100 px-2 py-1 rounded max-h-20 overflow-y-auto">
                            {decoded}
                          </p>
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                  <p className="text-xs text-blue-600">
                    Size: {data.operation.value.length} bytes (base64)
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
                <p className="text-xs text-red-600 font-medium">No Value (Deletion)</p>
                <p className="text-xs text-red-700 mt-1">
                  This operation removes the data entry from the account.
                </p>
              </div>
            )}

            <div className="bg-gray-50 p-2 rounded border-l-2 border-gray-400">
              <p className="text-xs text-gray-600">
                Data entries allow accounts to store up to 64 bytes of arbitrary data on the ledger.
                Each entry costs 0.5 XLM in base reserve.
              </p>
            </div>
          </div>
        );

      case 'create_claimable_balance':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-emerald-600">Create Claimable Balance</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Sponsor: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>

            <div className="bg-emerald-50 p-3 rounded-lg border-l-4 border-emerald-400">
              <p className="text-xs text-emerald-600 font-medium mb-2">Deposited Amount:</p>
              <p className="text-lg font-bold text-emerald-800 break-words">
                {formatAmount(data.operation?.amount || data.amount || '0')}
                <span className="text-base ml-2 font-medium">
                  {(() => {
                    // Try multiple sources for asset information
                    if (data.operation?.asset_type === 'native' || data.operation?.asset === 'native' || data.asset === 'native') {
                      return 'XLM';
                    }
                    // Try asset_code from operation
                    if (data.operation?.asset_code) {
                      return data.operation.asset_code;
                    }
                    // Try asset from data
                    if (data.asset && data.asset !== 'native') {
                      // If asset contains issuer (e.g., "RICH:GBNN..."), format it
                      if (data.asset.includes(':')) {
                        const [code, issuer] = data.asset.split(':');
                        return `${code}:${formatAccountId(issuer)}`;
                      }
                      return data.asset;
                    }
                    // Try assetCode
                    if (data.assetCode) {
                      return data.assetCode;
                    }
                    // Fallback to formatted asset
                    return formatAsset(
                      data.operation?.asset_type || data.operation?.asset || 'native',
                      data.operation?.asset_code || data.assetCode,
                      data.operation?.asset_issuer || data.assetIssuer
                    );
                  })()}
                </span>
              </p>
              {(data.operation?.asset_issuer || data.assetIssuer) && (
                <p className="text-xs text-emerald-600 mt-1 break-words">
                  Issuer: <span className="font-mono">{formatAccountId(data.operation?.asset_issuer || data.assetIssuer)}</span>
                </p>
              )}
            </div>

            {data.operation?.claimants && data.operation.claimants.length > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                <p className="text-xs text-blue-600 font-medium mb-2">
                  Claimants ({data.operation.claimants.length}):
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {data.operation.claimants.map((claimant: any, idx: number) => (
                    <div key={idx} className="bg-white p-2 rounded border border-blue-200">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs text-blue-600 font-medium">Claimant {idx + 1}</span>
                        {claimant.predicate && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">
                            {typeof claimant.predicate === 'object' ? 'Conditional' : 'Unconditional'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-blue-800 break-all">
                        {formatAccountId(claimant.destination)}
                      </p>
                      {claimant.predicate && typeof claimant.predicate === 'object' && (
                        <div className="mt-1 text-xs text-blue-600">
                          {claimant.predicate.abs_before && (
                            <p>Can claim before: {new Date(claimant.predicate.abs_before).toLocaleString()}</p>
                          )}
                          {claimant.predicate.abs_before_epoch && (
                            <p>Can claim before: {new Date(parseInt(claimant.predicate.abs_before_epoch) * 1000).toLocaleString()}</p>
                          )}
                          {claimant.predicate.not && claimant.predicate.not.abs_before && (
                            <p>Can claim after: {new Date(claimant.predicate.not.abs_before).toLocaleString()}</p>
                          )}
                          {claimant.predicate.not && claimant.predicate.not.abs_before_epoch && (
                            <p>Can claim after: {new Date(parseInt(claimant.predicate.not.abs_before_epoch) * 1000).toLocaleString()}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-amber-50 p-2 rounded border-l-2 border-amber-400">
              <p className="text-xs text-amber-700">
                Creates a balance that can be claimed by authorized claimants based on predicate conditions.
                The sponsor pays the base reserve (0.5 XLM per claimant).
              </p>
            </div>
          </div>
        );

      case 'set_options':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-orange-600">Set Account Options</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Account: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>

            {(data.operation?.inflation_dest || data.inflationDest) && (
              <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                <p className="text-xs text-blue-600 font-medium mb-1">Inflation Destination:</p>
                <p className="text-sm font-mono text-blue-800 break-all">
                  {data.operation?.inflation_dest || data.inflationDest}
                </p>
              </div>
            )}

            {(data.operation?.set_flags !== undefined || data.setFlags !== undefined) && (
              <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
                <p className="text-xs text-green-600 font-medium mb-2">Setting Flags:</p>
                {data.setFlagNames && data.setFlagNames.length > 0 ? (
                  <ul className="space-y-1">
                    {data.setFlagNames.map((flag: string, idx: number) => (
                      <li key={idx} className="text-sm text-green-800 flex items-center gap-1">
                        <span className="text-green-600">✓</span> {flag}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-green-800">
                    Flags value: {data.operation?.set_flags || data.setFlags}
                  </p>
                )}
                {(data.operation?.set_flags_s || data.setFlagNames) && (
                  <div className="mt-2 text-xs text-green-600 space-y-1">
                    {(data.operation?.set_flags_s || data.setFlagNames || []).includes('AUTH_REQUIRED') ||
                     (data.operation?.set_flags_s || data.setFlagNames || []).includes('auth_required') ? (
                      <p>• Requires authorization for trustlines</p>
                    ) : null}
                    {(data.operation?.set_flags_s || data.setFlagNames || []).includes('AUTH_REVOCABLE') ||
                     (data.operation?.set_flags_s || data.setFlagNames || []).includes('auth_revocable') ? (
                      <p>• Can revoke trustline authorization</p>
                    ) : null}
                    {(data.operation?.set_flags_s || data.setFlagNames || []).includes('AUTH_IMMUTABLE') ||
                     (data.operation?.set_flags_s || data.setFlagNames || []).includes('auth_immutable') ? (
                      <p>• Authorization flags cannot be changed</p>
                    ) : null}
                    {(data.operation?.set_flags_s || data.setFlagNames || []).includes('AUTH_CLAWBACK_ENABLED') ||
                     (data.operation?.set_flags_s || data.setFlagNames || []).includes('auth_clawback_enabled') ? (
                      <p>• Can clawback assets from holders</p>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {(data.operation?.clear_flags !== undefined || data.clearFlags !== undefined) && (
              <div className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
                <p className="text-xs text-red-600 font-medium mb-2">Clearing Flags:</p>
                {data.clearFlagNames && data.clearFlagNames.length > 0 ? (
                  <ul className="space-y-1">
                    {data.clearFlagNames.map((flag: string, idx: number) => (
                      <li key={idx} className="text-sm text-red-800 flex items-center gap-1">
                        <span className="text-red-600">✗</span> {flag}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-red-800">
                    Flags value: {data.operation?.clear_flags || data.clearFlags}
                  </p>
                )}
              </div>
            )}

            {(data.operation?.master_weight !== undefined || data.masterWeight !== undefined) && (
              <div className="bg-purple-50 p-3 rounded-lg border-l-4 border-purple-400">
                <p className="text-xs text-purple-600 font-medium mb-1">Master Key Weight:</p>
                <p className="text-sm text-purple-800">
                  <span className="font-bold text-lg">{data.operation?.master_weight ?? data.masterWeight}</span>
                  <span className="text-xs text-purple-600 ml-2">(0-255)</span>
                </p>
              </div>
            )}

            {((data.operation?.low_threshold !== undefined || data.lowThreshold !== undefined) ||
              (data.operation?.med_threshold !== undefined || data.medThreshold !== undefined) ||
              (data.operation?.high_threshold !== undefined || data.highThreshold !== undefined)) && (
              <div className="bg-indigo-50 p-3 rounded-lg border-l-4 border-indigo-400">
                <p className="text-xs text-indigo-600 font-medium mb-2">Signature Thresholds:</p>
                <div className="grid grid-cols-3 gap-2">
                  {(data.operation?.low_threshold !== undefined || data.lowThreshold !== undefined) && (
                    <div className="text-center">
                      <p className="text-xs text-indigo-500">Low</p>
                      <p className="text-lg font-bold text-indigo-800">
                        {data.operation?.low_threshold ?? data.lowThreshold}
                      </p>
                    </div>
                  )}
                  {(data.operation?.med_threshold !== undefined || data.medThreshold !== undefined) && (
                    <div className="text-center">
                      <p className="text-xs text-indigo-500">Medium</p>
                      <p className="text-lg font-bold text-indigo-800">
                        {data.operation?.med_threshold ?? data.medThreshold}
                      </p>
                    </div>
                  )}
                  {(data.operation?.high_threshold !== undefined || data.highThreshold !== undefined) && (
                    <div className="text-center">
                      <p className="text-xs text-indigo-500">High</p>
                      <p className="text-lg font-bold text-indigo-800">
                        {data.operation?.high_threshold ?? data.highThreshold}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-2 text-xs text-indigo-600 space-y-1">
                  <p>• Low: Required for Allow Trust, Bump Sequence</p>
                  <p>• Medium: Required for transactions (payments, offers, etc.)</p>
                  <p>• High: Required for Set Options, Account Merge</p>
                </div>
              </div>
            )}

            {(data.operation?.home_domain !== undefined || data.homeDomain !== undefined) && (
              <div className="bg-cyan-50 p-3 rounded-lg border-l-4 border-cyan-400">
                <p className="text-xs text-cyan-600 font-medium mb-1">Home Domain:</p>
                <p className="text-sm text-cyan-800 break-all font-mono">
                  {data.operation?.home_domain || data.homeDomain || '(empty)'}
                </p>
              </div>
            )}

            {(data.operation?.signer_key || data.signer?.key) && (
              <div className="bg-teal-50 p-3 rounded-lg border-l-4 border-teal-400">
                <p className="text-xs text-teal-600 font-medium mb-2">Signer Management:</p>
                <div className="space-y-1">
                  <p className="text-xs text-teal-600">Key:</p>
                  <p className="text-sm font-mono text-teal-800 break-all bg-teal-100 px-2 py-1 rounded">
                    {formatAccountId(data.operation?.signer_key || data.signer?.key || '')}
                  </p>
                  <p className="text-xs text-teal-600 mt-2">Weight:</p>
                  <p className="text-sm text-teal-800">
                    <span className="font-bold text-lg">
                      {data.operation?.signer_weight ?? data.signer?.weight ?? 0}
                    </span>
                    {(data.operation?.signer_weight === 0 || data.signer?.weight === 0) && (
                      <span className="text-xs text-red-600 ml-2">(removing signer)</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 p-2 rounded border-l-2 border-gray-400">
              <p className="text-xs text-gray-600">
                Set Options allows modifying account settings including authorization flags, thresholds, signers, and home domain.
              </p>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-gray-600 capitalize">{data.type.replace(/_/g, ' ')}</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Source: <span className="font-mono text-blue-600">{formatAccountId(data.sourceAccount || '')}</span>
            </p>
          </div>
        );
    }
  };

  const getExecutionStateStyles = () => {
    switch (data.executionState) {
      case 'executing':
        return 'border-blue-500 bg-blue-50 animate-pulse shadow-lg shadow-blue-300';
      case 'completed':
        return 'border-green-500 bg-green-50';
      case 'failed':
        return 'border-red-500 bg-red-50';
      case 'pending':
        return 'border-gray-200 bg-gray-50 opacity-50';
      default:
        return data.error ? 'border-red-200' : 'border-gray-100';
    }
  };

  return (
    <div className={`px-5 py-3 bg-white rounded-xl shadow-md border-2 transition-all duration-300 ${getExecutionStateStyles()} w-auto relative`} style={{ minWidth: '380px', maxWidth: '900px', width: 'fit-content' }}>
      {data.executionState === 'executing' && (
        <div className="absolute -top-1 -right-1">
          <div className="flex items-center justify-center w-6 h-6 bg-blue-500 rounded-full animate-bounce">
            <Zap className="w-3 h-3 text-white" />
          </div>
        </div>
      )}
      {data.executionState === 'completed' && (
        <div className="absolute -top-1 -right-1">
          <div className="flex items-center justify-center w-6 h-6 bg-green-500 rounded-full">
            <span className="text-white text-xs">✓</span>
          </div>
        </div>
      )}
      {data.executionState === 'failed' && (
        <div className="absolute -top-1 -right-1">
          <div className="flex items-center justify-center w-6 h-6 bg-red-500 rounded-full">
            <span className="text-white text-xs">✗</span>
          </div>
        </div>
      )}
      <Handle type="target" position={Position.Left} className="!bg-blue-400" />
      <div className="flex items-start gap-2">
        <div className="p-1 bg-gray-50 rounded">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-base mb-2 break-words">
            {(data.type === 'invoke_host_function' || data.type === 'invokeHostFunction') ? (
              // Show function name for Soroban operations
              cleanHostFunctionType(data.functionName || data.function || 'Contract Call')
            ) : (
              data.type.replace(/([A-Z])/g, ' $1').trim()
            )}
            {data.events && data.events.length > 0 && (() => {
              const userEventCount = data.events.filter((event: any) => {
                const topics = event.topics || [];
                if (topics.length === 0) return true;
                const eventType = topics[0];
                const eventName = typeof eventType === 'string' ? eventType.toLowerCase() : '';
                return eventName !== 'core_metrics' && eventName !== 'coremetrics' && eventName !== 'core-metrics';
              }).length;

              if (userEventCount === 0) return null;

              return (
                <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  {userEventCount} event{userEventCount > 1 ? 's' : ''}
                </span>
              );
            })()}
          </p>
          {getOperationDetails()}
          {data.sorobanOperation && (
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <div className="mt-1 p-1 bg-purple-50 rounded cursor-help">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3 h-3 text-purple-600" />
                      <p className="text-sm text-purple-700 font-medium break-words">
                        {data.sorobanOperation.functionName}
                      </p>
                    </div>
                  </div>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 max-w-2xl z-50"
                    sideOffset={5}
                  >
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Contract Interaction</p>
                      <div className="space-y-1">
                        <p className="text-sm text-gray-500">Arguments:</p>
                        <pre className="text-sm bg-gray-50 p-2 rounded overflow-x-auto max-h-40">
                          {safeStringify(data.sorobanOperation.args, 2)}
                        </pre>
                      </div>
                      {data.sorobanOperation.result && (
                        <div className="space-y-1">
                          <p className="text-sm text-gray-500">Result:</p>
                          <pre className="text-sm bg-gray-50 p-2 rounded overflow-x-auto max-h-40">
                            {safeStringify(data.sorobanOperation.result, 2)}
                          </pre>
                        </div>
                      )}
                      {data.sorobanOperation.events && data.sorobanOperation.events.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm text-gray-500">Events:</p>
                          <div className="space-y-1">
                            {data.sorobanOperation.events.map((event, idx) => (
                              <div key={idx} className="text-sm bg-purple-50 p-2 rounded">
                                <p className="font-medium">{event.type}</p>
                                <p className="text-purple-600 break-all">{event.data}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {data.sorobanOperation.error && (
                        <p className="text-sm text-red-600">
                          Error: {data.sorobanOperation.error}
                        </p>
                      )}
                    </div>
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-400" />
    </div>
  );
}