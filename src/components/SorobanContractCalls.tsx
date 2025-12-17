import React from 'react';
import { ContractInvocation } from '../types/stellar';
import { Activity, ChevronRight, ChevronDown, GitBranch, CheckCircle2, AlertCircle } from 'lucide-react';
import { CopyButton } from './CopyButton';
import * as StellarSdk from '@stellar/stellar-sdk';

// Buffer detection and formatting utilities
function isNodeBuffer(val: any): val is { type: 'Buffer'; data: number[] } {
  return val && typeof val === 'object' && val.type === 'Buffer' && Array.isArray(val.data);
}

function isSerializedBuffer(val: any): boolean {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const keys = Object.keys(val);
  if (keys.length === 0) return false;
  return keys.every(key => !isNaN(parseInt(key, 10)));
}

function serializedBufferToUint8Array(val: any): Uint8Array {
  const keys = Object.keys(val).map(k => parseInt(k, 10)).sort((a, b) => a - b);
  return new Uint8Array(keys.map(k => val[k]));
}

function formatBufferAsHexOrAddress(bytes: Uint8Array): string {
  // Try to decode as Stellar address (32 bytes)
  if (bytes.length === 32) {
    try {
      return StellarSdk.StrKey.encodeContract(Buffer.from(bytes));
    } catch {
      try {
        return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(bytes));
      } catch {
        // Fall through to hex
      }
    }
  }
  // Format as hex
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex.length > 40) {
    return `0x${hex.slice(0, 16)}...${hex.slice(-8)}`;
  }
  return `0x${hex}`;
}

function preprocessValue(val: any): any {
  if (val === null || val === undefined) return val;

  if (isNodeBuffer(val)) {
    const bytes = new Uint8Array(val.data);
    return formatBufferAsHexOrAddress(bytes);
  }

  if (isSerializedBuffer(val)) {
    const bytes = serializedBufferToUint8Array(val);
    return formatBufferAsHexOrAddress(bytes);
  }

  if (val instanceof Uint8Array) {
    return formatBufferAsHexOrAddress(val);
  }

  if (Array.isArray(val)) {
    return val.map(item => preprocessValue(item));
  }

  if (typeof val === 'object') {
    const result: any = {};
    for (const key of Object.keys(val)) {
      result[key] = preprocessValue(val[key]);
    }
    return result;
  }

  return val;
}

interface SorobanContractCallsProps {
  invocations: ContractInvocation[];
}

function formatValue(value: any, maxLength: number = 2000): string {
  if (value === null || value === undefined) return 'null';

  // Handle Node.js Buffer representation
  if (isNodeBuffer(value)) {
    const bytes = new Uint8Array(value.data);
    return formatBufferAsHexOrAddress(bytes);
  }

  // Handle serialized buffer (numeric keys)
  if (isSerializedBuffer(value)) {
    const bytes = serializedBufferToUint8Array(value);
    return formatBufferAsHexOrAddress(bytes);
  }

  // Handle Uint8Array
  if (value instanceof Uint8Array) {
    return formatBufferAsHexOrAddress(value);
  }

  if (typeof value === 'string') {
    if (value.endsWith('sym')) {
      return value.replace('sym', '');
    }
    if (value.endsWith('str')) {
      return `"${value.replace('str', '')}"`;
    }
    if (value.length > maxLength) {
      return `"${value.substring(0, maxLength)}..."`;
    }
    if (value.startsWith('G') && value.length === 56) {
      return value;
    }
    if (value.startsWith('C') && value.length === 56) {
      return value;
    }
    return `"${value}"`;
  }

  if (typeof value === 'number') {
    return `${value}`;
  }

  if (typeof value === 'bigint') {
    return `${value}i128`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    // Use large limit for array items
    const items = value.map(v => formatValue(v, 1000));
    return `[${items.join(', ')}]`;
  }

  if (typeof value === 'object') {
    if (value.type && typeof value.value !== 'undefined') {
      const suffix = value.type === 'u32' ? 'u32' :
        value.type === 'i32' ? 'i32' :
          value.type === 'u64' ? 'u64' :
            value.type === 'i64' ? 'i64' :
              value.type === 'i128' ? 'i128' :
                value.type === 'u128' ? 'u128' : '';
      return `${value.value}${suffix}`;
    }

    // Preprocess object values to handle nested buffers
    const processedValue = preprocessValue(value);
    const entries = Object.entries(processedValue);
    if (entries.length === 0) return '{}';
    // Show all entries, or at least a lot more
    if (entries.length <= 50) {
      return `{${entries.map(([k, v]) => `${k}: ${formatValue(v, 1000)}`).join(', ')}}`;
    }
    return `{${entries.slice(0, 50).map(([k, v]) => `${k}: ${formatValue(v, 1000)}`).join(', ')}, ...}`;
  }

  return String(value);
}

function formatContractId(contractId: string): string {
  if (!contractId || contractId === 'Unknown') return contractId;
  // Always return full contract ID
  return contractId;
}

function formatAddress(address: string): string {
  if (!address) return address;
  // Always return full address
  return address;
}

function parseEventTopic(topic: any): string {
  if (typeof topic === 'string') {
    return topic.replace('sym', '').replace('str', '');
  }
  if (typeof topic === 'object' && topic.value) {
    return String(topic.value);
  }
  return String(topic);
}

interface InvocationNodeProps {
  invocation: ContractInvocation;
  isRoot?: boolean;
  depth?: number;
}

function InvocationNode({ invocation, isRoot = false, depth = 0 }: InvocationNodeProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const hasChildren = invocation.children.length > 0;
  const hasEvents = invocation.events.length > 0;

  const parameters = invocation.parameters || [];
  const paramsDisplay = parameters.map(p => formatValue(p)).join(', ');
  const returnDisplay = invocation.returnValue !== undefined && invocation.returnValue !== null
    ? formatValue(invocation.returnValue)
    : null;

  return (
    <div className="relative">
      <div
        className={`group flex items-start gap-3 p-3 rounded-lg transition-all ${isRoot
          ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200'
          : 'bg-gray-50 border border-gray-200 hover:border-blue-300'
          }`}
      >
        {(hasChildren || hasEvents) && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 mt-1 p-1 hover:bg-white rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-600" />
            )}
          </button>
        )}
        {!hasChildren && !hasEvents && <div className="w-6" />}

        <div className="flex-1 min-w-0 font-mono text-sm">
          <div className="flex items-start gap-2 flex-wrap">
            {isRoot && (
              <span className="text-blue-700 font-semibold">
                {formatAddress(invocation.invoker)} invoked contract
              </span>
            )}
            {!isRoot && (
              <span className="text-gray-600">Invoked contract</span>
            )}

            <span className="font-semibold text-purple-700 break-all inline-flex items-center gap-1">
              {formatContractId(invocation.contractId)}
              <CopyButton text={invocation.contractId} className="opacity-60 hover:opacity-100" />
            </span>

            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-gray-900 font-semibold">{invocation.functionName}</span>
              <span className="text-gray-500">(</span>
              {parameters.length > 0 && (
                <span className="text-orange-600 break-all">{paramsDisplay}</span>
              )}
              <span className="text-gray-500">)</span>

              {returnDisplay && (
                <>
                  <span className="text-gray-500 mx-1">→</span>
                  <span className="text-green-700 break-all">{returnDisplay}</span>
                </>
              )}
            </div>

            <CopyButton
              text={`${invocation.contractId} ${invocation.functionName}(${paramsDisplay})${returnDisplay ? ` → ${returnDisplay}` : ''}`}
              className="opacity-0 group-hover:opacity-100"
            />
          </div>
        </div>

        {invocation.success ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        )}
      </div>

      {isExpanded && (hasEvents || hasChildren) && (
        <div className="ml-6 mt-2 border-l-2 border-gray-200 pl-4 space-y-2">
          {invocation.events.map((event, idx) => {
            const topics = event.topics || [];
            const eventType = topics.length > 0 ? parseEventTopic(topics[0]) : 'unknown';
            const eventTopics = topics.slice(1).map(t => parseEventTopic(t));
            const eventData = event.data !== null ? formatValue(event.data) : 'null';

            return (
              <div
                key={idx}
                className="group flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs font-mono"
              >
                <Activity className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-700 break-all flex items-center gap-1 flex-wrap">
                    Contract
                    <span className="font-semibold text-purple-700 inline-flex items-center gap-1">
                      {formatContractId(event.contractId)}
                      <CopyButton text={event.contractId} className="opacity-60 hover:opacity-100" />
                    </span>
                    raised event
                    {eventType !== 'unknown' && (
                      <span className="font-semibold text-yellow-700 bg-yellow-100 px-1 rounded">
                        {eventType}
                      </span>
                    )}
                  </div>
                  {eventTopics.length > 0 && (
                    <div className="text-blue-700 mt-1 break-all">
                      topics: [{eventTopics.map((t, i) => (
                        <span key={i}>
                          {t.startsWith('"') ? t : `"${t}"`}
                          {i < eventTopics.length - 1 ? ', ' : ''}
                        </span>
                      ))}]
                      <CopyButton text={eventTopics.join(', ')} className="ml-1 opacity-60 hover:opacity-100" />
                    </div>
                  )}
                  {eventData !== 'null' && (
                    <div className="text-green-700 mt-1 break-all flex items-start gap-1">
                      <span>with data:</span>
                      <span className="break-all">{eventData}</span>
                      <CopyButton text={typeof event.data === 'string' ? event.data : JSON.stringify(event.data, (_, v) => typeof v === 'bigint' ? v.toString() : v)} className="opacity-60 hover:opacity-100" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {invocation.children.map((child, idx) => (
            <InvocationNode
              key={child.id}
              invocation={child}
              isRoot={false}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SorobanContractCalls({ invocations }: SorobanContractCallsProps) {
  if (!invocations || invocations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        <GitBranch className="w-5 h-5 text-blue-600" />
        <h3>Soroban Contract Invocations</h3>
      </div>

      <div className="space-y-3">
        {invocations.map((invocation) => (
          <InvocationNode
            key={invocation.id}
            invocation={invocation}
            isRoot={true}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}
