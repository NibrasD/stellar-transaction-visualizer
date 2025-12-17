import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  NodeTypes,
  Connection,
  MiniMap,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Handle, Position } from 'reactflow';
import * as StellarSdk from '@stellar/stellar-sdk';
import { simpleContractMetadataService, TypeDefinition } from '../services/simpleContractMetadata';
import { decodeScVal } from '../services/stellar';
import { CopyButton } from './CopyButton';
import * as Tooltip from '@radix-ui/react-tooltip';

// Fetch token symbol from contract (uses metadata service)
async function fetchTokenSymbol(contractAddress: string, networkUrl: string): Promise<string | null> {
  try {
    const metadata = await simpleContractMetadataService.getTokenMetadata(contractAddress);

    if (metadata?.tokenSymbol) {
      return metadata.tokenSymbol;
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Fetch token decimals from contract (uses metadata service)
async function fetchTokenDecimals(contractAddress: string): Promise<number | null> {
  try {
    const metadata = await simpleContractMetadataService.getTokenMetadata(contractAddress);

    if (metadata?.tokenDecimals !== undefined && metadata.tokenDecimals !== null) {
      return metadata.tokenDecimals;
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Format amount with proper decimals
function formatAmountWithDecimals(amount: string | number | bigint, decimals?: number | null): string {
  // Default to 7 decimals (Soroban standard) if not specified
  const effectiveDecimals = (decimals !== undefined && decimals !== null) ? decimals : 7;
  return simpleContractMetadataService.formatAmount(amount, effectiveDecimals);
}

// Helper to safely decode event topics
function decodeTopic(topic: any): string {
  if (!topic) return '';

  // If already a string, return it
  if (typeof topic === 'string') return topic;

  // If it's a number or boolean, convert to string
  if (typeof topic === 'number' || typeof topic === 'boolean') {
    return String(topic);
  }

  // If it's an ScVal object, decode it
  try {
    const decoded = decodeScVal(topic);
    if (decoded === null || decoded === undefined) return '';

    // If decoded result is an object, it's custom event data (not an event name)
    if (typeof decoded === 'object') {
      return 'Custom Event';
    }

    return String(decoded);
  } catch (e) {
    return '';
  }
}


interface NetworkConfig {
  isTestnet: boolean;
  networkUrl: string;
  networkPassphrase: string;
}

interface UserOperationFlowProps {
  events: any[];
  sourceAccount?: string;
  functionName?: string;
  assetBalanceChanges?: any[];
  effects?: any[];
  networkConfig?: NetworkConfig;
}

const decodeContractId = (value: any): string => {
  if (!value) return 'unknown';

  if (typeof value === 'string' && (value.startsWith('C') || value.startsWith('G')) && value.length === 56) {
    return value;
  }

  if (typeof value === 'string' && value.includes('=')) {
    try {
      const binaryString = atob(value);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (bytes.length === 32) {
        try {
          return StellarSdk.StrKey.encodeContract(bytes);
        } catch {
          try {
            return StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
          } catch {
            return value;
          }
        }
      }
    } catch (e) {
    }
  }

  return String(value);
};

const decodeBase64Value = (value: any): { decoded: string; type: string } => {
  if (!value || typeof value !== 'string') {
    return { decoded: String(value || ''), type: 'raw' };
  }

  // Check if it's a plain number string first
  if (/^\d+$/.test(value)) {
    return { decoded: value, type: 'number' };
  }

  // Check if already a decoded Stellar address
  if (value.startsWith('G') && value.length === 56) {
    return { decoded: value, type: 'account' };
  }
  if (value.startsWith('C') && value.length === 56) {
    return { decoded: value, type: 'contract' };
  }

  // Try to decode as base64 (with or without padding)
  if (/^[A-Za-z0-9+/]+=*$/.test(value) && value.length >= 4) {
    try {
      // Add padding if missing
      let paddedValue = value;
      while (paddedValue.length % 4 !== 0) {
        paddedValue += '=';
      }

      const binaryString = atob(paddedValue);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (bytes.length === 32) {
        try {
          const contractId = StellarSdk.StrKey.encodeContract(bytes);
          if (contractId.startsWith('C') && contractId.length === 56) {
            return { decoded: contractId, type: 'contract' };
          }
        } catch { }

        try {
          const publicKey = StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
          if (publicKey.startsWith('G') && publicKey.length === 56) {
            return { decoded: publicKey, type: 'account' };
          }
        } catch { }
      }

      let text = '';
      let isPrintable = true;
      for (let i = 0; i < bytes.length; i++) {
        const char = bytes[i];
        if ((char >= 32 && char <= 126) || char === 9 || char === 10 || char === 13) {
          text += String.fromCharCode(char);
        } else {
          isPrintable = false;
          break;
        }
      }

      if (isPrintable && text.length > 0) {
        return { decoded: text, type: 'text' };
      }

      if (bytes.length <= 8) {
        let num = BigInt(0);
        for (let i = 0; i < bytes.length; i++) {
          num = (num << BigInt(8)) | BigInt(bytes[i]);
        }
        return { decoded: num.toString(), type: 'number' };
      }

      return { decoded: value, type: 'base64' };
    } catch {
      return { decoded: value, type: 'raw' };
    }
  }

  return { decoded: value, type: 'raw' };
};

// Helper to check if an object looks like a serialized Buffer/Uint8Array (numeric keys 0, 1, 2, ...)
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

// Helper to check if an object is a Node.js Buffer representation (e.g., {type: "Buffer", data: [...]} )
const isNodeBuffer = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  return obj.type === 'Buffer' && Array.isArray(obj.data);
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

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString();
  if (typeof val === 'boolean') return val ? 'yes' : 'no';

  // Handle Node.js Buffer representation
  if (isNodeBuffer(val)) {
    const bytes = new Uint8Array(val.data);
    const formatted = formatBufferValue(bytes);
    return formatted.display;
  }

  // Handle serialized buffer
  if (isSerializedBuffer(val)) {
    const bytes = serializedBufferToUint8Array(val);
    const formatted = formatBufferValue(bytes);
    return formatted.display;
  }

  if (Array.isArray(val)) {
    const processedArray = val.map(item => preprocessForDisplay(item));
    return processedArray.map(item => formatValue(item)).filter(Boolean).join(', ');
  }

  if (typeof val === 'object') {
    try {
      const processed = preprocessForDisplay(val);
      return JSON.stringify(processed, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
    } catch (e) {
      return '[Complex Object]';
    }
  }
  return String(val);
};

const formatAddress = (address: string): string => {
  if (!address || address.length < 12) return address;
  return `${address.substring(0, 4)}…${address.substring(address.length - 4)}`;
};

// Format value according to its type definition from contract metadata
const formatValueByType = (
  value: any,
  typeName: string,
  typeDefinitions: TypeDefinition[] | undefined,
  depth: number = 0
): string => {
  if (value === null || value === undefined) return 'null';
  if (depth > 5) return formatValue(value); // Prevent infinite recursion

  // Handle primitive types first
  const lowerType = typeName.toLowerCase();
  if (['i32', 'i64', 'i128', 'i256', 'u32', 'u64', 'u128', 'u256'].includes(lowerType)) {
    return String(value);
  }
  if (lowerType === 'bool') {
    return value ? 'true' : 'false';
  }
  if (lowerType === 'address') {
    if (typeof value === 'string') {
      return value.length > 12 ? formatAddress(value) : value;
    }
    return formatValue(value);
  }
  if (lowerType === 'symbol' || lowerType === 'string') {
    return String(value);
  }
  if (lowerType.startsWith('bytesn<') || lowerType === 'bytes') {
    // Handle bytes - format as hex or address
    return formatValue(value);
  }

  // Handle Vec<T>
  const vecMatch = typeName.match(/^Vec<(.+)>$/i);
  if (vecMatch && Array.isArray(value)) {
    const elementType = vecMatch[1];
    const formatted = value.map(item => formatValueByType(item, elementType, typeDefinitions, depth + 1));
    return `[${formatted.join(', ')}]`;
  }

  // Handle Option<T>
  const optionMatch = typeName.match(/^Option<(.+)>$/i);
  if (optionMatch) {
    if (value === null || value === undefined) return 'None';
    const innerType = optionMatch[1];
    return `Some(${formatValueByType(value, innerType, typeDefinitions, depth + 1)})`;
  }

  // Handle Result<T, E>
  const resultMatch = typeName.match(/^Result<(.+),\s*(.+)>$/i);
  if (resultMatch) {
    if (typeof value === 'object' && value !== null) {
      if ('Ok' in value || 'ok' in value) {
        const okValue = value.Ok ?? value.ok;
        return `Ok(${formatValueByType(okValue, resultMatch[1], typeDefinitions, depth + 1)})`;
      }
      if ('Err' in value || 'err' in value) {
        const errValue = value.Err ?? value.err;
        return `Err(${formatValueByType(errValue, resultMatch[2], typeDefinitions, depth + 1)})`;
      }
    }
  }

  // Look up UDT (User Defined Type) in type definitions
  if (typeDefinitions && typeof value === 'object' && value !== null) {
    const typeDef = typeDefinitions.find(t => t.name === typeName);

    if (typeDef) {
      // Handle struct
      if (typeDef.kind === 'struct' && typeDef.fields) {
        const parts: string[] = [];
        for (const field of typeDef.fields) {
          const fieldValue = value[field.name];
          if (fieldValue !== undefined) {
            const formattedValue = formatValueByType(fieldValue, field.type, typeDefinitions, depth + 1);
            parts.push(`${field.name}: ${formattedValue}`);
          }
        }
        return `{ ${parts.join(', ')} }`;
      }

      // Handle enum
      if ((typeDef.kind === 'enum' || typeDef.kind === 'union') && typeDef.variants) {
        // For enums, the value is usually a number or the variant name
        if (typeof value === 'number') {
          const variant = typeDef.variants.find(v => v.value === value);
          return variant ? variant.name : String(value);
        }
        if (typeof value === 'string') {
          return value;
        }
        // For tagged unions, value is an object with variant name as key
        const keys = Object.keys(value);
        if (keys.length === 1) {
          const variantName = keys[0];
          const innerValue = value[variantName];
          if (innerValue === null || innerValue === undefined ||
            (typeof innerValue === 'object' && Object.keys(innerValue).length === 0)) {
            return variantName;
          }
          return `${variantName}(${formatValue(innerValue)})`;
        }
      }
    }
  }

  // Fallback to default formatting
  return formatValue(value);
};

const formatAmount = (amount: string): { raw: string; formatted: string } => {
  if (!amount) return { raw: '0', formatted: '0' };
  const decimals = 7;

  // Use BigInt for precision
  const divisor = Math.pow(10, decimals);
  const numericAmount = BigInt(amount);
  const integerPart = numericAmount / BigInt(divisor);
  const fractionalPart = numericAmount % BigInt(divisor);

  const fractionalStr = String(fractionalPart).padStart(decimals, '0');
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  let formatted: string;
  if (trimmedFractional) {
    formatted = `${integerPart.toLocaleString()}.${trimmedFractional}`;
  } else {
    formatted = integerPart.toLocaleString();
  }

  return {
    raw: amount,
    formatted: formatted
  };
};

interface OperationNodeData {
  stepNumber: string;
  emoji: string;
  title: string;
  content: string[];
  isPhaseHeader?: boolean;
  isSummaryHeader?: boolean;
  phaseTitle?: string;
  phaseEmoji?: string;
  phaseDescription?: string;
  phaseParams?: string[];
  isCompactGroup?: boolean;
  isInitiator?: boolean;
  groupCount?: number;
  returnValue?: string;
  isFinalResult?: boolean;
}

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

  const showTooltip = displayValue && displayValue !== value;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            onClick={handleCopy}
            className={`cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-all px-0.5 rounded select-all ${copied ? 'bg-green-100 text-green-800 font-semibold' : ''} ${className}`}
            title={showTooltip ? `Full value: ${value}` : "Click to copy"}
          >
            {copied ? '✓ Copied!' : (displayValue || value)}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-gray-900 text-white px-3 py-2 rounded text-sm max-w-sm break-all z-50"
            sideOffset={5}
          >
            {copied ? 'Copied to clipboard!' : showTooltip ? `Full: ${value}` : 'Click to copy'}
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

const OperationNodeComponent = ({ data }: { data: OperationNodeData }) => {
  // Final result summary node
  if (data.isFinalResult) {
    return (
      <div className="px-4 py-4 shadow-2xl rounded-xl border-3 border-emerald-500 bg-gradient-to-br from-emerald-50 via-green-50 to-white w-[340px]">
        <Handle type="target" position={Position.Top} className="w-3 h-3" />

        <div className="flex items-start gap-3">
          <span className="text-3xl flex-shrink-0">{data.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg text-emerald-900 mb-2 break-words">{data.title}</div>
            {data.content.length > 0 && (
              <div className="space-y-1.5">
                {data.content.map((line, idx) => {
                  // Parse display value and full value if delimiter exists
                  let displayValue = line;
                  let fullValue = line;
                  if (line.includes('||')) {
                    const parts = line.split('||');
                    displayValue = parts[0];
                    fullValue = parts[1];
                  }

                  return (
                    <div key={idx} className="text-sm text-emerald-800 font-medium bg-white/70 px-3 py-1.5 rounded-lg border border-emerald-200 break-words">
                      <CopyableText value={fullValue} displayValue={displayValue} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <Handle type="source" position={Position.Bottom} className="w-3 h-3 opacity-0" />
      </div>
    );
  }

  if (data.isInitiator) {
    return (
      <div className="px-4 py-3 shadow-xl rounded-xl border-2 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 w-[320px]">
        <Handle type="target" position={Position.Top} className="w-3 h-3 opacity-0" />

        <div className="flex items-center gap-2">
          <span className="text-2xl flex-shrink-0">{data.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base text-blue-900 break-words">{data.title}</div>
            {data.content.length > 0 && (
              <div className="text-xs text-blue-700 mt-0.5 break-words">{data.content[0]}</div>
            )}
          </div>
        </div>

        <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      </div>
    );
  }

  if (data.isSummaryHeader) {
    return (
      <div className="px-4 py-3 shadow-md rounded-xl border-2 border-gray-300 bg-gradient-to-r from-gray-50 to-white w-[320px]">
        <Handle type="target" position={Position.Top} className="w-3 h-3" />

        <div className="flex items-center gap-2">
          <span className="text-2xl flex-shrink-0">{data.phaseEmoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base text-gray-900 break-words">{data.phaseTitle}</div>
            {data.phaseDescription && (
              <div className="text-xs text-gray-600 mt-0.5 break-words">
                {data.phaseDescription}
              </div>
            )}
          </div>
        </div>

        <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      </div>
    );
  }

  if (data.isPhaseHeader) {
    return (
      <div className="px-3 py-2.5 shadow-lg rounded-xl border-2 border-blue-300 bg-white w-[320px]">
        <Handle type="target" position={Position.Top} className="w-3 h-3" />

        <div className="flex items-start gap-2 mb-2 pb-2 border-b border-blue-200">
          <span className="text-xl flex-shrink-0">{data.phaseEmoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-blue-900 mb-0.5 break-words leading-tight">{data.phaseTitle}</div>
            {data.phaseDescription && (
              <div className="text-[10px] text-gray-500 font-mono truncate">
                {data.phaseDescription}
              </div>
            )}
          </div>
        </div>

        {data.phaseParams && data.phaseParams.length > 0 && (
          <div className="space-y-1.5">
            {data.phaseParams.map((param, idx) => {
              // تجاهل الأسطر الفارغة تمامًا
              if (!param || param.trim() === '') return null;

              const [label, ...valueParts] = param.split(':');
              let valueStr = valueParts.join(':').trim();

              // Parse display value and full value if delimiter exists
              let displayValue = valueStr;
              let fullValue = valueStr;
              if (valueStr.includes('||')) {
                const parts = valueStr.split('||');
                displayValue = parts[0];
                fullValue = parts[1];
              }

              return (
                <div
                  key={idx}
                  className="bg-gradient-to-r from-blue-50 to-white px-2.5 py-1.5 rounded border border-blue-200"
                >
                  <div className="text-xs text-gray-800 break-all leading-relaxed">
                    <span className="font-semibold text-blue-700">{label}</span>
                    {valueStr && (
                      <>
                        <span className="font-semibold text-blue-700"> :</span>{' '}
                        <span className="font-mono">
                          <CopyableText value={fullValue} displayValue={displayValue} />
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      </div>
    );
  }

  if (data.isCompactGroup) {
    return (
      <div className="px-2 py-2 shadow-md rounded-lg border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white w-[180px]">
        <Handle type="target" position={Position.Top} className="w-3 h-3" />

        <div className="flex items-start gap-1.5">
          <span className="text-base flex-shrink-0">{data.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[11px] text-gray-900 mb-1 break-words leading-tight">{data.title}</div>

            {data.content.length > 0 && (
              <div className="space-y-1">
                {data.content.map((line, idx) => {
                  const [label, ...valueParts] = line.split(':');
                  let valueStr = valueParts.join(':').trim();

                  // Parse display value and full value if delimiter exists
                  let displayValue = valueStr;
                  let fullValue = valueStr;
                  if (valueStr.includes('||')) {
                    const parts = valueStr.split('||');
                    displayValue = parts[0];
                    fullValue = parts[1];
                  }

                  if (!valueStr) {
                    return (
                      <div key={idx} className="text-[9px] text-gray-700 bg-white/80 px-1.5 py-0.5 rounded border border-gray-100 break-words">
                        {line}
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="bg-white px-1.5 py-1 rounded border border-gray-200">
                      <div className="text-[9px] text-gray-800 break-all leading-relaxed">
                        <span className="font-semibold text-blue-600">{label} :</span>{' '}
                        <span className="font-mono">
                          <CopyableText value={fullValue} displayValue={displayValue} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      </div>
    );
  }

  const isVerificationNode = data.emoji === '✅';
  const isCalculationNode = data.emoji === '🧮';
  const isMintNode = data.emoji === '🪙';
  const isBroadcastNode = data.emoji === '📡';
  const isTransferNode = data.emoji === '💰';

  let borderColor = 'border-blue-200';
  let bgGradient = 'bg-white';
  let titleColor = 'text-gray-800';

  if (isVerificationNode) {
    borderColor = 'border-green-300';
    bgGradient = 'bg-gradient-to-br from-green-50 to-white';
    titleColor = 'text-green-800';
  } else if (isCalculationNode) {
    borderColor = 'border-blue-300';
    bgGradient = 'bg-gradient-to-br from-blue-50 to-white';
    titleColor = 'text-blue-800';
  } else if (isMintNode) {
    borderColor = 'border-amber-300';
    bgGradient = 'bg-gradient-to-br from-amber-50 to-white';
    titleColor = 'text-amber-800';
  } else if (isBroadcastNode) {
    borderColor = 'border-purple-300';
    bgGradient = 'bg-gradient-to-br from-purple-50 to-white';
    titleColor = 'text-purple-800';
  } else if (isTransferNode) {
    borderColor = 'border-emerald-300';
    bgGradient = 'bg-gradient-to-br from-emerald-50 to-white';
    titleColor = 'text-emerald-800';
  }

  return (
    <div className={`px-3 py-2.5 shadow-lg rounded-xl border-2 ${borderColor} ${bgGradient} hover:shadow-2xl transition-all duration-200 w-[320px]`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      <div className="flex items-start gap-2">
        <span className="text-xl flex-shrink-0">{data.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm ${titleColor} mb-1.5 break-words leading-tight`}>{data.title}</div>

          {data.content.length > 0 && (
            <div className="space-y-1.5">
              {data.content.map((line, idx) => {
                const [label, ...valueParts] = line.split(':');
                let valueStr = valueParts.join(':').trim();

                // Parse display value and full value if delimiter exists
                let displayValue = valueStr;
                let fullValue = valueStr;
                if (valueStr.includes('||')) {
                  const parts = valueStr.split('||');
                  displayValue = parts[0];
                  fullValue = parts[1];
                }

                // Check if this is a return value line
                const isReturnValue = line.startsWith('→ Returns:') || label.toLowerCase().includes('return');

                if (!valueStr) {
                  return (
                    <div key={idx} className="text-xs text-gray-700 bg-white/50 px-2 py-1 rounded break-words">
                      {line}
                    </div>
                  );
                }

                // Special prominent styling for return values
                if (isReturnValue) {
                  return (
                    <div key={idx} className="bg-gradient-to-r from-blue-50 to-indigo-50 px-2.5 py-2 rounded-lg border-2 border-blue-300 shadow-md">
                      <div className="text-xs text-gray-800 break-all leading-relaxed">
                        <span className="font-bold text-blue-700">{label.replace('→ ', '')} :</span>{' '}
                        <span className="font-mono font-semibold">
                          <CopyableText value={fullValue} displayValue={displayValue} />
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={idx} className="bg-white px-2.5 py-1.5 rounded border border-gray-200">
                    <div className="text-xs text-gray-800 break-all leading-relaxed">
                      <span className="font-semibold text-blue-700">{label} :</span>{' '}
                      <span className="font-mono">
                        <CopyableText value={fullValue} displayValue={displayValue} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show explicit return value with prominent display */}
          {data.returnValue && (
            <div className="mt-2 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-2 rounded-lg border-2 border-emerald-400 shadow-md">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold mb-1">
                ↩ RETURN VALUE
              </div>
              <div className="text-sm text-emerald-900 font-mono font-semibold break-all">
                <CopyableText value={data.returnValue} />
              </div>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  operation: OperationNodeComponent,
};

interface CallNode {
  event: any;
  contract: string;
  function: string;
  args: any[];
  topics: any[];
  index: number;
  depth: number;
  parent: number | null;
  children: number[];
}

function UserOperationFlowInner({ events, sourceAccount, functionName, assetBalanceChanges = [], effects = [], networkConfig }: UserOperationFlowProps) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes] = React.useState<Node[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);
  const [fetchedSymbols, setFetchedSymbols] = useState<Map<string, string>>(new Map());
  const [simplifiedMode, setSimplifiedMode] = useState<boolean>(false); // Developer mode by default - shows all technical details
  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<string>('');

  useEffect(() => {
    const generateFlow = async () => {
      const generatedNodes: Node[] = [];
      const generatedEdges: Edge[] = [];
      let yOffset = 100;
      const ySpacing = 120;
      let xCenter = 700;

      // Set network config on metadata service
      if (networkConfig) {
        const network = networkConfig.isTestnet ? 'testnet' : 'mainnet';
        const rpcUrl = networkConfig.isTestnet
          ? 'https://soroban-testnet.stellar.org'
          : 'https://soroban.stellar.org';
        simpleContractMetadataService.setNetwork(network, rpcUrl, networkConfig.networkPassphrase);
      }

      // Pre-fetch all contract metadata
      const contractAddresses = new Set<string>();
      events.forEach(event => {
        if (event.contractId) {
          contractAddresses.add(event.contractId);
        }

        // Also extract contracts from topics (fn_call events have contract in topics[1])
        if (event.topics && Array.isArray(event.topics)) {
          event.topics.forEach((topic: any) => {
            if (topic) {
              const decoded = decodeContractId(topic);
              // Check if it looks like a contract address (starts with C and is 56 chars)
              if (decoded && typeof decoded === 'string' && decoded.startsWith('C') && decoded.length === 56) {
                contractAddresses.add(decoded);
              }
            }
          });
        }

        // Extract token addresses from data field (for swaps_chain and other parameters)
        if (event.data) {
          try {
            const decodedValue = decodeScVal(event.data);
            // Check if this is a swaps_chain array
            if (Array.isArray(decodedValue)) {
              decodedValue.forEach((item: any) => {
                if (Array.isArray(item)) {
                  // This might be a swap hop [path, pool, tokenOut]
                  if (item.length >= 3) {
                    // Extract tokenOut from hop
                    const tokenOut = item[2];
                    if (typeof tokenOut === 'string' && tokenOut.startsWith('C') && tokenOut.length === 56) {
                      contractAddresses.add(tokenOut);
                    }
                  }
                  // Extract tokens from path array
                  if (Array.isArray(item[0])) {
                    item[0].forEach((pathToken: any) => {
                      if (typeof pathToken === 'string' && pathToken.startsWith('C') && pathToken.length === 56) {
                        contractAddresses.add(pathToken);
                      }
                    });
                  }
                } else if (typeof item === 'string' && item.startsWith('C') && item.length === 56) {
                  // Direct token address
                  contractAddresses.add(item);
                }
              });
            }
          } catch (e) {
            // Ignore errors in parsing data
          }
        }
      });

      setIsLoadingMetadata(true);
      setLoadingProgress(`Loading contract metadata (0/${contractAddresses.size})...`);

      const metadataMap = new Map<string, any>();

      // Helper to add timeout to metadata fetching
      const fetchWithTimeout = async (contractAddr: string, timeoutMs: number = 5000) => {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        );

        try {
          const metadata = await Promise.race([
            simpleContractMetadataService.getContractMetadata(contractAddr),
            timeoutPromise
          ]);
          return metadata;
        } catch (error) {
          return null;
        }
      };

      // Fetch metadata with progress updates
      let completed = 0;
      await Promise.all(
        Array.from(contractAddresses).map(async (contractAddr) => {
          const metadata = await fetchWithTimeout(contractAddr, 8000); // Increase timeout to 8s
          if (metadata) {
            metadataMap.set(contractAddr, metadata);
          } else {
          }
          completed++;
          setLoadingProgress(`Loading contract metadata (${completed}/${contractAddresses.size})...`);
        })
      );

      setIsLoadingMetadata(false);

      // Log all unique event types
      const eventTypes = new Set(events.map(e => decodeTopic(e.topics?.[0])).filter(Boolean));

      // Log sample events of each type
      eventTypes.forEach(eventType => {
        const sampleEvent = events.find(e => decodeTopic(e.topics?.[0]) === eventType);
        if (sampleEvent?.topics) {
        }
      });

      // Extract token symbols from token-related events
      // - "mint" events: [0]="mint", [1]=recipient, [2]="SYMBOL:CONTRACT_ADDRESS"
      // - "transfer" events: [0]="transfer", [1]=from, [2]=to, [3]=asset_info
      events.forEach(event => {
        const contractId = event.contractId;

        if (event.topics && Array.isArray(event.topics)) {
          const eventType = decodeTopic(event.topics[0]);

          // Handle mint events
          if (eventType === 'mint' && event.topics.length >= 3) {
            const tokenInfo = decodeTopic(event.topics[2]);

            if (contractId && typeof tokenInfo === 'string' && tokenInfo.includes(':')) {
              const symbol = tokenInfo.split(':')[0];

              // Merge with existing metadata to preserve decimals
              const existing = metadataMap.get(contractId) || {};
              metadataMap.set(contractId, {
                ...existing,
                tokenSymbol: symbol,
                isToken: true
              });
            }
          }

          // Handle transfer events
          else if (eventType === 'transfer' && event.topics.length >= 4) {
            const assetInfo = decodeTopic(event.topics[3]);

            if (contractId && typeof assetInfo === 'string') {
              let symbol: string | null = null;

              if (assetInfo === 'native') {
                symbol = 'XLM';
              } else if (assetInfo.includes(':')) {
                symbol = assetInfo.split(':')[0];
              }

              if (symbol) {
                // Merge with existing metadata to preserve decimals
                const existing = metadataMap.get(contractId) || {};
                metadataMap.set(contractId, {
                  ...existing,
                  tokenSymbol: symbol,
                  isToken: true
                });
              }
            }
          }
        }
      });

      // Helper to map short function names to friendly names
      const getFriendlyFunctionName = (fnName: string): string => {
        const mapping: Record<string, string> = {
          's': 'swap',
          'swap_exact_tokens_for_tokens': 'swap',
          'swap_tokens_for_exact_tokens': 'swap',
        };
        return mapping[fnName.toLowerCase()] || fnName;
      };

      // Helper to detect contract type based on functions and events
      const detectContractType = (contractId: string): string => {
        // Collect all functions called on this contract
        const contractFunctions = new Set<string>();
        const contractEvents = new Set<string>();

        events.forEach((event: any) => {
          const topics = event.topics || [];
          const eventType = decodeTopic(topics[0]);

          if (eventType === 'fn_call') {
            // For fn_call, contract address is in topics[1]
            const contractAddr = topics[1] ? decodeContractId(topics[1]) : '';
            const fnName = decodeTopic(topics[2])?.toLowerCase() || '';
            if (fnName && contractAddr === contractId) {
              contractFunctions.add(fnName);
            }
          } else if (eventType === 'fn_return') {
            // Skip
          } else {
            // For other events (transfer, mint, etc), check event.contractId
            if (event.contractId === contractId && eventType) {
              contractEvents.add(eventType);
            }
          }
        });

        // Detect Pool Contract: has get_reserves + swap, emits SoroswapPair events
        const hasGetReserves = contractFunctions.has('get_reserves');
        const hasSwapFunction = contractFunctions.has('swap');
        const hasSoroswapEvents = Array.from(contractEvents).some(e => String(e).includes('SoroswapPair'));

        if ((hasGetReserves || hasSoroswapEvents) && hasSwapFunction) {
          return '🏊 Liquidity Pool';
        }

        // Detect Token Contract: has transfer + balance + (decimals or symbol)
        const hasTransfer = contractFunctions.has('transfer');
        const hasBalance = contractFunctions.has('balance');
        const hasTokenMetadata = contractFunctions.has('decimals') ||
          contractFunctions.has('symbol') ||
          contractFunctions.has('name');

        if (hasTransfer && (hasBalance || hasTokenMetadata)) {
          return '💰 Token';
        }

        // Detect Router Contract: has 's' function (Soroban router short name) or complex swap functions
        const hasRouterSwap = contractFunctions.has('s') ||
          contractFunctions.has('swap_exact_tokens_for_tokens') ||
          contractFunctions.has('swap_tokens_for_exact_tokens');

        if (hasRouterSwap) {
          return '🔀 Router';
        }

        // Check for generic swap (might be a DEX aggregator)
        if (contractFunctions.has('swap') && !hasGetReserves) {
          return '🔀 Router';
        }

        // Default
        return '📄 Contract';
      };

      // Helper to format contract address with token symbol
      const formatAddressWithSymbol = (contractId: string): string => {
        const shortAddr = formatAddress(contractId);
        const metadata = metadataMap.get(contractId);

        // Show both contract address AND token symbol if available
        if (metadata?.tokenSymbol) {
          return `${shortAddr} (${metadata.tokenSymbol})||${contractId}`;
        }

        return `${shortAddr}||${contractId}`;
      };

      // Helper to calculate node height based on content
      const calculateNodeHeight = (contentLines: string[] | undefined): number => {
        const baseHeight = 90; // Base card height with title and padding (px-3 py-2.5 + title mb-1.5)
        const lineHeight = 40; // Height per content line (includes py-1 padding + space-y-1.5 + text height)
        const padding = 30; // Extra bottom padding and spacing
        const numLines = contentLines?.length || 0;
        return baseHeight + (numLines * lineHeight) + padding;
      };

      const filteredEvents = events.filter((event: any) => {
        const topics = event.topics || [];
        return decodeTopic(topics[0]) !== 'core_metrics';
      });

      let lastNodeId: string | null = null;

      // Step 1: Add initiator node
      if (sourceAccount) {
        const initiatorId = 'initiator';
        generatedNodes.push({
          id: initiatorId,
          type: 'operation',
          position: { x: xCenter, y: yOffset },
          data: {
            stepNumber: '',
            emoji: '👤',
            title: 'Transaction Initiated',
            content: [`Account ${formatAddress(sourceAccount)}`],
            isInitiator: true,
          },
        });

        lastNodeId = initiatorId;
        yOffset += 120;
      }

      // Step 1.5: Add trade summary if this is a swap transaction
      if (assetBalanceChanges && assetBalanceChanges.length > 0) {
        // Find debits (what user spent) and credits (what user received)
        const userChanges = assetBalanceChanges.filter((change: any) =>
          change.address === sourceAccount
        );

        const debits = userChanges.filter((c: any) => parseFloat(c.amount) < 0);
        const credits = userChanges.filter((c: any) => parseFloat(c.amount) > 0);

        if (debits.length > 0 && credits.length > 0) {
          const tradeSummaryId = 'trade-summary';
          const debitAsset = debits[0].asset_code || 'XLM';
          const debitAmount = Math.abs(parseFloat(debits[0].amount)).toFixed(2);
          const creditAsset = credits[0].asset_code || 'XLM';
          const creditAmount = Math.abs(parseFloat(credits[0].amount)).toFixed(2);

          generatedNodes.push({
            id: tradeSummaryId,
            type: 'operation',
            position: { x: xCenter, y: yOffset },
            data: {
              stepNumber: '',
              emoji: '💱',
              title: 'Trade Summary',
              content: [
                `Swapped ${debitAmount} ${debitAsset} → ${creditAmount} ${creditAsset}`,
                ``,
                `Rate: ${(parseFloat(creditAmount) / parseFloat(debitAmount)).toFixed(4)} ${creditAsset}/${debitAsset}`
              ],
              isSummary: true,
            },
          });

          if (lastNodeId) {
            generatedEdges.push({
              id: `${lastNodeId}-${tradeSummaryId}`,
              source: lastNodeId,
              target: tradeSummaryId,
              type: 'straight',
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
              style: { stroke: '#10b981', strokeWidth: 3 },
            });
          }

          lastNodeId = tradeSummaryId;
          yOffset += 120;
        }
      }

      // Step 2: Parse ALL fn_call and fn_return events
      const fnCallEvents = filteredEvents.filter((e: any) => {
        if (!e || !e.topics || !Array.isArray(e.topics)) return false;
        return decodeTopic(e.topics[0]) === 'fn_call';
      });

      const fnReturnEvents = filteredEvents.filter((e: any) => {
        if (!e || !e.topics || !Array.isArray(e.topics)) return false;
        return decodeTopic(e.topics[0]) === 'fn_return';
      });

      if (fnCallEvents.length === 0) {
        // Fallback: If no fn_call events, create a basic operation node from function name
        if (functionName && functionName !== 'InvokeContract') {
          const operationId = 'operation-fallback';

          // Check if there are any other events we can show
          const otherEvents = filteredEvents.filter((e: any) => {
            const topic = decodeTopic(e?.topics?.[0]);
            return topic && topic !== 'fn_call' && topic !== 'fn_return';
          });

          const content: string[] = [];
          if (sourceAccount) {
            content.push(`Caller: ${formatAddress(sourceAccount)}`);
          }

          if (otherEvents.length > 0) {
            content.push(`${otherEvents.length} contract event(s) emitted`);
            // Show first few event types
            const eventTypes = new Set<string>();
            otherEvents.slice(0, 3).forEach((e: any) => {
              const topic = decodeTopic(e?.topics?.[0]);
              if (topic) eventTypes.add(topic);
            });
            if (eventTypes.size > 0) {
              content.push(`Events: ${Array.from(eventTypes).join(', ')}`);
            }
          } else {
            content.push('No diagnostic events available');
          }

          const operationNode: Node = {
            id: operationId,
            type: 'operation',
            position: { x: 400, y: yOffset },
            data: {
              emoji: '📝',
              title: `Contract Function: ${functionName}`,
              content,
              isOperation: true
            }
          };

          generatedNodes.push(operationNode);

          // Add edge from initiator to operation
          if (lastNodeId) {
            generatedEdges.push({
              id: `${lastNodeId}-${operationId}`,
              source: lastNodeId,
              target: operationId,
              animated: false,
              style: { stroke: '#10b981', strokeWidth: 2 }
            });
          }
        }

        setNodes(generatedNodes);
        setEdges(generatedEdges);
        return;
      }

      // Step 3: Build call hierarchy by analyzing actual call stack depth
      // Track depth by counting fn_call (push) and fn_return (pop) events
      const allEvents = filteredEvents.filter((e: any) => {
        const topic = e?.topics?.[0];
        return topic === 'fn_call' || topic === 'fn_return';
      });

      // Map each fn_call to its actual depth in the call stack
      const callDepths: number[] = [];
      let currentDepth = 0;
      let callIndex = 0;

      for (const event of allEvents) {
        const eventType = decodeTopic(event?.topics?.[0]);
        const fnName = decodeTopic(event?.topics?.[2]) || 'unknown';

        if (eventType === 'fn_call') {
          callDepths[callIndex] = currentDepth;
          callIndex++;
          currentDepth++;
        } else if (eventType === 'fn_return') {
          currentDepth--;
        }
      }

      // Build hierarchy with detected depths
      const callHierarchy: CallNode[] = fnCallEvents.map((call, idx) => {
        const fn = decodeTopic(call.topics[2]) || 'unknown';
        const depth = callDepths[idx] || 0;
        return {
          event: call,
          contract: decodeContractId(call.topics[1]),
          function: fn,
          args: Array.isArray(call.data) ? call.data : [],
          topics: call.topics || [],
          index: idx,
          depth,
          parent: null,
          children: [],
        };
      });

      // Detect parent-child relationships based on actual depth
      for (let i = 0; i < callHierarchy.length; i++) {
        const current = callHierarchy[i];

        // Find all calls that are exactly 1 level deeper and come after this call
        for (let j = i + 1; j < callHierarchy.length; j++) {
          const candidate = callHierarchy[j];

          // Stop when we encounter a call at same or lower depth (no longer in this subtree)
          if (candidate.depth <= current.depth) {
            break;
          }

          // If this is exactly 1 level deeper, it's a direct child
          if (candidate.depth === current.depth + 1 && candidate.parent === null) {
            candidate.parent = i;
            current.children.push(j);
          }
        }
      }

      // Helper: Get emoji for function
      const getFunctionEmoji = (fn: string): string => {
        const lower = fn.toLowerCase();
        if (lower.includes('transfer')) return '💸';
        if (lower.includes('mint')) return '🪙';
        if (lower.includes('burn')) return '🔥';
        if (lower.includes('harvest')) return '🌾';
        if (lower.includes('swap') || lower.includes('exchange')) return '🔄';
        if (lower.includes('deposit') || lower.includes('add') || lower.includes('supply')) return '📥';
        if (lower.includes('withdraw') || lower.includes('remove') || lower.includes('redeem')) return '📤';
        if (lower.includes('approve') || lower.includes('allow')) return '✅';
        if (lower.includes('set') || lower.includes('update') || lower.includes('change')) return '📝';
        if (lower.includes('get') || lower.includes('query') || lower.includes('read') || lower.includes('price') || lower.includes('balance')) return '🔍';
        if (lower.includes('stake') || lower.includes('lock')) return '🔒';
        if (lower.includes('claim') || lower.includes('collect')) return '🎁';
        if (lower.includes('plant') || lower.includes('seed')) return '🌱';
        return '⚙️';
      };

      // Create return value lookup map using stack-based matching
      // fn_return events come in LIFO order (stack), not sequential order
      const returnValues = new Map<number, any>();

      // Process all events to match fn_return to fn_call using a call stack
      let callIdx = 0;
      const callStackForReturns: number[] = [];

      filteredEvents.forEach((event: any) => {
        if (!event || !event.topics || !Array.isArray(event.topics)) return;
        const eventType = decodeTopic(event.topics[0]);

        if (eventType === 'fn_call') {
          // Push current call index onto stack
          callStackForReturns.push(callIdx);
          callIdx++;
        } else if (eventType === 'fn_return') {
          // Pop the most recent call from stack - this is the call that's returning
          const returningCallIdx = callStackForReturns.pop();

          if (returningCallIdx !== undefined) {
            // Decode the return value
            let decodedValue = event.data;
            try {
              if (typeof event.data === 'string') {
                const scVal = StellarSdk.xdr.ScVal.fromXDR(event.data, 'base64');
                decodedValue = decodeScVal(scVal);
              }
            } catch (error) {
            }

            returnValues.set(returningCallIdx, decodedValue);
          }
        }
      });

      // Helper: Infer parameter name from type and position (simplified fallback)
      // This is used ONLY when contract metadata is not available
      // The primary source of parameter names is the contract spec via getActualParameterName
      const inferParameterName = (fnName: string, argIdx: number, type: string): string => {
        const isAddressType = type === 'account' || type === 'contract';
        const isNumericType = type === 'number' || type === 'i128' || type === 'u64' || type === 'u32';
        const isDataType = type === 'base64' || type === 'bytes' || type === 'data';
        const isTextType = type === 'text' || type === 'string';

        // Position 0: First argument - common patterns
        if (argIdx === 0) {
          if (isAddressType) return 'account';
          if (isNumericType) return 'id';
          if (isTextType) return 'name';
          if (isDataType) return 'data';
        }

        // Position 1: Second argument - common patterns
        if (argIdx === 1) {
          if (isAddressType) return 'target';
          if (isNumericType) return 'amount';
          if (isTextType) return 'value';
          if (isDataType) return 'payload';
        }

        // Position 2: Third argument
        if (argIdx === 2) {
          if (isNumericType) return 'amount';
          if (isAddressType) return 'recipient';
          if (isTextType) return 'metadata';
        }

        // Position 3+: Generic fallbacks by type
        if (isAddressType) return type === 'contract' ? `contract_${argIdx + 1}` : `address_${argIdx + 1}`;
        if (isNumericType) return `value_${argIdx + 1}`;
        if (isTextType) return `text_${argIdx + 1}`;
        if (isDataType) return `data_${argIdx + 1}`;

        return `param_${argIdx + 1}`;
      };

      // Helper: Get actual parameter name from contract metadata cache
      const getActualParameterName = (contractId: string, functionName: string, argIdx: number, fallbackType: string, metadataCache: Map<string, any>): string => {
        const metadata = metadataCache.get(contractId);

        if (metadata && metadata.functions) {
          // Try exact match first
          let funcSpec = metadata.functions.find((f: any) => f.name === functionName);

          // If no match, try case-insensitive match
          if (!funcSpec) {
            funcSpec = metadata.functions.find((f: any) => f.name.toLowerCase() === functionName.toLowerCase());
          }

          if (funcSpec && funcSpec.inputs && funcSpec.inputs[argIdx]) {
            const paramName = funcSpec.inputs[argIdx].name;
            return paramName;
          } else {
          }
        } else {
        }

        // Fallback to inference if contract metadata not available
        const inferred = inferParameterName(functionName, argIdx, fallbackType);
        return inferred;
      };

      // Helper: Get event parameter name from contract metadata
      // Uses event specs to get proper names for topics and data fields
      // Falls back to function specs if event has same name as a function
      const getEventParameterName = (
        contractId: string,
        eventName: string,
        paramIdx: number,
        paramType: 'topic' | 'data',
        fallbackType: string,
        metadataCache: Map<string, any>
      ): string => {
        const metadata = metadataCache.get(contractId);

        if (metadata) {
          // First try: Look for event specs
          if (metadata.events) {
            let eventSpec = metadata.events.find((e: any) => e.name === eventName);
            if (!eventSpec) {
              eventSpec = metadata.events.find((e: any) =>
                e.name.toLowerCase() === eventName.toLowerCase()
              );
            }

            if (eventSpec) {
              const params = paramType === 'topic' ? eventSpec.topics : eventSpec.data;
              if (params && params[paramIdx]) {
                return params[paramIdx].name;
              }
            }
          }

          // Second try: Use function specs as fallback
          // Many events share the same name as functions (e.g., "update", "transfer")
          if (metadata.functions) {
            let funcSpec = metadata.functions.find((f: any) => f.name === eventName);
            if (!funcSpec) {
              funcSpec = metadata.functions.find((f: any) =>
                f.name.toLowerCase() === eventName.toLowerCase()
              );
            }

            if (funcSpec && funcSpec.inputs && funcSpec.inputs[paramIdx]) {
              return funcSpec.inputs[paramIdx].name;
            }
          }
        }

        // Fallback to type-based generic label
        const isAddressType = fallbackType === 'account' || fallbackType === 'contract';
        const isNumericType = fallbackType === 'number' || fallbackType === 'i128';

        if (paramType === 'topic') {
          if (isAddressType) return `address_${paramIdx + 1}`;
          if (isNumericType) return `value_${paramIdx + 1}`;
          return `topic_${paramIdx + 1}`;
        } else {
          if (isNumericType) return `data_value_${paramIdx + 1}`;
          if (isAddressType) return `data_address_${paramIdx + 1}`;
          return `data_${paramIdx + 1}`;
        }
      };

      // Helper: Create structured node content with proper labels
      const createNodeContent = (callNode: CallNode, returnIdx: number, includeFunction: boolean = false, metadataCache: Map<string, any>): string[] => {
        const content: string[] = [];

        if (includeFunction) {
          content.push(`Function: ${callNode.function}`);
        }
        const contractType = detectContractType(callNode.contract);
        content.push(`${contractType}: ${formatAddressWithSymbol(callNode.contract)}`);

        // Collect all parameters to detect duplicates
        const params: Array<{ label: string; value: string }> = [];

        // Process parameters with actual names from contract spec
        for (let argIdx = 0; argIdx < callNode.args.length; argIdx++) {
          const arg = callNode.args[argIdx];
          // Skip only truly missing args (not zero values)
          if (arg === null || arg === undefined) continue;
          const formatted = formatValue(arg);

          // Handle plain JavaScript primitives directly (no decoding needed)
          let decoded: string;
          let type: string;
          let decodedValue: any = arg;
          let usedXdrDecode = false;

          if (typeof arg === 'number' || typeof arg === 'bigint') {
            // Plain number - use directly
            decoded = String(arg);
            type = 'number';
          } else if (typeof arg === 'boolean') {
            // Plain boolean - use directly
            decoded = arg ? 'true' : 'false';
            type = 'boolean';
          } else {
            // Try to decode as proper ScVal for complex structures
            try {
              if (typeof arg === 'string' && /^[A-Za-z0-9+/]+=*$/.test(arg) && arg.length >= 4) {
                const scVal = StellarSdk.xdr.ScVal.fromXDR(arg, 'base64');
                decodedValue = decodeScVal(scVal);
                usedXdrDecode = true;
              }
            } catch (e) {
              // If XDR decode fails, fall back to simple decode
            }

            // Decode to understand what we have
            // Use XDR decoded value if available, otherwise use simple decode
            if (usedXdrDecode && decodedValue !== arg) {

              // Successfully decoded via XDR - use that value
              if (typeof decodedValue === 'number' || typeof decodedValue === 'bigint') {
                decoded = String(decodedValue);
                type = 'number';
              } else if (typeof decodedValue === 'boolean') {
                decoded = decodedValue ? 'true' : 'false';
                type = 'boolean';
              } else if (typeof decodedValue === 'string') {
                decoded = decodedValue;
                // Try to determine if it's an address
                if (decodedValue.startsWith('G') && decodedValue.length === 56) {
                  type = 'account';
                } else if (decodedValue.startsWith('C') && decodedValue.length === 56) {
                  type = 'contract';
                } else {
                  type = 'text';
                }
              } else if (Array.isArray(decodedValue) || (typeof decodedValue === 'object' && decodedValue !== null)) {
                const processedValue = preprocessForDisplay(decodedValue);
                decoded = JSON.stringify(processedValue, (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value
                );
                type = 'object';
              } else {
                decoded = String(decodedValue || '');
                type = 'raw';
              }
            } else {
              // Fall back to simple base64 decode
              const result = decodeBase64Value(arg);
              decoded = result.decoded;
              type = result.type;
            }
          }

          // Get actual parameter name from contract metadata (or infer as fallback)
          const label = getActualParameterName(callNode.contract, callNode.function, argIdx, type, metadataCache);

          // Check if parameter semantics suggest special handling
          const isTextParam = label.toLowerCase().includes('domain') ||
            label.toLowerCase().includes('name') ||
            label.toLowerCase().includes('subdomain') ||
            label.toLowerCase().includes('description') ||
            label.toLowerCase().includes('metadata') ||
            label.toLowerCase().includes('asset');

          const isBinaryParam = label.toLowerCase().includes('proof') ||
            label.toLowerCase().includes('data') ||
            label.toLowerCase().includes('hash') ||
            label.toLowerCase().includes('signature') ||
            label.toLowerCase().includes('payload') ||
            label.toLowerCase().includes('node');

          const isDurationParam = label.toLowerCase().includes('duration') ||
            label.toLowerCase().includes('ttl') ||
            label.toLowerCase().includes('expiry');

          const isAmountParam = label.toLowerCase().includes('amount') ||
            label.toLowerCase().includes('amt') ||
            label.toLowerCase().includes('value') ||
            label.toLowerCase().includes('min') ||
            label.toLowerCase().includes('max');

          // Capitalize label properly (may be overridden for contracts)
          let capitalizedLabel = label
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          // Format value based on parameter type
          let value = '';

          // Check if we have a complex decoded structure (array/object from ScVal)
          if (Array.isArray(decodedValue) && label.toLowerCase().includes('swap')) {
            // Handle swap chain - format as vertical path with pools
            try {
              const pathLines: string[] = [`SWAP PATH (${decodedValue.length} hops)`];

              decodedValue.forEach((hop: any, idx: number) => {
                if (Array.isArray(hop) && hop.length >= 3) {
                  // hop is [vec<address>, bytes, address]
                  const path = hop[0]; // vec<address>
                  const poolBytes = hop[1]; // bytes (pool ID as base64)
                  const tokenOut = hop[2]; // address

                  if (Array.isArray(path) && path.length >= 2) {
                    const tokenIn = path[0];
                    const tokenInAddr = String(tokenIn);
                    const tokenOutAddr = String(tokenOut);

                    // On first hop, show the input token
                    if (idx === 0) {
                      const tokenInShort = formatAddress(tokenInAddr);
                      const tokenInMeta = metadataMap.get(tokenInAddr);
                      const tokenInSymbol = tokenInMeta?.tokenSymbol ? ` (${tokenInMeta.tokenSymbol})` : '';
                      pathLines.push(`${tokenInShort}${tokenInSymbol}`);
                    }

                    // Show pool ID (truncate base64)
                    const poolStr = String(poolBytes);
                    const poolShort = poolStr.length > 12 ? poolStr.substring(0, 8) + '...' : poolStr;
                    pathLines.push(`    ↓ via Pool: ${poolShort}`);

                    // Show output token
                    const tokenOutShort = formatAddress(tokenOutAddr);
                    const tokenOutMeta = metadataMap.get(tokenOutAddr);
                    const tokenOutSymbol = tokenOutMeta?.tokenSymbol ? ` (${tokenOutMeta.tokenSymbol})` : '';
                    pathLines.push(`${tokenOutShort}${tokenOutSymbol}`);
                  }
                }
              });

              if (pathLines.length > 1) {
                const displayValue = pathLines.join('\n');
                const processedValue = preprocessForDisplay(decodedValue);
                const fullValue = JSON.stringify(processedValue, (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value
                );
                value = `${displayValue}||${fullValue}`;
              } else {
                const processedValue = preprocessForDisplay(decodedValue);
                value = JSON.stringify(processedValue, (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value
                );
              }
            } catch (e) {
              const processedValue = preprocessForDisplay(decodedValue);
              value = JSON.stringify(processedValue, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
              );
            }
          } else if (Array.isArray(decodedValue) || (typeof decodedValue === 'object' && decodedValue !== null && typeof decodedValue !== 'string')) {
            // Other complex structures - preprocess to handle Buffer-like objects, then show as JSON
            const processedValue = preprocessForDisplay(decodedValue);
            const jsonStr = JSON.stringify(processedValue, (key, value) =>
              typeof value === 'bigint' ? value.toString() : value
            );
            if (jsonStr.length > 60) {
              const preview = jsonStr.substring(0, 57) + '...';
              value = `${preview}||${jsonStr}`;
            } else {
              value = jsonStr;
            }
          } else if (type === 'text') {
            value = decoded.length > 30 ? decoded.substring(0, 30) + '…' : decoded;
          } else if (isBinaryParam) {
            // Try to decode binary data meaningfully
            try {
              if (typeof arg === 'string' && /^[A-Za-z0-9+/]+=*$/.test(arg)) {
                // It's base64 - decode to bytes
                const binaryString = atob(arg);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }

                // For bytesn types (especially 32-byte hashes), show as hex
                if (type.startsWith('bytes') && bytes.length <= 64) {
                  // Convert to hex string
                  const hexString = Array.from(bytes)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');

                  // Show abbreviated hex (first 8 + last 4 chars)
                  if (hexString.length > 16) {
                    const displayHex = hexString.substring(0, 8) + '…' + hexString.substring(hexString.length - 4);
                    value = `${displayHex}||${hexString}`;
                  } else {
                    value = hexString;
                  }
                } else {
                  // Show as raw base64 for other binary types
                  const b64 = btoa(String.fromCharCode(...Array.from(bytes)));
                  value = b64;
                }
              } else {
                // Not base64, show as-is
                const displayValue = typeof arg === 'string' && arg.length > 24
                  ? arg.substring(0, 12) + '…' + arg.substring(arg.length - 6)
                  : String(arg);
                value = displayValue;
              }
            } catch (e) {
              // Fallback: show truncated base64
              const displayValue = typeof arg === 'string' && arg.length > 24
                ? arg.substring(0, 12) + '…' + arg.substring(arg.length - 6)
                : String(arg);
              value = displayValue;
            }
          } else if (isTextParam) {
            // Show as text
            value = decoded.length > 30 ? decoded.substring(0, 30) + '…' : decoded;
          } else if (isDurationParam) {
            // Format duration in human-readable format
            const num = /^\d+$/.test(decoded) ? parseInt(decoded) : NaN;
            if (!isNaN(num) && num >= 60) {
              const years = Math.floor(num / 31536000);
              const days = Math.floor((num % 31536000) / 86400);
              const hours = Math.floor((num % 86400) / 3600);
              if (years > 0) {
                value = `${years} year${years > 1 ? 's' : ''}`;
              } else if (days > 0) {
                value = `${days} day${days > 1 ? 's' : ''}`;
              } else if (hours > 0) {
                value = `${hours} hour${hours > 1 ? 's' : ''}`;
              } else {
                value = `${num} seconds`;
              }
            } else {
              value = decoded;
            }
          } else if (isAmountParam) {
            // Format as token amount with proper decimals
            const num = /^\d+$/.test(decoded) ? BigInt(decoded) : null;
            if (num !== null) {
              // Try to determine which token this amount is for
              let tokenDecimals: number | null = null;
              let tokenAddress: string | null = null;

              // For swap_chained: in_amount uses token_in, out_min uses final token in chain
              const fnLower = callNode.function.toLowerCase();

              if (fnLower.includes('swap')) {
                // Look for token_in parameter (usually param 2)
                if (label.toLowerCase().includes('in')) {
                  // This is in_amount, find token_in
                  for (let i = 0; i < callNode.args.length; i++) {
                    const paramName = getActualParameterName(callNode.contract, callNode.function, i, 'unknown', metadataCache);
                    if (paramName.toLowerCase().includes('token_in') || paramName.toLowerCase() === 'token in') {
                      const { decoded: tokenAddr } = decodeBase64Value(callNode.args[i]);
                      tokenAddress = tokenAddr;
                      break;
                    }
                  }
                } else if (label.toLowerCase().includes('out') || label.toLowerCase().includes('min')) {
                  // This is out_min/out_amount, find token_out or last token in swaps_chain
                  for (let i = 0; i < callNode.args.length; i++) {
                    const paramName = getActualParameterName(callNode.contract, callNode.function, i, 'unknown', metadataCache);

                    if (paramName.toLowerCase().includes('token_out') || paramName.toLowerCase() === 'token out') {
                      const { decoded: tokenAddr } = decodeBase64Value(callNode.args[i]);
                      tokenAddress = tokenAddr;
                      break;
                    }
                    // For swap_chained, extract the last token from swaps_chain
                    if (paramName.toLowerCase().includes('swaps_chain') || paramName.toLowerCase().includes('swap_chain')) {
                      try {
                        const decodedValue = decodeScVal(callNode.args[i]);
                        if (Array.isArray(decodedValue) && decodedValue.length > 0) {
                          const lastHop = decodedValue[decodedValue.length - 1];
                          if (Array.isArray(lastHop) && lastHop.length >= 3) {
                            tokenAddress = lastHop[2]; // Last hop's output token
                            break;
                          }
                        }
                      } catch (e) {
                      }
                    }
                  }
                }
              }

              // Get decimals from metadata if we found the token
              if (tokenAddress && metadataMap.has(tokenAddress)) {
                const metadata = metadataMap.get(tokenAddress);
                if (metadata?.tokenDecimals !== undefined && metadata.tokenDecimals !== null) {
                  tokenDecimals = metadata.tokenDecimals;
                }
              }

              // Format with proper decimals
              if (tokenDecimals !== null) {
                const formatted = formatAmountWithDecimals(num, tokenDecimals);
                value = `${formatted}||${decoded}`;
              } else {
                // Always apply decimal formatting (default 7 decimals for Soroban tokens)
                const formatted = formatAmount(decoded).formatted;
                value = `${formatted}||${decoded}`;
              }
            } else {
              value = decoded;
            }
          } else if (type === 'contract' || type === 'account') {
            // Show as address with contract type if applicable
            const contractType = detectContractType(decoded);
            value = formatAddressWithSymbol(decoded);

            // If it's a typed contract, update the label to show the type
            if (contractType !== '📄 Contract') {
              capitalizedLabel = contractType;
            }
          } else if (type === 'number' || /^\d+$/.test(decoded)) {
            // Display raw numbers without formatting for Soroban types
            try {
              const num = BigInt(decoded);
              value = num.toString();
            } catch {
              const num = parseInt(decoded);
              value = isNaN(num) ? '0' : num.toString();
            }
          } else if (decoded === '' || decoded === null || decoded === undefined) {
            // Handle empty/missing values - show as empty but preserve in UI
            value = '—';
          } else {
            value = decoded.length > 40 ? decoded.substring(0, 40) + '…' : decoded;
          }

          // Skip RESERVES parameter completely - don't show it anywhere
          if (capitalizedLabel.toLowerCase().includes('reserve')) {
          } else {
            params.push({ label: capitalizedLabel, value });
          }
        }

        // Filter out duplicate TARGET/CALLER combinations and other redundancies
        const seenValues = new Map<string, string>();
        params.forEach(({ label, value }) => {
          const normalizedLabel = label.toLowerCase();

          // Skip TARGET if it's the same as CALLER
          if (normalizedLabel === 'target' && seenValues.get('caller') === value) {
            return;
          }

          // Skip CALLER if it's the same as FROM (in some functions)
          if (normalizedLabel === 'caller' && seenValues.get('from') === value) {
            return;
          }

          content.push(`${label}: ${value}`);
          seenValues.set(normalizedLabel, value);
        });

        // Look up return value by hierarchy index
        const returnValue = returnValues.get(returnIdx);

        // In developer mode (simplifiedMode=false), show ALL return values including utility functions
        // In simplified mode (simplifiedMode=true), hide all return values
        if (returnValue !== undefined && returnValue !== null && !simplifiedMode) {
          if (true) {
            // Only show returns for important operations (transfer, swap, etc.)...
            if (Array.isArray(returnValue)) {
              content.push('');
              content.push('RETURNS (Array)');
              returnValue.forEach((val, idx) => {
                const formattedVal = typeof val === 'bigint' || typeof val === 'number'
                  ? val.toString()
                  : String(val);
                content.push(`  [${idx}]: ${formattedVal}`);
              });
              content.push('');
            } else if (typeof returnValue === 'object' && returnValue !== null) {
              // Handle structured return values
              const entries = Object.entries(returnValue);
              if (entries.length > 0) {
                content.push('');
                content.push('RETURN VALUE');
                entries.forEach(([key, val]) => {
                  let formattedVal: string;

                  if (typeof val === 'bigint' || typeof val === 'number') {
                    formattedVal = val.toString();
                  } else if (typeof val === 'object' && val !== null) {
                    // Format nested objects properly
                    if (Object.keys(val).length === 0) {
                      formattedVal = '{}';
                    } else {
                      const nested = Object.entries(val)
                        .map(([k, v]) => `${k}: ${typeof v === 'bigint' ? v.toString() : String(v)}`)
                        .join(', ');
                      formattedVal = `{${nested}}`;
                    }
                  } else {
                    formattedVal = String(val);
                  }
                  content.push(`  ${key}: ${formattedVal}`);
                });
                content.push('');
              }
            } else if (typeof returnValue === 'bigint' || typeof returnValue === 'number') {
              const displayValue = returnValue.toString();
              content.push('');
              content.push(`→ Returns: ${displayValue}`);
            } else if (typeof returnValue === 'string' && returnValue !== 'void') {
              const displayText = returnValue.length > 40 ? returnValue.substring(0, 40) + '…' : returnValue;
              if (returnValue.length === 56 && (returnValue.startsWith('G') || returnValue.startsWith('C'))) {
                content.push(`→ Returns: ${formatAddress(returnValue)}`);
              } else {
                content.push(`→ Returns: ${displayText}`);
              }
            } else if (typeof returnValue === 'boolean') {
              content.push(`→ Returns: ${returnValue}`);
            }
          }
        }

        return content;
      };

      // Step 4: Map events to their corresponding function calls
      // Events occur in sequence: fn_call -> [contract events] -> fn_return
      const eventMap = new Map<number, any[]>();
      let currentCallIndex = -1;
      let callStack: number[] = [];

      filteredEvents.forEach((event: any) => {
        if (!event || !event.topics || !Array.isArray(event.topics)) return;

        const eventType = decodeTopic(event.topics[0]);

        if (eventType === 'fn_call') {
          currentCallIndex++;
          callStack.push(currentCallIndex);
          eventMap.set(currentCallIndex, []);
        } else if (eventType === 'fn_return') {
          callStack.pop();
        } else if (eventType !== 'core_metrics' && callStack.length > 0) {
          const activeCall = callStack[callStack.length - 1];
          if (!eventMap.has(activeCall)) {
            eventMap.set(activeCall, []);
          }
          eventMap.get(activeCall)!.push(event);
        }
      });

      // Step 5: Render hierarchy tree
      const processedNodes = new Set<number>();

      // Shared collection for final result lines to be merged into Net Balance Changes
      const finalResultLines: string[] = [];





      // Helper to render events for a specific call
      const renderEventsForCall = (callIndex: number, sourceNodeId: string): string | null => {
        const events = eventMap.get(callIndex) || [];
        if (events.length === 0) return sourceNodeId;

        let lastEventId = sourceNodeId;

        // Get the function name of the call to avoid duplicate rendering
        const callFunction = callHierarchy[callIndex]?.function.toLowerCase() || '';

        events.forEach((event: any, eventIdx: number) => {
          const topics = event.topics || [];

          // Decode the first topic to get event type/name
          const eventType = topics[0] ? decodeTopic(topics[0]) : 'event';
          const eventId = `event-${callIndex}-${eventIdx}`;

          // Also decode the raw first topic to check if it's an object
          let firstTopicDecoded: any = null;
          if (topics[0]) {
            try {
              firstTopicDecoded = decodeScVal(topics[0]);
            } catch (e) {
              firstTopicDecoded = topics[0];
            }
          }

          const displayEventType = eventType || 'Event';

          // Skip transfer/mint/burn events if the function call itself IS transfer/mint/burn
          // This prevents duplicate nodes like "transfer() #1 (from parent)" + separate "transfer" event
          const lowerEventType = displayEventType.toLowerCase();
          if ((lowerEventType === 'transfer' && callFunction.includes('transfer')) ||
            (lowerEventType === 'mint' && callFunction.includes('mint')) ||
            (lowerEventType === 'burn' && callFunction.includes('burn'))) {
            return; // Skip this event
          }

          // Skip utility/internal events in simplified mode
          if (simplifiedMode) {
            const utilityEvents = ['sync', 'approval', 'increase_allowance', 'decrease_allowance'];
            if (utilityEvents.some(util => lowerEventType.includes(util))) {
              return; // Skip this event
            }
          }

          const eventEmoji = getFunctionEmoji(displayEventType);
          const eventContent: string[] = [];

          if (event.contractId) {
            const contractType = detectContractType(event.contractId);
            eventContent.push(`${contractType}: ${formatAddressWithSymbol(event.contractId)}`);
          }

          // If first topic decoded to an object, include it in content
          if (firstTopicDecoded && typeof firstTopicDecoded === 'object') {
            try {
              // Format object fields nicely
              Object.entries(firstTopicDecoded).forEach(([key, value]) => {
                let displayValue = value;
                const keyLower = key.toLowerCase();

                if (typeof value === 'string' && value.length > 56 && (value.startsWith('G') || value.startsWith('C'))) {
                  displayValue = formatAddress(value);
                } else if (typeof value === 'number' || typeof value === 'bigint') {
                  // Check if this field should be treated as an integer (IDs, counts, etc)
                  const isIntegerField = keyLower.includes('id') ||
                    keyLower.includes('count') ||
                    keyLower.includes('index') ||
                    keyLower.includes('nonce') ||
                    keyLower.includes('sequence');

                  if (isIntegerField) {
                    // Display as plain integer
                    displayValue = String(value);
                  } else {
                    // Apply decimal formatting for amounts
                    displayValue = formatAmount(String(value)).formatted;
                  }
                }
                eventContent.push(`${key}: ${displayValue}`);
              });
            } catch (e) {
              // Fallback if processing fails
              eventContent.push('Event Data: [complex object]');
            }
          }

          // Decode event topics and data
          const decodedValues: Array<{ value: string, type: string }> = [];

          topics.slice(1).forEach((topic: any, idx: number) => {
            // Topics can be already-decoded strings or base64-encoded values
            let decoded: string;
            let type: string;

            if (typeof topic === 'string') {
              // Already decoded - detect type
              decoded = topic;
              if (decoded.startsWith('G') && decoded.length === 56) {
                type = 'account';
              } else if (decoded.startsWith('C') && decoded.length === 56) {
                type = 'contract';
              } else if (decoded.includes(':') || decoded === 'native') {
                // Asset identifier like "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
                type = 'asset';
              } else {
                type = 'raw';
              }
            } else {
              const result = decodeBase64Value(topic);
              decoded = result.decoded;
              type = result.type;
              // Check if decoded value is an asset identifier
              if (decoded.includes(':') || decoded === 'native') {
                type = 'asset';
              }
            }

            let value = decoded;

            if (type === 'contract' || type === 'account') {
              value = formatAddress(decoded);
            } else if (type === 'number') {
              value = formatAmount(decoded).formatted;
            } else if (type === 'asset') {
              // Extract token symbol from asset identifier
              // Format: "SYMBOL:ISSUER" or "native"
              if (decoded === 'native') {
                value = 'XLM';
              } else if (decoded.includes(':')) {
                value = decoded.split(':')[0];
              } else {
                value = decoded;
              }
            }

            decodedValues.push({ value, type, raw: decoded });

            // Get label from contract metadata or use fallback
            const label = getEventParameterName(
              event.contractId || '',
              displayEventType,
              idx,
              'topic',
              type,
              metadataMap
            );

            // Format label nicely
            const formattedLabel = label
              .split('_')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            if (type === 'asset') {
              eventContent.push(`Asset: ${value}`);
            } else if (type === 'account' || type === 'contract') {
              eventContent.push(`${formattedLabel}: ${value}||${decoded}`);
            } else if (type === 'number') {
              eventContent.push(`${formattedLabel}: ${value}||${decoded}`);
            } else {
              eventContent.push(`${formattedLabel}: ${value}`);
            }
          });

          // Handle event.data - it might be a single value or an array
          if (event.data !== undefined && event.data !== null) {
            const dataItems = Array.isArray(event.data) ? event.data : [event.data];

            dataItems.forEach((dataItem: any, idx: number) => {
              // Data can be objects, strings, numbers, or base64-encoded values

              // Handle objects (like SoroswapPair event data)
              if (typeof dataItem === 'object' && dataItem !== null && !Array.isArray(dataItem)) {
                // Format object fields
                Object.entries(dataItem).forEach(([key, val]) => {
                  const formattedVal = typeof val === 'number' ? val.toString() : String(val);
                  eventContent.push(`${key}: ${formattedVal}`);
                });
                return; // Skip rest of processing for objects
              }

              let decoded: string;
              let type: string;

              if (typeof dataItem === 'string' || typeof dataItem === 'number') {
                // Already decoded
                decoded = String(dataItem);
                // Detect if it's a number
                if (!isNaN(Number(decoded))) {
                  type = 'number';
                } else if (decoded.startsWith('G') && decoded.length === 56) {
                  type = 'account';
                } else if (decoded.startsWith('C') && decoded.length === 56) {
                  type = 'contract';
                } else {
                  type = 'raw';
                }
              } else {
                const result = decodeBase64Value(dataItem);
                decoded = result.decoded;
                type = result.type;
              }

              let value = decoded;

              if (type === 'contract' || type === 'account') {
                value = formatAddress(decoded);
              } else if (type === 'number') {
                value = formatAmount(decoded).formatted;
              }

              decodedValues.push({ value, type, raw: decoded });

              // Get label from contract metadata or use fallback
              const label = getEventParameterName(
                event.contractId || '',
                displayEventType,
                idx,
                'data',
                type,
                metadataMap
              );

              // Format label nicely
              const formattedLabel = label
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

              if (type === 'account' || type === 'contract') {
                eventContent.push(`${formattedLabel}: ${value}||${decoded}`);
              } else if (type === 'number') {
                eventContent.push(`${formattedLabel}: ${value}||${decoded}`);
              } else {
                eventContent.push(`${formattedLabel}: ${value}`);
              }
            });
          }

          generatedNodes.push({
            id: eventId,
            type: 'operation',
            position: { x: xCenter, y: yOffset },
            data: {
              stepNumber: '',
              emoji: eventEmoji,
              title: displayEventType,
              content: eventContent,
              isCompactGroup: false,
            },
          });

          generatedEdges.push({
            id: `${lastEventId}-${eventId}`,
            source: lastEventId,
            target: eventId,
            type: 'straight',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
            style: { stroke: '#8b5cf6', strokeWidth: 3 },
          });

          lastEventId = eventId;
          const eventHeight = calculateNodeHeight(eventContent);
          yOffset += eventHeight;

          // Skip creating "Asset Transferred" nodes - events already show this information
          // This prevents duplicate nodes in the visualization

          if (false && (lowerEventType === 'mint' || lowerEventType === 'burn' || lowerEventType === 'transfer')) {

            // Extract values based on event type - DON'T blindly assume positions!
            // Transfer: topics[0]=event, topics[1]=from, topics[2]=to, data[0]=amount
            // Mint: topics[0]=event, topics[1]=to, data[0]=amount
            // Burn: topics[0]=event, topics[1]=from, data[0]=amount

            let fromAddr = '';
            let toAddr = '';
            let amount = '';
            let contractAddr = event.contractId || '';

            // Separate accounts and numbers from decodedValues
            const accounts = decodedValues.filter((item: any) => item.type === 'account' || item.type === 'contract');
            const numbers = decodedValues.filter((item: any) => item.type === 'number');


            // Extract amount (always from numbers)
            if (numbers.length > 0) {
              amount = numbers[0].value;
            }

            // Extract addresses based on event type
            if (lowerEventType === 'transfer') {
              // Transfer: first account = from, second account = to
              if (accounts.length >= 2) {
                fromAddr = accounts[0].value;
                toAddr = accounts[1].value;
              }
            } else if (lowerEventType === 'mint') {
              // Mint: first account = to (recipient)
              if (accounts.length >= 1) {
                toAddr = accounts[0].value;
              }
            } else if (lowerEventType === 'burn') {
              // Burn: first account = from (source)
              if (accounts.length >= 1) {
                fromAddr = accounts[0].value;
              }
            }


            // Get asset symbol from metadata
            let assetSymbol = 'XLM';
            let tokenDecimals: number | undefined;

            if (contractAddr) {
              const metadata = metadataMap.get(contractAddr);
              if (metadata) {
                if (metadata.tokenSymbol) {
                  assetSymbol = metadata.tokenSymbol;
                }
                tokenDecimals = metadata.tokenDecimals;
              }

              // Fallback: use contract address if no symbol found
              if (assetSymbol === 'XLM') {
                assetSymbol = formatAddress(contractAddr);
              }
            }

            // Format amount with proper decimals
            if (amount && tokenDecimals !== undefined) {
              const rawAmount = numbers[0]?.raw || amount.replace(/,/g, '');
              amount = simpleContractMetadataService.formatAmount(rawAmount, tokenDecimals);
            }

            if (amount) {
              const balanceId = `balance-${eventId}`;
              let balanceTitle = '';
              let balanceEmoji = '💰';
              const balanceContent: string[] = [];

              if (lowerEventType === 'mint') {
                balanceTitle = 'Asset Minted';
                balanceEmoji = '🪙';
                balanceContent.push(`${amount} ${assetSymbol} minted`);
                if (toAddr) {
                  balanceContent.push(`Credited to ${toAddr}`);
                }
              } else if (lowerEventType === 'burn') {
                balanceTitle = 'Asset Burned';
                balanceEmoji = '🔥';
                balanceContent.push(`${amount} ${assetSymbol} burned`);
                if (fromAddr) {
                  balanceContent.push(`Debited from ${fromAddr}`);
                }
              } else if (lowerEventType === 'transfer') {
                balanceTitle = 'Asset Transferred';
                balanceEmoji = '💸';
                balanceContent.push(`${amount} ${assetSymbol} transferred`);
                if (fromAddr) {
                  balanceContent.push(`From ${fromAddr}`);
                }
                if (toAddr) {
                  balanceContent.push(`To ${toAddr}`);
                }
              }

              if (balanceContent.length > 0) {
                generatedNodes.push({
                  id: balanceId,
                  type: 'operation',
                  position: { x: xCenter, y: yOffset },
                  data: {
                    stepNumber: '',
                    emoji: balanceEmoji,
                    title: balanceTitle,
                    content: balanceContent,
                    isCompactGroup: false,
                  },
                });

                generatedEdges.push({
                  id: `${lastEventId}-${balanceId}`,
                  source: lastEventId,
                  target: balanceId,
                  type: 'straight',
                  animated: true,
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                  style: { stroke: '#10b981', strokeWidth: 3 },
                });

                lastEventId = balanceId;
                const balanceHeight = calculateNodeHeight(balanceContent);
                yOffset += balanceHeight;

                // Add FINAL RESULT context to shared collection instead of creating a node
                if (lowerEventType === 'burn' && sourceAccount && fromAddr && amount) {
                  // Capture the context lines
                  finalResultLines.push(`${amount} ${assetSymbol} burned`);
                  finalResultLines.push(`Initiated by: ${formatAddress(sourceAccount)}`);

                  // Get the full raw address of the account whose tokens were debited
                  const fullFromAddr = accounts.find((a: any) => a.value === fromAddr)?.raw || '';

                  // Only show "debited from" if it's different from the initiator
                  if (fullFromAddr && fullFromAddr !== sourceAccount) {
                    finalResultLines.push(`Tokens debited from: ${fromAddr}`);
                  }

                  // Don't create a separate node
                }
              }
            }
          }
        });

        return lastEventId;
      };

      // Helper function to determine if a child should be rendered based on current mode
      const shouldRenderChild = (childIdx: number): boolean => {
        const childNode = callHierarchy[childIdx];
        const fnName = childNode.function.toLowerCase();

        // Skip update() functions in all modes
        if (fnName === 'update') return false;

        if (simplifiedMode) {
          const utilityFunctions = [
            'balance', 'get_balance', 'get_reserves', 'decimals', 'get_decimals',
            'name', 'symbol', 'total_supply', 'lastprice', 'last_price', 'get_price'
          ];
          const isUtility = utilityFunctions.some(util => fnName === util || fnName.includes(util));
          return !isUtility;
        }

        return true;
      };

      // Recursive helper to calculate the total width needed for a node's subtree
      const calculateSubtreeWidth = (nodeIdx: number): number => {
        const node = callHierarchy[nodeIdx];
        const children = node.children.filter(shouldRenderChild);

        if (children.length === 0) {
          // Leaf node width (card width approx 340px + margin)
          return 150;
        }

        // Calculate total width needed for all children
        const minSpacing = 140;
        let childrenWidth = 0;

        children.forEach((childIdx, idx) => {
          childrenWidth += calculateSubtreeWidth(childIdx);
          if (idx < children.length - 1) {
            childrenWidth += minSpacing;
          }
        });

        // The node itself needs distinct width, but mostly defined by children if they are wider
        return Math.max(150, childrenWidth);
      };

      // Count function occurrences for numbering
      const functionCounts = new Map<string, number>();
      const functionIndices = new Map<number, number>();
      callHierarchy.forEach((call, idx) => {
        const fn = call.function;
        const count = functionCounts.get(fn) || 0;
        functionCounts.set(fn, count + 1);
        functionIndices.set(idx, count + 1);
      });

      // Helper to get function display name with numbering if needed
      const getFunctionDisplayName = (callNodeIdx: number): string => {
        const callNode = callHierarchy[callNodeIdx];
        const fn = callNode.function;
        const totalCount = functionCounts.get(fn) || 1;
        if (totalCount > 1) {
          const index = functionIndices.get(callNodeIdx) || 1;
          return `${fn}() #${index}`;
        }
        return `${fn}()`;
      };

      const renderNode = (callNodeIdx: number, parentVisualId: string | null, isRootLevel: boolean = false): string | null => {
        if (processedNodes.has(callNodeIdx)) return null;
        processedNodes.add(callNodeIdx);

        const callNode = callHierarchy[callNodeIdx];

        // In simplified mode, skip utility functions
        if (simplifiedMode) {
          const fnName = callNode.function.toLowerCase();
          const utilityFunctions = [
            'balance', 'get_balance', 'get_reserves', 'decimals', 'get_decimals',
            'name', 'symbol', 'total_supply', 'lastprice', 'last_price', 'get_price'
          ];
          const isUtilityFunction = utilityFunctions.some(util => fnName === util || fnName.includes(util));

          if (isUtilityFunction) {
            // Still render children if they exist
            let lastChildId = parentVisualId;
            callNode.children.forEach((childIdx) => {
              const childResult = renderNode(childIdx, lastChildId, false);
              if (childResult) lastChildId = childResult;
            });
            return lastChildId;
          }
        }

        const emoji = getFunctionEmoji(callNode.function);
        const nodeId = `call-${callNodeIdx}`;

        if (callNode.children.length > 0) {
          let parentHeaderId: string;
          let parentContent: string[];

          // Only add summary header for ROOT level nodes
          if (isRootLevel) {
            const summaryHeaderId = `summary-${callNodeIdx}`;
            const operationCount = callNode.children.length;
            const targetAccount = callNode.args.length > 0 ? (() => {
              const { decoded, type } = decodeBase64Value(callNode.args[0]);
              return type === 'account' ? formatAddress(decoded) : null;
            })() : null;

            generatedNodes.push({
              id: summaryHeaderId,
              type: 'operation',
              position: { x: xCenter, y: yOffset },
              data: {
                stepNumber: '',
                emoji: '',
                title: '',
                content: [],
                isSummaryHeader: true,
                phaseEmoji: emoji,
                phaseTitle: `${getFriendlyFunctionName(getFunctionDisplayName(callNodeIdx).replace('()', '')).toUpperCase()} PHASE`,
                phaseDescription: targetAccount
                  ? `Target account ${targetAccount} - ${operationCount} pair operation${operationCount > 1 ? 's' : ''}`
                  : `${operationCount} pair operation${operationCount > 1 ? 's' : ''}`,
              },
            });

            if (parentVisualId) {
              generatedEdges.push({
                id: `${parentVisualId}-${summaryHeaderId}`,
                source: parentVisualId,
                target: summaryHeaderId,
                type: 'straight',
                animated: true,
                markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
                style: { stroke: '#64748b', strokeWidth: 3 },
              });
            }

            yOffset += 120;

            // Parent node with children - create detailed parameter box
            parentHeaderId = `parent-${callNodeIdx}`;
            parentContent = createNodeContent(callNode, callNodeIdx, true, metadataMap);
            const parentParams = parentContent.slice(1);

            generatedNodes.push({
              id: parentHeaderId,
              type: 'operation',
              position: { x: xCenter, y: yOffset },
              data: {
                stepNumber: '',
                emoji: '',
                title: '',
                content: [],
                isPhaseHeader: true,
                phaseEmoji: emoji,
                phaseTitle: `Parent ${getFriendlyFunctionName(callNode.function)}() Call — ${callNode.children.length} child call${callNode.children.length > 1 ? 's' : ''}`,
                phaseDescription: `${detectContractType(callNode.contract)}: ${formatAddressWithSymbol(callNode.contract)}`,
                phaseParams: parentParams,
              },
            });

            generatedEdges.push({
              id: `${summaryHeaderId}-${parentHeaderId}`,
              source: summaryHeaderId,
              target: parentHeaderId,
              type: 'straight',
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
              style: { stroke: '#64748b', strokeWidth: 3 },
            });
          } else {
            // For nested nodes with children, show as compact card
            parentHeaderId = `nested-parent-${callNodeIdx}`;
            parentContent = createNodeContent(callNode, callNodeIdx, true, metadataMap);

            generatedNodes.push({
              id: parentHeaderId,
              type: 'operation',
              position: { x: xCenter, y: yOffset },
              data: {
                stepNumber: `#${callNodeIdx + 1}`,
                emoji: emoji,
                title: `${getFriendlyFunctionName(callNode.function)}() (from parent)`,
                content: parentContent,
                isCompactGroup: true,
              },
            });

            if (parentVisualId) {
              generatedEdges.push({
                id: `${parentVisualId}-${parentHeaderId}`,
                source: parentVisualId,
                target: parentHeaderId,
                type: 'straight',
                animated: true,
                markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                style: { stroke: '#10b981', strokeWidth: 3 },
              });
            }
          }

          // Calculate space needed dynamically based on actual content
          const baseHeight = isRootLevel ? 140 : 100; // Base card height with header space
          const contentLineHeight = 28; // Height per content line (increased for phase params)

          // Count actual visual lines including multiline strings (like swap chains)
          let totalVisualLines = 0;
          parentContent?.forEach(line => {
            // Split by || first to get display value
            const displayValue = line.includes('||') ? line.split('||')[0] : line;
            // Count newlines in the display value
            const lineCount = (displayValue.match(/\n/g) || []).length + 1;
            totalVisualLines += lineCount;
          });

          const calculatedHeight = baseHeight + (totalVisualLines * contentLineHeight);
          const minHeight = isRootLevel ? 300 : 220;
          const paramHeight = Math.max(calculatedHeight, minHeight);
          const extraSpacing = 80; // Additional spacing between parent and children
          yOffset += paramHeight + extraSpacing;

          // Filter children based on mode using shared helper
          const childrenToRender = callNode.children.filter(shouldRenderChild);

          // Calculate layout based on actual subtree widths
          const numChildren = childrenToRender.length;
          const minChildSpacing = 40; // Minimum gap between subtrees

          // Calculate total width required for all children subtrees
          const totalSubtreeWidth = childrenToRender.reduce((acc, childIdx, idx) => {
            return acc + calculateSubtreeWidth(childIdx) + (idx < numChildren - 1 ? minChildSpacing : 0);
          }, 0);

          // Start positioning children from left to right, centered around parent's xCenter
          let currentChildX = xCenter - (totalSubtreeWidth / 2);

          let maxChildY = yOffset; // Track the deepest Y position reached by any child branch
          const childrenStartY = yOffset;

          childrenToRender.forEach((childIdx, idx) => {
            const childNode = callHierarchy[childIdx];
            const childSubtreeWidth = calculateSubtreeWidth(childIdx);

            // Position child in the center of its allocated subtree space
            const childX = currentChildX + (childSubtreeWidth / 2);

            // Reset yOffset to the same starting Y for each sibling
            yOffset = childrenStartY;

            // Check if this child also has children (nested calls)
            if (childNode.children.length > 0) {
              // This child has its own children - render them vertically below this child
              const savedXCenter = xCenter;
              xCenter = childX;

              const childLastId = renderNode(childIdx, parentHeaderId, false);

              xCenter = savedXCenter;

              // Track the maximum Y reached by this branch
              if (yOffset > maxChildY) {
                maxChildY = yOffset;
              }
            } else {
              // Leaf node - render as compact group
              const childId = `child-${childIdx}`;
              const childEmoji = getFunctionEmoji(childNode.function);
              const childContent = createNodeContent(childNode, childIdx, false, metadataMap);

              generatedNodes.push({
                id: childId,
                type: 'operation',
                position: { x: childX, y: childrenStartY },
                data: {
                  stepNumber: `#${idx + 1}`,
                  emoji: childEmoji,
                  title: `${getFriendlyFunctionName(childNode.function)}() (from parent)`,
                  content: childContent,
                  isCompactGroup: true,
                },
              });

              generatedEdges.push({
                id: `${parentHeaderId}-${childId}`,
                source: parentHeaderId,
                target: childId,
                type: 'straight',
                animated: true,
                markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                style: { stroke: '#10b981', strokeWidth: 3 },
              });

              processedNodes.add(childIdx);

              // Save current xCenter and set to child's X position for event rendering
              const savedXCenter = xCenter;
              xCenter = childX;

              // Start rendering events below this child node with extra spacing
              yOffset = childrenStartY + calculateNodeHeight(childContent) + 60;

              // Render events emitted by this child call (includes balance changes and final result)
              const childLastId = renderEventsForCall(childIdx, childId);

              // Restore xCenter
              xCenter = savedXCenter;

              // Track the height including all events
              if (yOffset > maxChildY) {
                maxChildY = yOffset;
              }
            }

            // Advance X position for next sibling including spacing
            currentChildX += childSubtreeWidth + minChildSpacing;
          });

          // After rendering all children, set yOffset to the deepest point reached
          yOffset = maxChildY + 150; // Add extra spacing after all children

          // Don't render events for parent - children already rendered their events
          // Rendering parent events here causes duplicates
          // const finalNodeId = renderEventsForCall(callNodeIdx, parentHeaderId);
          return parentHeaderId;
        } else {
          // Regular node without children
          const content = createNodeContent(callNode, callNodeIdx, false, metadataMap);
          generatedNodes.push({
            id: nodeId,
            type: 'operation',
            position: { x: xCenter, y: yOffset },
            data: {
              stepNumber: `${callNodeIdx + 1}`,
              emoji,
              title: `${getFriendlyFunctionName(callNode.function)}()`,
              content,
            },
          });

          if (parentVisualId) {
            generatedEdges.push({
              id: `${parentVisualId}-${nodeId}`,
              source: parentVisualId,
              target: nodeId,
              type: 'straight',
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
              style: { stroke: '#3b82f6', strokeWidth: 3 },
            });
          }

          const operationHeight = calculateNodeHeight(content);
          yOffset += operationHeight;

          // Render events emitted by this function call (includes balance changes)
          const finalNodeId = renderEventsForCall(callNodeIdx, nodeId);
          return finalNodeId || nodeId;
        }
      };

      // Render all root nodes (depth 0)
      for (let i = 0; i < callHierarchy.length; i++) {
        const fnName = callHierarchy[i].function.toLowerCase();

        // Skip update() functions completely
        if (fnName === 'update') {
          continue;
        }

        if (callHierarchy[i].depth === 0 && !processedNodes.has(i)) {
          const renderedId = renderNode(i, lastNodeId, true);
          if (renderedId) lastNodeId = renderedId;
        } else {
        }
      }


      // Balance changes are now rendered inline with their respective function calls

      // Add final result summary node (optional) if there are transfer events
      const transferEvents = filteredEvents.filter(e =>
        e.topics && e.topics[0] && decodeTopic(e.topics[0]).toLowerCase() === 'transfer'
      );

      if (transferEvents.length > 0 && lastNodeId) {
        const finalResultId = 'final-result';
        const finalContent: string[] = [];

        // Extract transfer details from the last transfer event (final result)
        const lastTransfer = transferEvents[transferEvents.length - 1];

        // Build decodedValues from topics and data (same method as transfer event processing)
        const decodedValues: Array<{ value: string; type: string; raw: string }> = [];

        // Process topics (skip first topic which is event name)
        const topics = Array.isArray(lastTransfer.topics) ? lastTransfer.topics : [];
        topics.slice(1).forEach((topic: any) => {
          let decoded: string;
          let type: string;

          if (typeof topic === 'string') {
            decoded = topic;
            if (decoded.startsWith('G') && decoded.length === 56) {
              type = 'account';
            } else if (decoded.startsWith('C') && decoded.length === 56) {
              type = 'contract';
            } else if (decoded.includes(':') || decoded === 'native') {
              // Asset identifier like "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
              type = 'asset';
            } else {
              type = 'raw';
            }
          } else {
            const result = decodeBase64Value(topic);
            decoded = result.decoded;
            type = result.type;
            // Check if decoded value is an asset identifier
            if (decoded.includes(':') || decoded === 'native') {
              type = 'asset';
            }
          }

          const value = (type === 'contract' || type === 'account') ? formatAddressWithSymbol(decoded) :
            (type === 'asset') ? (decoded === 'native' ? 'XLM' : decoded.split(':')[0]) :
              decoded;
          decodedValues.push({ value, type, raw: decoded });
        });

        // Process data
        if (lastTransfer.data !== undefined && lastTransfer.data !== null) {
          const dataItems = Array.isArray(lastTransfer.data) ? lastTransfer.data : [lastTransfer.data];

          dataItems.forEach((dataItem: any) => {
            let decoded: string;
            let type: string;

            if (typeof dataItem === 'string' || typeof dataItem === 'number') {
              decoded = String(dataItem);
              if (!isNaN(Number(decoded))) {
                type = 'number';
              } else if (decoded.startsWith('G') && decoded.length === 56) {
                type = 'account';
              } else if (decoded.startsWith('C') && decoded.length === 56) {
                type = 'contract';
              } else {
                type = 'raw';
              }
            } else {
              const result = decodeBase64Value(dataItem);
              decoded = result.decoded;
              type = result.type;
            }

            let value = decoded;
            if (type === 'contract' || type === 'account') {
              value = formatAddressWithSymbol(decoded);
            } else if (type === 'number') {
              // Keep the raw number, we'll format it later with proper decimals
              value = decoded;
            }

            decodedValues.push({ value, type, raw: decoded });
          });
        }

        // Extract from, to, amount, and asset from decodedValues
        // For transfer events: topics[0]=event, topics[1]=from, topics[2]=to, topics[3]=asset, data[0]=amount
        const accounts = decodedValues.filter(item => item.type === 'account' || item.type === 'contract');
        const amounts = decodedValues.filter(item => item.type === 'number');
        const assets = decodedValues.filter(item => item.type === 'asset');


        // Transfer event has: from (first account), to (second account), amount (first number)
        const fromAddr = accounts.length >= 1 ? accounts[0].value : '';
        const toAddr = accounts.length >= 2 ? accounts[1].value : '';
        const amountRaw = amounts.length > 0 ? amounts[0].raw : '0';


        // Use the SAME logic as individual event nodes to get asset symbol and decimals
        const contractAddr = lastTransfer.contractId || '';
        let asset = 'XLM';
        let tokenDecimals: number | undefined;

        if (contractAddr) {
          const metadata = metadataMap.get(contractAddr);
          if (metadata) {
            if (metadata.tokenSymbol) {
              asset = metadata.tokenSymbol;
            }
            tokenDecimals = metadata.tokenDecimals;
          }

          // Fallback: use contract address if no symbol found
          if (asset === 'XLM') {
            asset = formatAddress(contractAddr);
          }
        }

        // Check if asset was found in event topics (for display purposes)
        if (assets.length > 0 && assets[0].value) {
          // Event topics might have a more accurate symbol
          asset = assets[0].value;
        }

        // Format the amount with the correct decimals
        const formattedAmount = formatAmountWithDecimals(amountRaw, tokenDecimals);

        if (amountRaw !== '0' && parseInt(amountRaw) > 0) {
          // First line: Amount + Token transferred
          finalContent.push(`${formattedAmount} ${asset} transferred`);

          // Second line: From (truncated for display, full for copy)
          if (fromAddr) {
            const fromShort = formatAddress(fromAddr);
            finalContent.push(`From: ${fromShort}||${fromAddr}`);
          }

          // Third line: To (truncated for display, full for copy)
          if (toAddr) {
            const toShort = formatAddress(toAddr);
            finalContent.push(`To: ${toShort}||${toAddr}`);
          }
        }

        // Only add final result content to shared collection
        if (finalContent.length > 0) {
          finalResultLines.push(...finalContent);
        }
      }

      // Add aggregated final summary node for all balance changes
      const balanceChanges = new Map<string, {
        account: string;
        asset: string;
        assetSymbol: string;
        minted: bigint;
        burned: bigint;
        transferredIn: bigint;
        transferredOut: bigint;
        decimals?: number;
      }>();

      // Process all events to aggregate balance changes
      filteredEvents.forEach((event: any) => {
        const topics = event.topics || [];
        const eventType = decodeTopic(topics[0]);
        const lowerEventType = eventType.toLowerCase();

        if (lowerEventType === 'mint' || lowerEventType === 'burn' || lowerEventType === 'transfer') {
          // Decode topics and data using the SAME logic as working nodes
          const decodedValues: Array<{ value: string, type: string, raw: string }> = [];

          // Process topics (skip first which is event type)
          topics.slice(1).forEach((topic: any) => {
            let decoded: string;
            let type: string;

            // First decode the topic using decodeTopic helper
            const decodedTopic = decodeTopic(topic);

            if (decodedTopic.startsWith('G') && decodedTopic.length === 56) {
              decoded = decodedTopic;
              type = 'account';
            } else if (decodedTopic.startsWith('C') && decodedTopic.length === 56) {
              decoded = decodedTopic;
              type = 'contract';
            } else {
              // If it looks like base64 or needs further decoding
              decoded = decodedTopic;
              type = 'raw';
            }

            decodedValues.push({ value: decoded, type, raw: decoded });
          });

          // Process data
          if (event.data !== undefined && event.data !== null) {
            const dataItems = Array.isArray(event.data) ? event.data : [event.data];

            dataItems.forEach((dataItem: any) => {
              if (typeof dataItem === 'object' && dataItem !== null && !Array.isArray(dataItem)) {
                return; // Skip objects
              }

              let decoded: string;
              let type: string;

              if (typeof dataItem === 'string' || typeof dataItem === 'number') {
                decoded = String(dataItem);
                if (!isNaN(Number(decoded))) {
                  type = 'number';
                } else if (decoded.startsWith('G') && decoded.length === 56) {
                  type = 'account';
                } else if (decoded.startsWith('C') && decoded.length === 56) {
                  type = 'contract';
                } else {
                  type = 'raw';
                }
              } else {
                const result = decodeBase64Value(dataItem);
                decoded = result.decoded;
                type = result.type;
              }

              decodedValues.push({ value: decoded, type, raw: decoded });
            });
          }

          // Extract accounts and amount from decodedValues
          const accounts = decodedValues.filter(item => item.type === 'account' || item.type === 'contract');
          const numbers = decodedValues.filter(item => item.type === 'number');

          if (numbers.length === 0) return; // No amount found

          const amountRaw = numbers[0].raw.replace(/,/g, '');
          const amount = BigInt(amountRaw);

          let toAccount: string | null = null;
          let fromAccount: string | null = null;

          // Extract addresses based on event type
          if (lowerEventType === 'transfer') {
            if (accounts.length >= 2) {
              fromAccount = accounts[0].raw;
              toAccount = accounts[1].raw;
            }
          } else if (lowerEventType === 'mint') {
            if (accounts.length >= 1) {
              toAccount = accounts[0].raw;
            }
          } else if (lowerEventType === 'burn') {
            if (accounts.length >= 1) {
              fromAccount = accounts[0].raw;
            }
          }

          // Store contract address - we'll look up metadata later
          const contractAddr = event.contractId;

          // Update balance changes map (store contract address, look up symbol/decimals later)
          if (lowerEventType === 'mint' && toAccount) {
            const key = `${toAccount}-${contractAddr}`;
            const existing = balanceChanges.get(key) || {
              account: toAccount,
              contractAddr: contractAddr || 'Unknown',
              minted: BigInt(0),
              burned: BigInt(0),
              transferredIn: BigInt(0),
              transferredOut: BigInt(0),
            };
            existing.minted += amount;
            balanceChanges.set(key, existing);
          } else if (lowerEventType === 'burn' && fromAccount) {
            const key = `${fromAccount}-${contractAddr}`;
            const existing = balanceChanges.get(key) || {
              account: fromAccount,
              contractAddr: contractAddr || 'Unknown',
              minted: BigInt(0),
              burned: BigInt(0),
              transferredIn: BigInt(0),
              transferredOut: BigInt(0),
            };
            existing.burned += amount;
            balanceChanges.set(key, existing);
          } else if (lowerEventType === 'transfer') {
            if (fromAccount) {
              const key = `${fromAccount}-${contractAddr}`;
              const existing = balanceChanges.get(key) || {
                account: fromAccount,
                contractAddr: contractAddr || 'Unknown',
                minted: BigInt(0),
                burned: BigInt(0),
                transferredIn: BigInt(0),
                transferredOut: BigInt(0),
              };
              existing.transferredOut += amount;
              balanceChanges.set(key, existing);
            }
            if (toAccount) {
              const key = `${toAccount}-${contractAddr}`;
              const existing = balanceChanges.get(key) || {
                account: toAccount,
                contractAddr: contractAddr || 'Unknown',
                minted: BigInt(0),
                burned: BigInt(0),
                transferredIn: BigInt(0),
                transferredOut: BigInt(0),
              };
              existing.transferredIn += amount;
              balanceChanges.set(key, existing);
            }
          }
        }
      });

      // Create final summary node if there are balance changes
      if (balanceChanges.size > 0 && lastNodeId) {
        const summaryId = 'aggregated-summary';
        const summaryContent: string[] = [];

        balanceChanges.forEach((change, key) => {
          const netCredits = change.minted + change.transferredIn;
          const netDebits = change.burned + change.transferredOut;
          const netChange = netCredits - netDebits;

          if (netChange !== BigInt(0)) {
            // Look up token symbol and decimals NOW (after all data is loaded)
            const contractAddr = change.contractAddr;
            const metadata = metadataMap.get(contractAddr);
            let assetSymbol = metadata?.tokenSymbol || '';
            let decimals = metadata?.tokenDecimals;

            // Fallback: show Unknown Token if no metadata
            if (!assetSymbol) {
              assetSymbol = 'Unknown Token';
            }

            // Format amount using the same service as individual nodes
            const formattedAmount = formatAmountWithDecimals(netChange.toString(), decimals);

            const action = netChange > BigInt(0) ? 'credited' : 'debited';

            // Format: displayValue||copyValue (when clicked, copies only token symbol)
            summaryContent.push(`${formattedAmount} ${assetSymbol} ${action}||${assetSymbol}`);

            const directionLabel = netChange > BigInt(0) ? 'To' : 'From';
            summaryContent.push(`${directionLabel}: ${formatAddress(change.account)}||${change.account}`);
          }
        });

        // Prepend FINAL RESULT lines if they exist
        if (finalResultLines.length > 0) {
          summaryContent.unshift(...finalResultLines);
        }

        if (summaryContent.length > 0) {
          yOffset += 100;

          generatedNodes.push({
            id: summaryId,
            type: 'operation',
            position: { x: xCenter, y: yOffset },
            data: {
              stepNumber: '',
              emoji: '📊',
              title: 'NET BALANCE CHANGES',
              content: summaryContent,
              isFinalResult: true,
            },
          });

          generatedEdges.push({
            id: `${lastNodeId}-${summaryId}`,
            source: lastNodeId,
            target: summaryId,
            type: 'straight',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
            style: { stroke: '#10b981', strokeWidth: 4 },
          });
        }
      }

      setNodes(generatedNodes);
      setEdges(generatedEdges);
    };

    generateFlow();
  }, [events, sourceAccount, functionName, assetBalanceChanges, simplifiedMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, maxZoom: 0.5, minZoom: 0.1, duration: 0 });
    }, 100);
    return () => clearTimeout(timer);
  }, [nodes.length, fitView]);

  const onConnect = useCallback((params: Connection) => {
  }, []);

  return (
    <div className="w-full h-[800px] bg-gray-50 rounded-lg overflow-hidden border border-gray-100 relative">
      {/* Loading overlay */}
      {isLoadingMetadata && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-lg font-semibold text-gray-700">{loadingProgress}</p>
            <p className="text-sm text-gray-500 mt-2">This may take a moment for complex transactions...</p>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        fitView={true}
        fitViewOptions={{ padding: 0.2, maxZoom: 0.5, minZoom: 0.1 }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.3 }}
        className="bg-gray-50"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'straight',
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
        }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls className="bg-white shadow-md border border-gray-100" showFitView={true} showInteractive={false} />
        <MiniMap
          className="bg-white border border-gray-200 rounded"
          nodeColor="#3b82f6"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}

export function UserOperationFlow(props: UserOperationFlowProps) {
  return (
    <ReactFlowProvider>
      <UserOperationFlowInner {...props} />
    </ReactFlowProvider>
  );
}
