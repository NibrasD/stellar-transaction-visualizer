import React, { useState, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { CircleDollarSign, ArrowRightCircle, AlertCircle, Code, Cpu, Zap, UserPlus, Settings, TrendingUp, Shield, Key, Users, ArrowLeftRight, Target, Repeat, ShoppingCart, ArrowRight, Sprout, Wheat, Copy, Check } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as StellarSdk from '@stellar/stellar-sdk';
import { formatContractValue, simpleContractMetadataService } from '../services/stellar';
import { PathPaymentNode } from './PathPaymentNode';

// Helper function to safely stringify values that might contain BigInt or Buffer objects
const safeStringify = (value: any, space?: number): string => {
  // Note: preprocessForDisplay is defined later in the file, so we need to handle it inline here
  // We'll preprocess within the replacer function
  const processValue = (val: any): any => {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;

    // Handle Node.js Buffer representation
    if (val.type === 'Buffer' && Array.isArray(val.data)) {
      const bytes = new Uint8Array(val.data);
      if (bytes.length === 32) {
        try {
          const contractId = StellarSdk.StrKey.encodeContract(bytes);
          return `${contractId.substring(0, 4)}…${contractId.substring(contractId.length - 4)}`;
        } catch { }
        try {
          const publicKey = StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
          return `${publicKey.substring(0, 4)}…${publicKey.substring(publicKey.length - 4)}`;
        } catch { }
      }
      const hexString = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      if (hexString.length > 16) {
        return hexString.substring(0, 8) + '…' + hexString.substring(hexString.length - 4);
      }
      return hexString;
    }

    // Handle serialized buffer (numeric keys)
    const keys = Object.keys(val);
    if (keys.length > 0 && !Array.isArray(val)) {
      const numericKeys = keys.filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
      if (numericKeys.length === keys.length && numericKeys.length > 4) {
        const allBytes = keys.every(k => {
          const v = val[k];
          return typeof v === 'number' && v >= 0 && v <= 255;
        });
        if (allBytes) {
          const bytes = new Uint8Array(keys.length);
          numericKeys.forEach((k, i) => { bytes[i] = val[k]; });
          if (bytes.length === 32) {
            try {
              const contractId = StellarSdk.StrKey.encodeContract(bytes);
              return `${contractId.substring(0, 4)}…${contractId.substring(contractId.length - 4)}`;
            } catch { }
            try {
              const publicKey = StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
              return `${publicKey.substring(0, 4)}…${publicKey.substring(publicKey.length - 4)}`;
            } catch { }
          }
          const hexString = Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          if (hexString.length > 16) {
            return hexString.substring(0, 8) + '…' + hexString.substring(hexString.length - 4);
          }
          return hexString;
        }
      }
    }

    return val;
  };

  return JSON.stringify(value, (key, val) => {
    const processed = processValue(val);
    if (typeof processed === 'bigint') return processed.toString();
    return processed;
  }, space);
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

// Helper to determine if a claimant predicate is unconditional
const isUnconditionalPredicate = (predicate: any): boolean => {
  if (!predicate) return true;
  if (typeof predicate !== 'object') return true;
  if (predicate.unconditional === true) return true;
  return false;
};

// Copy button component
const CopyButton: React.FC<{ value: string; label?: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={handleCopy}
            className="inline-flex items-center justify-center p-1 ml-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            aria-label={`Copy ${label || 'value'}`}
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
            sideOffset={5}
          >
            {copied ? 'Copied!' : `Copy ${label || 'value'}`}
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

// Copyable text component - click to copy
const CopyableText: React.FC<{ value: string; displayValue?: string; className?: string }> = ({ value, displayValue, className = "" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            onClick={handleCopy}
            className={`cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-all px-0.5 rounded ${copied ? 'bg-green-100 text-green-800 font-semibold' : ''} ${className}`}
            title="Click to copy"
          >
            {copied ? '✓ Copied!' : (displayValue || value)}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-gray-900 text-white px-3 py-2 rounded text-sm max-w-sm break-all z-50"
            sideOffset={5}
          >
            {copied ? 'Copied to clipboard!' : 'Click to copy'}
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
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

// Helper to check if an object is a Node.js Buffer representation (e.g., {type: "Buffer", data: [...]} )
const isNodeBuffer = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  return obj.type === 'Buffer' && Array.isArray(obj.data);
};

// Helper to format binary data as hex or address
const formatBufferValue = (bytes: Uint8Array): { display: string; full: string; type: string } => {
  // If 32 bytes, try to decode as Stellar address
  if (bytes.length === 32) {
    try {
      const contractId = StellarSdk.StrKey.encodeContract(bytes);
      if (contractId.startsWith('C') && contractId.length === 56) {
        const shortAddr = `${contractId.substring(0, 4)}…${contractId.substring(contractId.length - 4)}`;
        return { display: shortAddr, full: contractId, type: 'contract' };
      }
    } catch { }

    try {
      const publicKey = StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
      if (publicKey.startsWith('G') && publicKey.length === 56) {
        const shortAddr = `${publicKey.substring(0, 4)}…${publicKey.substring(publicKey.length - 4)}`;
        return { display: shortAddr, full: publicKey, type: 'account' };
      }
    } catch { }
  }

  // Convert to hex string
  const hexString = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Show abbreviated hex
  if (hexString.length > 16) {
    const displayHex = hexString.substring(0, 8) + '…' + hexString.substring(hexString.length - 4);
    return { display: displayHex, full: hexString, type: 'bytes' };
  }

  return { display: hexString, full: hexString, type: 'bytes' };
};

// Recursively process objects to convert Buffer-like structures before JSON.stringify
const preprocessForDisplay = (val: any): any => {
  if (val === null || val === undefined) return val;

  if (typeof val !== 'object') return val;

  // Handle Node.js Buffer representation
  if (isNodeBuffer(val)) {
    const bytes = new Uint8Array(val.data);
    const formatted = formatBufferValue(bytes);
    return formatted.display;
  }

  // Handle serialized buffer (numeric keys)
  if (isSerializedBuffer(val)) {
    const bytes = serializedBufferToUint8Array(val);
    const formatted = formatBufferValue(bytes);
    return formatted.display;
  }

  // Handle arrays
  if (Array.isArray(val)) {
    return val.map(item => preprocessForDisplay(item));
  }

  // Handle regular objects
  const result: Record<string, any> = {};
  for (const key of Object.keys(val)) {
    result[key] = preprocessForDisplay(val[key]);
  }
  return result;
};

// Format value with type annotations (sym, bytes, u32, i128, etc.)
const formatValueWithType = (val: any, maxLength: number = 60, contractMetadata?: Map<string, { symbol: string; name: string; decimals: number }>): string => {
  if (val === null || val === undefined) return 'null';

  // Check for Node.js Buffer representation FIRST
  if (val && typeof val === 'object' && isNodeBuffer(val)) {
    const bytes = new Uint8Array(val.data);
    const formatted = formatBufferValue(bytes);
    return formatted.display;
  }

  // Check for serialized buffers
  if (val && typeof val === 'object' && isSerializedBuffer(val)) {
    const bytes = serializedBufferToUint8Array(val);
    const formatted = formatBufferValue(bytes);
    return formatted.display;
  }

  if (typeof val === 'string') {
    // Check if this is a contract ID that might be a token
    if (val.length > 40 && (val.startsWith('G') || val.startsWith('C'))) {
      // Look up token metadata
      if (contractMetadata && contractMetadata.has(val)) {
        const metadata = contractMetadata.get(val)!;
        return `"${metadata.symbol}"sym`;
      }
      return `${val.substring(0, 4)}…${val.substring(val.length - 4)}`;
    }
    return `"${val}"sym`;
  }

  if (typeof val === 'number') {
    // Determine appropriate type based on value size
    const type = val <= 4294967295 ? 'u32' : 'u64';
    const baseFormatted = `${val}${type}`;
    const formatted = formatContractValue(baseFormatted);
    return formatted !== baseFormatted ? formatted : baseFormatted;
  }

  if (typeof val === 'bigint') {
    const formatted = formatContractValue(`${val}i128`);
    return formatted !== `${val}i128` ? formatted : `${val}i128`;
  }

  if (typeof val === 'boolean') {
    return `${val}bool`;
  }

  if (Array.isArray(val)) {
    const items = val.map(v => formatValueWithType(v, 40, contractMetadata)).join(', ');
    if (items.length > maxLength) {
      return `[${items.substring(0, maxLength - 3)}…]`;
    }
    return `[${items}]`;
  }

  if (typeof val === 'object') {
    try {
      const allEntries = Object.entries(val);
      const entries = allEntries.map(([k, v]) => {
        const key = typeof k === 'string' ? `"${k}"sym` : k;
        const value = formatValueWithType(v, 50, contractMetadata);
        return `${key}: ${value}`;
      });
      const entriesStr = entries.join(', ');
      return `{${entriesStr}}`;
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
// Now supports contract metadata for accurate parameter names!
const getArgLabel = (functionName: string | undefined, idx: number, argValue: any, contractMetadata?: any): string => {
  if (!functionName) return `arg${idx}`;

  // FIRST: Try to use actual contract metadata if available
  if (contractMetadata && contractMetadata.functions) {
    const functionSpec = contractMetadata.functions.find((f: any) =>
      f.name && f.name.toLowerCase() === functionName.toLowerCase()
    );

    if (functionSpec && functionSpec.inputs && functionSpec.inputs[idx]) {
      const paramName = functionSpec.inputs[idx].name;
      if (paramName) {
        return paramName;
      }
    }
  }

  // FALLBACK: Use pattern matching (only if metadata not available)

  const formattedValue = typeof argValue === 'string' ? argValue : String(argValue);

  // Check if the value looks like different address types
  const isAccountAddress = formattedValue.startsWith('G');
  const isContractAddress = formattedValue.startsWith('C');
  const isAddress = isAccountAddress || isContractAddress;

  const fnLower = functionName.toLowerCase();

  // Comprehensive function parameter patterns (non-hardcoded, pattern-based)
  const commonPatterns: Record<string, string[]> = {
    // Token operations
    'transfer': ['from', 'to', 'amount'],
    'transfer_from': ['spender', 'from', 'to', 'amount'],
    'mint': ['to', 'amount'],
    'burn': ['from', 'amount'],
    'approve': ['spender', 'amount'],
    'allowance': ['owner', 'spender'],
    'balance': ['account'],
    'balance_of': ['account'],

    // DEX/Swap operations
    'swap': ['amount_in', 'amount_out_min', 'path', 'to', 'deadline'],
    'swap_exact_tokens_for_tokens': ['amount_in', 'amount_out_min', 'path', 'to', 'deadline'],
    'add_liquidity': ['token_a', 'token_b', 'amount_a', 'amount_b', 'to'],
    'remove_liquidity': ['token_a', 'token_b', 'liquidity', 'amount_a_min', 'amount_b_min', 'to'],

    // Financial operations
    'deposit': ['from', 'amount'],
    'withdraw': ['to', 'amount'],
    'claim': ['account', 'amount'],
    'stake': ['account', 'amount'],
    'unstake': ['account', 'amount'],
    'borrow': ['account', 'amount'],
    'repay': ['account', 'amount'],
    'liquidate': ['borrower', 'collateral_asset', 'debt_asset', 'amount'],

    // Access control
    'grant_role': ['role', 'account'],
    'revoke_role': ['role', 'account'],
    'set_admin': ['admin'],

    // Domain/NFT operations
    'set_record': ['domain', 'subdomain', 'owner', 'resolver', 'duration'],
    'register': ['name', 'owner', 'duration'],
    'renew': ['name', 'duration'],
    'set_offer': ['owner', 'node_hash', 'amount'],

    // Oracle operations
    'lastprice': ['base', 'quote'],
    'decimals': [],
    'price': ['asset'],
    'prices': ['assets'],
  };

  // Check for exact match
  const pattern = commonPatterns[fnLower];
  if (pattern && idx < pattern.length) {
    return pattern[idx];
  }

  // Pattern-based matching for common function name patterns
  if (fnLower.includes('transfer')) {
    if (idx === 0) return 'from';
    if (idx === 1) return 'to';
    if (idx === 2) return 'amount';
  }

  if (fnLower.includes('swap') || fnLower.includes('exchange')) {
    if (idx === 0) return 'amount_in';
    if (idx === 1) return 'amount_out_min';
    if (idx === 2) return 'path';
    if (idx === 3) return 'to';
  }

  if (fnLower.includes('mint')) {
    if (idx === 0 && isAddress) return 'to';
    if (idx === 1 || (idx === 0 && !isAddress)) return 'amount';
  }

  if (fnLower.includes('burn')) {
    if (idx === 0 && isAddress) return 'from';
    if (idx === 1 || (idx === 0 && !isAddress)) return 'amount';
  }

  if (fnLower.includes('approve')) {
    if (idx === 0) return 'spender';
    if (idx === 1) return 'amount';
  }

  if (fnLower.includes('balance')) {
    if (idx === 0) return 'account';
  }

  if (fnLower.includes('allowance')) {
    if (idx === 0) return 'owner';
    if (idx === 1) return 'spender';
  }

  if (fnLower.includes('deposit') || fnLower.includes('supply')) {
    if (idx === 0 && isAddress) return 'from';
    if (idx === 1 || (idx === 0 && !isAddress)) return 'amount';
  }

  if (fnLower.includes('withdraw') || fnLower.includes('redeem')) {
    if (idx === 0 && isAddress) return 'to';
    if (idx === 1 || (idx === 0 && !isAddress)) return 'amount';
  }

  if (fnLower.includes('stake') || fnLower.includes('unstake')) {
    if (idx === 0) return 'account';
    if (idx === 1) return 'amount';
  }

  if (fnLower.includes('claim')) {
    if (idx === 0) return 'account';
    if (idx === 1) return 'amount';
  }

  if (fnLower.includes('price')) {
    if (idx === 0) return 'base';
    if (idx === 1) return 'quote';
  }

  // Generic smart labeling based on value characteristics
  if (isAddress) {
    // For addresses, use contextual names
    if (idx === 0) return isContractAddress ? 'contract' : 'account';
    if (idx === 1) return isContractAddress ? 'to_contract' : 'to_account';
    return `address_${idx}`;
  }

  if (typeof formattedValue === 'string' && /^\d+$/.test(formattedValue)) {
    return 'amount';
  }

  return `arg${idx}`;
};

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return '';

  // Check for Node.js Buffer representation FIRST
  if (typeof val === 'object' && !Array.isArray(val) && isNodeBuffer(val)) {
    const bytes = new Uint8Array(val.data);
    const formatted = formatBufferValue(bytes);
    return formatted.display;
  }

  // Check for serialized buffers
  if (typeof val === 'object' && !Array.isArray(val) && isSerializedBuffer(val)) {
    const bytes = serializedBufferToUint8Array(val);
    const formatted = formatBufferValue(bytes);
    return formatted.display;
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
          // This is likely a byte array - show as raw base64
          const bytes = new Uint8Array(values);
          const b64 = btoa(String.fromCharCode(...Array.from(bytes)));
          return b64;
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
  const contractShort = event.contractId && event.contractId !== 'Unknown' && event.contractId !== 'System'
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

// CopyableAddress component for addresses with copy button
const CopyableAddress: React.FC<{ address: string; className?: string }> = ({ address, className = "" }) => {
  if (!address || address === 'Unknown') return <span>{address}</span>;

  const short = address.length > 8 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`font-mono ${className}`}>{short}</span>
      <CopyButton value={address} label="address" />
    </span>
  );
};

// Helper function to render asset with issuer address
const AssetDisplay: React.FC<{ type: string; code?: string; issuer?: string }> = ({ type, code, issuer }) => {
  if (type === 'native') return <>XLM</>;
  if (code && issuer) {
    return (
      <>
        {code}(<CopyableAddress address={issuer} />)
      </>
    );
  }
  return <>{code || 'Unknown'}</>;
};

// Helper function to format effect descriptions with copy buttons
const EffectDescription: React.FC<{ effect: any }> = ({ effect }) => {
  const formatHash = (hash: string) => hash && hash.length > 20 ? `${hash.slice(0, 11)}…` : hash;

  switch (effect.type) {
    case 'account_created':
      return <>Account <CopyableAddress address={effect.account} /> created with {effect.starting_balance || '0'} XLM</>;
    case 'account_debited':
      return <>{effect.amount} <AssetDisplay type={effect.asset_type} code={effect.asset_code} issuer={effect.asset_issuer} /> debited from account <CopyableAddress address={effect.account} /></>;
    case 'account_credited':
      return <>{effect.amount} <AssetDisplay type={effect.asset_type} code={effect.asset_code} issuer={effect.asset_issuer} /> credited to account <CopyableAddress address={effect.account} /></>;
    case 'account_sponsorship_created':
      return <>Account <CopyableAddress address={effect.sponsor} /> sponsored account base reserve for <CopyableAddress address={effect.account} /></>;
    case 'trustline_sponsorship_created':
      return <>Account <CopyableAddress address={effect.sponsor} /> sponsored trustline for <CopyableAddress address={effect.account} /></>;
    case 'data_sponsorship_created':
      return <>Account <CopyableAddress address={effect.sponsor} /> sponsored data for <CopyableAddress address={effect.account} /></>;
    case 'claimable_balance_sponsorship_created':
      return <>Account <CopyableAddress address={effect.sponsor} /> sponsored claimable balance {formatHash(effect.balance_id)}</>;
    case 'signer_sponsorship_created':
      return <>Account <CopyableAddress address={effect.sponsor} /> sponsored signer for <CopyableAddress address={effect.account} /></>;
    case 'account_offer_sponsorship_created':
      return <>Account <CopyableAddress address={effect.sponsor} /> sponsored offer {effect.offer_id} reserve for <CopyableAddress address={effect.account} /></>;
    case 'trade':
      return <>Trade executed: {effect.sold_amount} <AssetDisplay type={effect.sold_asset_type} code={effect.sold_asset_code} issuer={effect.sold_asset_issuer} /> for {effect.bought_amount} <AssetDisplay type={effect.bought_asset_type} code={effect.bought_asset_code} issuer={effect.bought_asset_issuer} /></>;
    case 'offer_created':
      const createPrice = effect.price || (effect.price_r && effect.price_r.n && effect.price_r.d ? (parseFloat(effect.price_r.n) / parseFloat(effect.price_r.d)).toFixed(6) : 'N/A');
      return <>Offer {effect.offer_id || effect.id} created: selling {effect.amount || '0'} <AssetDisplay type={effect.selling_asset_type} code={effect.selling_asset_code} issuer={effect.selling_asset_issuer} /> at {createPrice}</>;
    case 'offer_updated':
      const updatePrice = effect.price || (effect.price_r && effect.price_r.n && effect.price_r.d ? (parseFloat(effect.price_r.n) / parseFloat(effect.price_r.d)).toFixed(6) : 'N/A');
      return <>Offer {effect.offer_id || effect.id} updated: {effect.amount || '0'} <AssetDisplay type={effect.selling_asset_type} code={effect.selling_asset_code} issuer={effect.selling_asset_issuer} /> at {updatePrice}</>;
    case 'offer_removed':
      return <>Offer {effect.offer_id || effect.id} removed</>;
    case 'account_removed':
      return <>Account <CopyableAddress address={effect.account} /> removed</>;
    case 'trustline_created':
      return <>Trustline created to <AssetDisplay type={effect.asset_type} code={effect.asset_code} issuer={effect.asset_issuer} />{effect.limit ? ` with limit ${effect.limit}` : ''}</>;
    case 'trustline_removed':
      return <>Trustline to <AssetDisplay type={effect.asset_type} code={effect.asset_code} issuer={effect.asset_issuer} /> removed</>;
    case 'trustline_updated':
      return <>Trustline to <AssetDisplay type={effect.asset_type} code={effect.asset_code} issuer={effect.asset_issuer} /> updated{effect.limit ? ` (limit: ${effect.limit})` : ''}</>;
    default:
      return <>{effect.type.replace(/_/g, ' ')}</>;
  }
};

// Reusable Related Effects Component
const RelatedEffectsSection: React.FC<{ effects: any[]; operationType?: string }> = ({ effects, operationType }) => {
  // Special messages for operations that commonly have no effects
  const getNoEffectsMessage = (opType?: string) => {
    if (opType === 'begin_sponsoring_future_reserves' || opType === 'end_sponsoring_future_reserves') {
      return 'No direct effects - this operation modifies sponsorship state for subsequent operations.';
    }
    return 'No effects recorded for this operation.';
  };

  if (!effects || effects.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-50 p-3 rounded border border-gray-200 mt-2">
      <p className="text-xs font-semibold text-gray-700 mb-2">Related Effects:</p>
      <div className="space-y-1">
        {effects.map((effect: any, idx: number) => (
          <p key={idx} className="text-xs text-gray-600 break-words flex items-start">
            <span className="text-gray-400 mr-2">•</span>
            <span className="flex items-center flex-wrap gap-1"><EffectDescription effect={effect} /></span>
          </p>
        ))}
      </div>
    </div>
  );
};

export function OperationNodeComponent({ data }: OperationNodeProps) {
  const [showDevEvents, setShowDevEvents] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showLedgerEffects, setShowLedgerEffects] = useState(false);
  const [contractMetadata, setContractMetadata] = useState<any>(null);
  const [argContractMetadata, setArgContractMetadata] = useState<Map<string, { symbol: string; name: string; decimals: number }>>(new Map());

  // Helper to extract contract IDs from args
  const extractContractIds = (args: any[]): string[] => {
    const contractIds: string[] = [];
    const extract = (val: any) => {
      if (typeof val === 'string' && val.length > 40 && (val.startsWith('C') || val.startsWith('G'))) {
        contractIds.push(val);
      } else if (Array.isArray(val)) {
        val.forEach(extract);
      } else if (val && typeof val === 'object') {
        Object.values(val).forEach(extract);
      }
    };
    args.forEach(extract);
    return [...new Set(contractIds)]; // Remove duplicates
  };

  useEffect(() => {
    const fetchMetadata = async () => {
      if (data.contractId) {
        const metadata = await simpleContractMetadataService.getContractMetadata(data.contractId);
        setContractMetadata(metadata);
      }

      // Extract and fetch metadata for all contract IDs in args
      if (data.args && Array.isArray(data.args)) {
        const contractIds = extractContractIds(data.args);
        const metadataMap = new Map<string, { symbol: string; name: string; decimals: number }>();

        for (const contractId of contractIds) {
          try {
            const metadata = await simpleContractMetadataService.getContractMetadata(contractId);
            if (metadata?.isToken && metadata.tokenSymbol) {
              metadataMap.set(contractId, {
                symbol: metadata.tokenSymbol,
                name: metadata.tokenName || metadata.tokenSymbol,
                decimals: metadata.tokenDecimals ?? 7
              });
            }
          } catch (e) {
            // Silently ignore metadata fetch errors
          }
        }

        setArgContractMetadata(metadataMap);
      }
    };
    fetchMetadata();
  }, [data.contractId, data.args]);

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

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAddress(text);
      setTimeout(() => setCopiedAddress(null), 2000);
    }).catch((err) => {
    });
  };

  const CopyableField = ({ value, displayValue, className = "" }: { value: string; displayValue?: string; className?: string }) => {
    if (!value) {
      return null;
    }
    const isCopied = copiedAddress === value;

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(value).then(() => {
        setCopiedAddress(value);
        setTimeout(() => setCopiedAddress(null), 2000);
      }).catch((err) => {
      });
    };

    return (
      <span
        className={`${className} cursor-pointer hover:bg-blue-100 px-1 rounded transition-all inline-flex items-center gap-1 break-all`}
        onClick={handleClick}
        title={`Click to copy: ${value}`}
      >
        {isCopied ? '✓ Copied!' : (displayValue || value)}
        <Copy className="w-3 h-3 inline opacity-50 flex-shrink-0" />
      </span>
    );
  };

  const CopyableAddress = ({ address, className = "font-mono text-blue-600" }: { address: string; className?: string }) => {
    if (!address) {
      return null;
    }
    const formatted = formatAccountId(address);
    return <CopyableField value={address} displayValue={formatted} className={className} />;
  };

  const CopyableAsset = ({ assetType, assetCode, assetIssuer, className = "" }: { assetType: string; assetCode?: string; assetIssuer?: string; className?: string }) => {
    if (assetType === 'native' || assetCode === 'XLM' || assetCode === 'native') {
      return <span className={className}>XLM</span>;
    }

    if (assetCode && assetIssuer) {
      return (
        <span className={className}>
          <CopyableField value={assetCode} className="font-medium" />:
          <CopyableAddress address={assetIssuer} className="font-mono" />
        </span>
      );
    }

    if (assetCode) {
      return <CopyableField value={assetCode} className={className} />;
    }

    return <span className={className}>Unknown Asset</span>;
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
        const func = functionName || 'unknown';

        // Fetch contract label (token symbol or shortened ID)
        const [contractLabel, setContractLabel] = useState<string | null>(null);
        const [contractFullDisplay, setContractFullDisplay] = useState<string>(
          data.contractId || 'Unknown'
        );

        useEffect(() => {
          if (data.contractId && data.contractId.startsWith('C')) {
            simpleContractMetadataService.getContractLabel(data.contractId).then(label => {
              setContractLabel(label);
              // If we got a token symbol (not a shortened ID), show it more prominently
              if (label && !label.includes('…')) {
                setContractFullDisplay(`${label} (${data.contractId})`);
              }
            });
          }
        }, [data.contractId]);

        const contract = contractLabel || formatAccountId(data.contractId || '');

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
                <div className="flex items-start bg-white px-2 py-1.5 rounded border border-slate-300">
                  <code className="flex-1 font-mono break-all text-slate-900 text-xs select-all cursor-pointer hover:bg-slate-50 transition-colors">
                    {data.auth && data.auth[0]?.credentials?.address || data.sourceAccount || 'Unknown'}
                  </code>
                  {(data.auth && data.auth[0]?.credentials?.address || data.sourceAccount) && (
                    <CopyButton value={data.auth && data.auth[0]?.credentials?.address || data.sourceAccount || ''} label="caller address" />
                  )}
                </div>
              </div>

              {data.contractId && data.contractId.startsWith('C') && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">Contract:</div>
                  <div className="flex items-start bg-white px-2 py-1.5 rounded border border-slate-300">
                    <code className="flex-1 font-mono break-all text-slate-900 text-xs select-all cursor-pointer hover:bg-slate-50 transition-colors">
                      {contractFullDisplay}
                    </code>
                    <CopyButton value={data.contractId} label="contract ID" />
                  </div>
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
                    Contract: <span className="font-mono text-emerald-400"><CopyableText value={data.contractId || contract} displayValue={contract} className="text-emerald-400" /></span>
                  </div>

                  <div className="text-slate-400">{'{'}</div>

                  {/* fn_call section */}
                  <div className="ml-3">
                    <div className="text-orange-400">"fn_call"<span className="text-slate-400">: {'{'}</span></div>

                    {/* topics */}
                    <div className="ml-3">
                      <div className="text-pink-400">"topics"<span className="text-slate-400">: [</span></div>
                      <div className="ml-3 space-y-0.5">
                        <div className="text-emerald-300">"<CopyableText value={functionName || 'unknown'} className="text-emerald-300" />",</div>
                        <div className="text-emerald-300">"<CopyableText value={data.auth && data.auth[0]?.credentials?.address || data.sourceAccount || caller} displayValue={caller} className="text-emerald-300" />"</div>
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
                            const formattedArg = cleanSymSuffix(formatValueWithType(arg, 80, argContractMetadata));
                            return (
                              <div key={idx} className="text-yellow-300">
                                "<CopyableText value={formattedArg} className="text-yellow-300" />"{idx < args.length - 1 ? ',' : ''}
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
                            "<CopyableText value={(() => {
                              const cleanSymSuffix = (str: string): string => str.replace(/"sym$/g, '"');
                              return cleanSymSuffix(formatValueWithType(data.result || data.returnValue, 80, argContractMetadata));
                            })()} className="text-green-300" />"
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
                  {/* Action Buttons */}
                  {regularEvents.length > 0 && (
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <button
                          onClick={() => setShowDevEvents(!showDevEvents)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all shadow-sm ${showDevEvents
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-white hover:bg-gray-50 text-blue-600 border border-blue-300'
                            }`}
                        >
                          <Code size={14} />
                          <span>Contract Events (Developers)</span>
                        </button>
                        {coreMetricsEvents.length > 0 && (
                          <button
                            onClick={() => setShowMetrics(!showMetrics)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all shadow-sm ${showMetrics
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-white hover:bg-gray-50 text-amber-600 border border-amber-300'
                              }`}
                          >
                            <TrendingUp size={14} />
                            <span>Contract Metrics</span>
                          </button>
                        )}
                        <button
                          onClick={() => setShowLedgerEffects(!showLedgerEffects)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all shadow-sm ${showLedgerEffects
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-white hover:bg-gray-50 text-green-600 border border-green-300'
                            }`}
                        >
                          <Zap size={14} />
                          <span>Ledger Effects</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Contract Events for Developers */}
                  {regularEvents.length > 0 && showDevEvents && (
                    <div className="bg-slate-900 p-3 rounded-lg border border-purple-400 shadow-lg">
                      <div className="text-xs font-bold text-purple-300 mb-2 flex items-center gap-1.5">
                        <Code size={14} />
                        <span>CONTRACT EVENTS FOR DEVELOPERS ({regularEvents.length})</span>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {(() => {
                          // Group fn_call events with their matching fn_return
                          const grouped: any[] = [];
                          const usedIndices = new Set<number>();

                          for (let i = 0; i < regularEvents.length; i++) {
                            if (usedIndices.has(i)) continue;

                            const event = regularEvents[i];
                            const eventType = event.topics?.[0];

                            if (eventType === 'fn_call') {
                              const fnName = event.topics?.[2];
                              let returnEvent = null;
                              let returnIndex = -1;

                              // Track nesting depth to find the MATCHING fn_return
                              let depth = 0;
                              for (let j = i + 1; j < regularEvents.length; j++) {
                                if (usedIndices.has(j)) continue;
                                const nextEvent = regularEvents[j];
                                const nextType = nextEvent.topics?.[0];

                                if (nextType === 'fn_call') {
                                  // Nested call, increase depth
                                  depth++;
                                } else if (nextType === 'fn_return') {
                                  if (depth === 0 && nextEvent.topics?.[1] === fnName) {
                                    // This is OUR return (at our depth level)
                                    returnEvent = nextEvent;
                                    returnIndex = j;
                                    break;
                                  } else if (depth > 0) {
                                    // This is a return for a nested call
                                    depth--;
                                  }
                                }
                              }

                              if (returnIndex !== -1) {
                                usedIndices.add(returnIndex);
                              }
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
                              const contractAddress = callEvent.contractId && callEvent.contractId !== 'Unknown' && callEvent.contractId !== 'System'
                                ? callEvent.contractId
                                : data.contractId; // Fallback to operation contract
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
                              const fnCallTopics = [functionName, cleanSymSuffix(formatValueWithType(callerAddress, 80, argContractMetadata))];
                              const fnCallData = args.map(a => cleanSymSuffix(formatValueWithType(a, 80, argContractMetadata)));

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
                                                "{cleanSymSuffix(formatValueWithType(returnValue, 80, argContractMetadata))}"
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
                                          <CopyableText value={formatEventValue(topic)} />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {event.data && (
                                  <div className="mt-1">
                                    <div className="text-xs text-purple-700 font-semibold mb-0.5">Data:</div>
                                    <div className="ml-2 text-xs text-purple-800 break-all font-mono">
                                      <CopyableText value={formatEventValue(event.data)} />
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
                  {coreMetricsEvents.length > 0 && showMetrics && (
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 shadow-lg">
                      <div className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
                        <TrendingUp size={14} />
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
                                {metricName}: <span className="text-amber-900"><CopyableText value={formatEventValue(metricValue)} /></span>
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
            {showLedgerEffects ? (
              ((data.effects && data.effects.length > 0) || (data.stateChanges && data.stateChanges.length > 0)) ? (
                <div className="bg-green-50 p-3 rounded-lg border border-green-200 shadow-lg">
                  {(() => {
                    // Filter effects and state changes to only show those from this contract
                    const filteredStateChanges = (data.stateChanges || []).filter((change: any) =>
                      !change.contractId || change.contractId === data.contractId
                    );
                    const filteredEffects = (data.effects || []).filter((effect: any) =>
                      !effect.contractId || effect.contractId === data.contractId
                    );
                    const totalCount = filteredStateChanges.length + filteredEffects.length;

                    return (
                      <>
                        <div className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1.5">
                          <Zap size={14} />
                          <span>LEDGER EFFECTS ({totalCount})</span>
                        </div>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {/* Show state changes (from ledger entry changes - created, restored, updated, removed) */}
                          {filteredStateChanges.map((change: any, idx: number) => {
                            const contractId = change.contractId || 'Unknown';
                            const contractShort = contractId.length > 12
                              ? `${contractId.slice(0, 4)}…${contractId.slice(-4)}`
                              : contractId;

                            const actionType = change.type || 'updated';
                            const storageType = change.storageType || 'data';
                            const keyDisplay = change.keyDisplay || change.key || '';

                            const dataToShow = change.after !== undefined ? change.after : change.value;
                            const isContractInstance = (typeof change.key === 'string' && change.key === 'ContractInstance') ||
                              keyDisplay === '<LedgerKeyContractInstance>';
                            const hasData = dataToShow !== undefined && dataToShow !== null;

                            return (
                              <div key={`state-${idx}`} className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200 text-xs shadow-sm">
                                <div className="flex items-start gap-2">
                                  <div className="text-green-600 mt-0.5">🟢</div>
                                  <div className="flex-1">
                                    <div className="font-semibold text-green-900 mb-1.5 leading-tight">
                                      {isContractInstance
                                        ? `Contract ${contractShort} ${actionType} instance data`
                                        : `Contract ${contractShort} ${actionType} ${storageType} ${keyDisplay}`
                                      }
                                    </div>
                                    {hasData && (
                                      <div className="ml-0.5">
                                        <div className="text-green-700 font-mono text-[11px] bg-white/60 p-2 rounded border border-green-200 leading-relaxed whitespace-pre-wrap break-all">
                                          = {formatValueWithType(dataToShow, 500, argContractMetadata)}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Show effects (from operation effects) */}
                          {filteredEffects.map((effect: any, idx: number) => {
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
                              <div key={`effect-${idx}`} className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200 text-xs shadow-sm">
                                <div className="flex items-start gap-2">
                                  <div className="text-green-600 mt-0.5">🟢</div>
                                  <div className="flex-1">
                                    <div className="font-semibold text-green-900 mb-1.5 leading-tight">
                                      Contract {contractShort} {actionType} {storageType} {keyDisplay}
                                    </div>
                                    {hasData && (
                                      <div className="ml-0.5">
                                        <div className="text-green-700 font-mono text-[11px] bg-white/60 p-2 rounded border border-green-200 leading-relaxed whitespace-pre-wrap break-all">
                                          = {formatValueWithType(dataToShow, 500, argContractMetadata)}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 shadow-lg">
                  <div className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                    <Zap size={14} />
                    <span>No ledger effects for this operation</span>
                  </div>
                </div>
              )
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
                For: <CopyableAddress address={data.destination} />
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
              Funded by: <CopyableAddress address={data.funder || data.sourceAccount || ''} className="font-mono text-orange-600" />
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

            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'payment':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-green-600">Payment Transfer</span>
            </p>

            {/* From Account */}
            <div className="bg-gray-50 p-3 rounded-lg border-l-4 border-gray-400">
              <p className="text-xs text-gray-600 font-medium mb-1">From:</p>
              <p className="text-sm break-words">
                <CopyableAddress address={data.from || data.sourceAccount || ''} />
              </p>
            </div>

            {/* To Account */}
            <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
              <p className="text-xs text-blue-600 font-medium mb-1">To:</p>
              <p className="text-sm break-words">
                <CopyableAddress address={data.to || ''} />
              </p>
            </div>

            {/* Amount */}
            <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
              <p className="text-xs text-green-600 font-medium mb-1">Amount:</p>
              <p className="text-sm text-green-700 break-words">
                <span className="font-bold text-lg">{formatAmount(data.amount || '0')}</span>
                <span className="ml-2 font-medium">{data.asset || 'XLM'}</span>
              </p>
              {data.assetIssuer && data.asset !== 'XLM' && (
                <div className="mt-2">
                  <p className="text-xs text-green-600">Issuer:</p>
                  <p className="text-xs break-all">
                    <CopyableAddress address={data.assetIssuer} className="font-mono text-green-700" />
                  </p>
                </div>
              )}
            </div>

            {/* Memo (if present) */}
            {data.memo && (
              <div className="bg-purple-50 p-2 rounded border border-purple-200">
                <p className="text-xs text-purple-600 font-medium">Memo:</p>
                <p className="text-sm text-purple-700 italic break-words mt-1">{data.memo}</p>
                {data.memoType && (
                  <p className="text-xs text-purple-500 mt-1">
                    Type: <span className="font-mono">{data.memoType}</span>
                  </p>
                )}
              </div>
            )}

            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'set_trust_line_flags':
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-red-600">Set Trustline Flags</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Issuer: <CopyableAddress address={data.sourceAccount || ''} className="font-mono text-blue-600" />
            </p>
            <p className="text-sm text-gray-600 break-words">
              For: <CopyableAddress address={data.trustor || ''} className="font-mono text-blue-600" />
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
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'manage_sell_offer':
      case 'manage_offer': {
        // 1. Check for Removal: amount = 0
        const sellAmountRaw = data.amount || '0';
        const isRemovalSell = parseFloat(sellAmountRaw) === 0;

        // 2. Check for Update/Create: based on original Offer ID
        const originalSellOfferId = (data as any).original_offer_id || '0';
        const isExistingSellOffer = originalSellOfferId !== '0' && originalSellOfferId !== 0;
        const sellOfferId = data.offerId || (data as any).offer_id;

        let sellOperationLabel;
        if (isRemovalSell) {
          sellOperationLabel = '🚫 Remove Sell Offer';
        } else if (isExistingSellOffer) {
          sellOperationLabel = 'Update Sell Offer';
        } else {
          sellOperationLabel = 'Create Sell Offer';
        }

        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className={`font-medium ${isRemovalSell ? 'text-red-600' : 'text-yellow-600'}`}>
                {sellOperationLabel}
              </span>
            </p>
            <p className="text-sm text-gray-600 break-words flex items-center gap-1">
              Trader: <CopyableAddress address={data.sourceAccount || ''} />
            </p>

            {/* Selling Details */}
            <div className={`p-3 rounded-lg border-l-4 ${isRemovalSell ? 'bg-gray-100 border-gray-400' : 'bg-red-50 border-red-400'}`}>
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className={`w-4 h-4 ${isRemovalSell ? 'text-gray-600' : 'text-red-600'}`} />
                <span className={`text-sm font-medium ${isRemovalSell ? 'text-gray-700' : 'text-red-700'}`}>
                  {isRemovalSell ? 'Removed Amount (Selling)' : 'Selling'}
                </span>
              </div>
              <p className={`text-sm break-words ${isRemovalSell ? 'text-gray-700' : 'text-red-700'}`}>
                <span className="font-bold text-lg">{formatAmount(sellAmountRaw)}</span>
                <span className="ml-2 font-medium">
                  <CopyableAsset assetType={data.selling_asset_type || 'native'} assetCode={data.selling_asset_code} assetIssuer={data.selling_asset_issuer} />
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
                  <CopyableAsset assetType={data.buying_asset_type || 'native'} assetCode={data.buying_asset_code} assetIssuer={data.buying_asset_issuer} />
                </span>
              </p>
            </div>

            {/* Price Details - Hide completely on removal */}
            {!isRemovalSell && (
              <div className="bg-blue-50 p-2 rounded">
                <p className="text-sm text-blue-700 break-words">
                  <span className="font-medium">Price:</span>
                  <span className="font-bold ml-1">{formatPrice(data.price || '0')}</span>
                  <span className="text-xs text-blue-600 ml-1">
                    <CopyableAsset assetType={data.buying_asset_type || 'native'} assetCode={data.buying_asset_code} assetIssuer={data.buying_asset_issuer} /> per <CopyableAsset assetType={data.selling_asset_type || 'native'} assetCode={data.selling_asset_code} assetIssuer={data.selling_asset_issuer} />
                  </span>
                </p>
              </div>
            )}

            {/* Offer ID - Always show */}
            <div className="bg-purple-50 p-2 rounded border border-purple-200">
              <p className="text-sm text-purple-700 break-words">
                <span className="font-medium">Offer ID (DEX):</span>
                {sellOfferId && sellOfferId !== '0' && sellOfferId !== 0 ? (
                  <CopyableField value={sellOfferId} className="font-mono font-bold ml-1 text-purple-900" />
                ) : (
                  <span className="font-mono text-gray-500 text-xs ml-1">0 (creating new offer)</span>
                )}
              </p>
            </div>

            {/* Sponsor Info */}
            {(data as any).sponsor && (
              <div className="bg-orange-50 p-2 rounded border border-orange-200">
                <p className="text-sm text-orange-700 break-words">
                  <span className="font-medium">Sponsored by:</span>
                  <span className="ml-1">
                    <CopyableAddress address={(data as any).sponsor} className="font-mono text-orange-900" />
                  </span>
                </p>
              </div>
            )}

            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );
      }

      case 'manage_buy_offer': {
        // 1. Check for Removal: buy_amount = 0
        const buyAmountRaw = data.buy_amount || data.buyAmount || data.amount || '0';
        const isRemovalBuy = parseFloat(buyAmountRaw) === 0;

        // 2. Check for Update/Create: based on original Offer ID
        const originalBuyOfferId = (data as any).original_offer_id || '0';
        const isExistingBuyOffer = originalBuyOfferId !== '0' && originalBuyOfferId !== 0;
        const buyOfferId = data.offerId || (data as any).offer_id;

        let buyOperationLabel;
        if (isRemovalBuy) {
          buyOperationLabel = '🚫 Remove Buy Offer';
        } else if (isExistingBuyOffer) {
          buyOperationLabel = 'Update Buy Offer';
        } else {
          buyOperationLabel = 'Create Buy Offer';
        }

        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className={`font-medium ${isRemovalBuy ? 'text-red-600' : 'text-green-600'}`}>
                {buyOperationLabel}
              </span>
            </p>

            <p className="text-sm text-gray-600 break-words flex items-center gap-1">
              Trader: <CopyableAddress address={data.sourceAccount || ''} />
            </p>

            {/* Buying Details */}
            <div className={`p-3 rounded-lg border-l-4 ${isRemovalBuy ? 'bg-gray-100 border-gray-400' : 'bg-green-50 border-green-400'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Target className={`w-4 h-4 ${isRemovalBuy ? 'text-gray-600' : 'text-green-600'}`} />
                <span className={`text-sm font-medium ${isRemovalBuy ? 'text-gray-700' : 'text-green-700'}`}>
                  {isRemovalBuy ? 'Removed Amount (Buying)' : 'Buying'}
                </span>
              </div>
              <p className={`text-sm break-words ${isRemovalBuy ? 'text-gray-700' : 'text-green-700'}`}>
                <span className="font-bold text-lg">{formatAmount(buyAmountRaw)}</span>
                <span className="ml-2 font-medium">
                  <CopyableAsset assetType={data.buying_asset_type || 'native'} assetCode={data.buying_asset_code} assetIssuer={data.buying_asset_issuer} />
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
                  <CopyableAsset assetType={data.selling_asset_type || 'native'} assetCode={data.selling_asset_code} assetIssuer={data.selling_asset_issuer} />
                </span>
              </p>
            </div>

            {/* Price Details - Hide completely on removal */}
            {!isRemovalBuy && (
              <div className="bg-blue-50 p-2 rounded">
                <p className="text-sm text-blue-700 break-words">
                  <span className="font-medium">Price:</span>
                  <span className="font-bold ml-1">{formatPrice(data.price || '0')}</span>
                  <span className="text-xs text-blue-600 ml-1">
                    <CopyableAsset assetType={data.selling_asset_type || 'native'} assetCode={data.selling_asset_code} assetIssuer={data.selling_asset_issuer} /> per <CopyableAsset assetType={data.buying_asset_type || 'native'} assetCode={data.buying_asset_code} assetIssuer={data.buying_asset_issuer} />
                  </span>
                </p>
              </div>
            )}

            {/* Offer ID - Always show */}
            <div className="bg-purple-50 p-2 rounded border border-purple-200">
              <p className="text-sm text-purple-700 break-words">
                <span className="font-medium">Offer ID (DEX):</span>
                {buyOfferId && buyOfferId !== '0' && buyOfferId !== 0 ? (
                  <CopyableField value={buyOfferId} className="font-mono font-bold ml-1 text-purple-900" />
                ) : (
                  <span className="font-mono text-gray-500 text-xs ml-1">0 (creating new offer)</span>
                )}
              </p>
            </div>

            {/* Sponsor Info */}
            {(data as any).sponsor && (
              <div className="bg-orange-50 p-2 rounded border border-orange-200">
                <p className="text-sm text-orange-700 break-words">
                  <span className="font-medium">Sponsored by:</span>
                  <span className="ml-1">
                    <CopyableAddress address={(data as any).sponsor} className="font-mono text-orange-900" />
                  </span>
                </p>
              </div>
            )}

            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );
      }

      case 'create_passive_sell_offer':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-yellow-600">Create Passive Sell Offer</span>
            </p>
            <p className="text-sm text-gray-600 break-words flex items-center gap-1">
              Trader: <CopyableAddress address={data.sourceAccount || ''} />
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
                  <CopyableAsset assetType={data.selling_asset_type || 'native'} assetCode={data.selling_asset_code} assetIssuer={data.selling_asset_issuer} />
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
                  <CopyableAsset assetType={data.buying_asset_type || 'native'} assetCode={data.buying_asset_code} assetIssuer={data.buying_asset_issuer} />
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
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'path_payment_strict_send':
      case 'path_payment_strict_receive':
        return (
          <PathPaymentNode
            operation={data}
            effects={(data as any).operationEffects}
            operationIndex={data.operationIndex}
          />
        );


      case 'begin_sponsoring_future_reserves':
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-purple-600">Starting Sponsorship</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Sponsor: <CopyableAddress address={data.sponsor || data.sourceAccount || ''} className="font-mono text-purple-600" />
            </p>
            <p className="text-sm text-gray-600 break-words">
              For: <CopyableAddress address={data.sponsoredId || ''} className="font-mono text-blue-600" />
            </p>
            <p className="text-sm text-gray-500 italic break-words">
              Will pay reserves
            </p>
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'end_sponsoring_future_reserves':
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-purple-600">Ending Sponsorship</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              By: <CopyableAddress address={data.sourceAccount || ''} className="font-mono text-purple-600" />
            </p>
            <p className="text-sm text-gray-500 italic break-words">
              Account pays own reserves
            </p>
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'revoke_sponsorship':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-purple-600">Revoke Sponsorship</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Source: <CopyableAddress address={data.sourceAccount || ''} className="font-mono text-purple-600" />
            </p>

            <div className="bg-purple-50 p-3 rounded-lg border-l-4 border-purple-400">
              <p className="text-sm font-medium text-purple-700 mb-2">Revoking Sponsorship For:</p>

              {data.operation?.account_id && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Account:</p>
                  <p className="text-sm break-all"><CopyableAddress address={data.operation.account_id} className="font-mono text-purple-800" /></p>
                </div>
              )}

              {data.operation?.claimable_balance_id && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Claimable Balance:</p>
                  <div className="text-sm break-all">
                    <CopyableField value={data.operation.claimable_balance_id} className="font-mono text-purple-800" />
                  </div>
                </div>
              )}

              {data.operation?.data_account_id && data.operation?.data_name && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Data Entry:</p>
                  <p className="text-sm text-purple-800">
                    Name: <CopyableField value={data.operation.data_name} className="font-mono" />
                  </p>
                  <p className="text-sm break-all">
                    Account: <CopyableAddress address={data.operation.data_account_id} className="font-mono text-purple-800" />
                  </p>
                </div>
              )}

              {data.operation?.offer_id && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Offer:</p>
                  <p className="text-sm text-purple-800">
                    ID: <CopyableField value={data.operation.offer_id} className="font-mono text-purple-800" />
                  </p>
                  {data.operation.seller && (
                    <p className="text-sm text-purple-800">
                      Seller: <CopyableAddress address={data.operation.seller} className="font-mono text-purple-800" />
                    </p>
                  )}
                </div>
              )}

              {data.operation?.trustline_account_id && (
                <div className="mb-2">
                  <p className="text-xs text-purple-600 font-medium">Trustline:</p>
                  <p className="text-sm break-all">
                    <CopyableAddress address={data.operation.trustline_account_id} className="font-mono text-purple-800" />
                  </p>
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
                  <p className="text-sm break-all">
                    Account: <CopyableAddress address={data.operation.signer_account_id} className="font-mono text-purple-800" />
                  </p>
                  <p className="text-sm break-all">
                    Key: <CopyableAddress address={data.operation.signer_key} className="font-mono text-purple-800" />
                  </p>
                </div>
              )}
            </div>

            <div className="bg-amber-50 p-2 rounded border-l-2 border-amber-400">
              <p className="text-xs text-amber-700">
                The sponsoring account will no longer pay for the reserves of this ledger entry
              </p>
            </div>
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'change_trust':
        // Determine operation type from effects, not from hardcoded limit checks
        const trustlineEffects = (data as any).operationEffects || [];
        const hasTrustlineRemoved = trustlineEffects.some((eff: any) => eff.type === 'trustline_removed');
        const hasTrustlineCreated = trustlineEffects.some((eff: any) => eff.type === 'trustline_created');
        const hasTrustlineUpdated = trustlineEffects.some((eff: any) => eff.type === 'trustline_updated');

        let trustlineAction = 'Establish Trustline';
        let trustlineStatus = '(Trustline Created)';

        if (hasTrustlineRemoved) {
          trustlineAction = 'Remove Trustline';
          trustlineStatus = '(Trustline Removed)';
        } else if (hasTrustlineUpdated) {
          trustlineAction = 'Update Trustline';
          trustlineStatus = '(Trustline Updated)';
        }

        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-indigo-600">
                {trustlineAction}
              </span>
              <span className="ml-2 text-xs text-indigo-500">
                {trustlineStatus}
              </span>
            </p>
            <p className="text-sm text-gray-600 break-words flex items-center">
              Trustor: <CopyableAddress address={data.sourceAccount || ''} />
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
                      <p className="text-xs break-all">
                        <CopyableAddress address={data.operation?.asset_issuer || data.assetIssuer} className="font-mono text-indigo-700" />
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
              <p className="text-xs text-blue-600 font-medium mb-1">Trust Limit:</p>
              {hasTrustlineRemoved ? (
                <p className="text-sm text-red-600">
                  <span className="font-bold">0</span>
                  <span className="text-xs text-red-500 ml-2">(removing trustline)</span>
                </p>
              ) : (
                <div>
                  <p className="text-sm text-blue-800 font-bold">
                    {formatAmount(data.operation?.limit || data.limit || '0')}
                  </p>
                  {(data.operation?.limit === '922337203685.4775807' || data.limit === '922337203685.4775807') && (
                    <p className="text-xs text-blue-600 mt-1">(maximum possible limit)</p>
                  )}
                </div>
              )}
            </div>

            {hasTrustlineRemoved ? (
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
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
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
            <p className="text-sm text-gray-600 break-words flex items-center">
              Account: <CopyableAddress address={data.sourceAccount || ''} />
            </p>

            <div className="bg-cyan-50 p-3 rounded-lg border-l-4 border-cyan-400">
              <p className="text-xs text-cyan-600 font-medium mb-2">Data Entry Name:</p>
              <div className="text-sm break-all bg-cyan-100 px-2 py-1 rounded">
                <CopyableField value={data.operation?.name || data.name || 'N/A'} className="font-mono text-cyan-800" />
              </div>
            </div>

            {data.operation?.value ? (
              <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                <p className="text-xs text-blue-600 font-medium mb-2">Value:</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-blue-500 mb-1">Base64:</p>
                    <div className="text-xs break-all bg-blue-100 px-2 py-1 rounded max-h-20 overflow-y-auto">
                      <CopyableField value={data.operation.value} className="font-mono text-blue-800" />
                    </div>
                  </div>
                  {(() => {
                    try {
                      const decoded = atob(data.operation.value);
                      return (
                        <div>
                          <p className="text-xs text-blue-500 mb-1">Decoded (UTF-8):</p>
                          <div className="text-xs break-all bg-blue-100 px-2 py-1 rounded max-h-20 overflow-y-auto">
                            <CopyableField value={decoded} className="font-mono text-blue-800" />
                          </div>
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
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'create_claimable_balance':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-emerald-600">Create Claimable Balance</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Sponsor: <CopyableAddress address={data.sourceAccount || ''} />
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
                        return (
                          <span>
                            <CopyableField value={code} className="font-medium" />:
                            <CopyableAddress address={issuer} className="font-mono text-emerald-800" />
                          </span>
                        );
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
              {(data.operation?.asset_issuer || data.assetIssuer) && !(data.asset && data.asset.includes(':')) && (
                <p className="text-xs text-emerald-600 mt-1 break-words">
                  Issuer: <CopyableAddress address={data.operation?.asset_issuer || data.assetIssuer} className="font-mono text-emerald-700" />
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
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs text-blue-600 font-medium">Claimant {idx + 1}</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">
                          {isUnconditionalPredicate(claimant.predicate) ? 'Unconditional' : 'Conditional'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-mono text-blue-800 flex-1 break-all">
                          {claimant.destination}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(claimant.destination);
                          }}
                          className="flex-shrink-0 p-1.5 bg-blue-100 hover:bg-blue-200 rounded text-blue-600 transition-colors"
                          title="Copy address"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {!isUnconditionalPredicate(claimant.predicate) && (
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
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'set_options':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-orange-600">Set Account Options</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Account: <CopyableAddress address={data.sourceAccount || ''} className="font-mono text-blue-600" />
            </p>

            {(data.operation?.inflation_dest || data.inflationDest) && (
              <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                <p className="text-xs text-blue-600 font-medium mb-1">Inflation Destination:</p>
                <p className="text-sm break-all">
                  <CopyableAddress address={data.operation?.inflation_dest || data.inflationDest} className="font-mono text-blue-800" />
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
                  <p className="text-sm break-all bg-teal-100 px-2 py-1 rounded">
                    <CopyableAddress address={data.operation?.signer_key || data.signer?.key || ''} className="font-mono text-teal-800" />
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
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      case 'account_merge':
        return (
          <div className="space-y-2">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-orange-600">Account Merge</span>
            </p>

            {/* Source Account (being merged) */}
            <div className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
              <p className="text-xs text-red-600 font-medium mb-1">Source Account (Closing):</p>
              <p className="text-sm break-words">
                <CopyableAddress address={data.sourceAccount || data.account || ''} />
              </p>
            </div>

            {/* Destination Account */}
            <div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
              <p className="text-xs text-green-600 font-medium mb-1">Merged Into:</p>
              <p className="text-sm break-words">
                <CopyableAddress address={data.into || data.destination || ''} />
              </p>
            </div>

            <div className="bg-orange-50 p-2 rounded border-l-2 border-orange-400">
              <p className="text-xs text-orange-700">
                The source account will be closed and all remaining XLM will be transferred to the destination account.
              </p>
            </div>

            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
          </div>
        );

      default:
        return (
          <div className="space-y-1">
            <p className="text-base text-gray-600 break-words">
              <span className="font-medium text-gray-600 capitalize">{data.type.replace(/_/g, ' ')}</span>
            </p>
            <p className="text-sm text-gray-600 break-words">
              Source: <CopyableAddress address={data.sourceAccount || ''} className="font-mono text-blue-600" />
            </p>
            <RelatedEffectsSection effects={(data as any).operationEffects} operationType={data.type} />
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
    <div className={`px-5 py-3 bg-white rounded-xl shadow-md border-2 transition-all duration-300 ${getExecutionStateStyles()} relative select-text overflow-hidden`} style={{ width: '550px' }}>
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
      <Handle type="target" position={Position.Left} className="!bg-blue-400" style={{ top: '50%' }} />
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
      <Handle type="source" position={Position.Right} className="!bg-blue-400" style={{ top: '50%' }} />

    </div>
  );
}
