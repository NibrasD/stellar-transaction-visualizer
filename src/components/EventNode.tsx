import React from 'react';
import { Zap, Database, Clock } from 'lucide-react';
import type { NodeProps } from 'reactflow';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Handle, Position } from 'reactflow';
import { decodeScVal } from '../services/stellar';

interface EventNodeData {
  event: any;
  parentOperationIndex: number;
  eventIndex: number;
  operationData?: {
    contractId?: string;
    functionName?: string;
    args?: any[];
    auth?: any[];
    status?: string;
    stateChanges?: any[];
    ttlExtensions?: any[];
    resourceUsage?: {
      refundableFee?: number;
      nonRefundableFee?: number;
      rentFee?: number;
    };
    result?: any;
  };
}

// Helper to check if an object looks like a serialized Buffer/Uint8Array
function isSerializedBuffer(obj: any): boolean {
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

export function EventNode({ data }: NodeProps<EventNodeData>) {
  const { event, parentOperationIndex, eventIndex, operationData } = data;

  // Debug logging

  // Safety check
  if (!event) {
    return (
      <div className="bg-white rounded-lg shadow-md border-2 border-gray-300 p-4">
        <div className="text-sm text-gray-500">Invalid event data</div>
      </div>
    );
  }

  const formatAccountId = (id: string) => {
    if (!id || id.length < 10) return id;
    return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
  };

  const formatValue = (val: any): string => {
    try {
      if (val === null || val === undefined) return '';

      // Check for serialized buffers FIRST and convert them
      if (val && typeof val === 'object' && isSerializedBuffer(val)) {
        const bytes = serializedBufferToUint8Array(val);
        if (bytes.length === 32) {
          try {
            return formatAccountId(StellarSdk.StrKey.encodeEd25519PublicKey(bytes));
          } catch {
            try {
              return formatAccountId(StellarSdk.StrKey.encodeContract(bytes));
            } catch {
              const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
              return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
            }
          }
        }
        const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
        return hex.length > 32 ? `0x${hex.slice(0, 16)}...${hex.slice(-16)}` : `0x${hex}`;
      }

      // Decode if it's an ScVal object
      if (val && typeof val === 'object' && (val._switch || val._arm)) {
        try {
          val = decodeScVal(val);
        } catch (e) {
        }
      }

      if (typeof val === 'bigint') {
        const str = val.toString();
        if (str.length > 7) {
          const intPart = str.slice(0, -7);
          const decPart = str.slice(-7);
          return `${intPart}.${decPart}`;
        }
        return val.toString();
      }

      if (typeof val === 'number') {
        return val.toLocaleString(undefined, { maximumFractionDigits: 7 });
      }

      if (typeof val === 'string') {
        if (val.length > 30 && (val.startsWith('G') || val.startsWith('C'))) {
          return formatAccountId(val);
        }
        return val;
      }

      if (Array.isArray(val)) {
        return val.map(v => formatValue(v)).join(', ');
      }

      if (typeof val === 'object') {
        return JSON.stringify(val).substring(0, 50) + '...';
      }

      return String(val);
    } catch (e) {
      return '[Error]';
    }
  };

  const getTypeString = (val: any): string => {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'bigint') return 'i128';
    if (typeof val === 'number') return 'u32';
    if (typeof val === 'string') {
      if (val.startsWith('G') || val.startsWith('C')) return 'Address';
      return 'String';
    }
    if (Array.isArray(val)) return 'Vec';
    if (typeof val === 'object') return 'Map';
    return 'unknown';
  };

  // Parse event topics and data
  const topics = Array.isArray(event.topics) ? event.topics : [];
  const eventData = Array.isArray(event.data) ? event.data : (event.data ? [event.data] : []);

  // Decode all topics and data
  let decodedTopics: any[] = [];
  let decodedData: any[] = [];

  try {
    decodedTopics = topics.map((t: any) => {
      try {
        return decodeScVal(t);
      } catch (e) {
        return t;
      }
    });

    decodedData = eventData.map((d: any) => {
      try {
        return decodeScVal(d);
      } catch (e) {
        return d;
      }
    });
  } catch (e) {
  }

  const eventType = decodedTopics.length > 0 ? String(decodedTopics[0]) : 'Event';
  const contractId = event.contractId ? event.contractId : '';

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

  // Helper to remove "sym" suffix from strings
  const cleanSymSuffix = (str: string): string => str.replace(/"sym$/g, '"');

  // Build the developer-friendly JSON structure
  const buildJsonStructure = () => {
    const fnCallTopics = decodedTopics.map(t => cleanSymSuffix(formatValueWithType(t, 80)));
    const fnCallData = decodedData.map(d => cleanSymSuffix(formatValueWithType(d, 80)));

    return {
      fn_call: {
        topics: fnCallTopics,
        data: fnCallData
      },
      fn_return: operationData?.result ? {
        data: [cleanSymSuffix(formatValueWithType(operationData.result, 80))]
      } : undefined
    };
  };

  const jsonStructure = buildJsonStructure();

  return (
    <div className="px-4 py-3 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-lg border-2 border-cyan-500/30 w-auto relative" style={{ minWidth: '450px', maxWidth: '650px' }}>
      <Handle type="target" position={Position.Left} className="!bg-cyan-400" />

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-cyan-500/20">
        <div className="p-1.5 bg-cyan-500/20 rounded">
          <Zap className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-cyan-300 text-sm">Contract Event</h3>
          <p className="text-xs text-slate-400">Event #{eventIndex}</p>
        </div>
      </div>

      {/* Contract ID */}
      {contractId && (
        <div className="mb-3">
          <div className="text-xs text-cyan-400 font-semibold mb-1">Contract:</div>
          <code className="text-sm font-mono text-emerald-400 bg-black/30 px-2 py-1 rounded border border-cyan-500/20">
            {formatAccountId(contractId)}
          </code>
        </div>
      )}

      {/* JSON Structure Display */}
      <div className="space-y-2 font-mono text-sm">
        <div className="bg-black/40 rounded-lg p-3 border border-cyan-500/20">
          <div className="text-slate-400">{'{'}</div>

          {/* fn_call section */}
          <div className="ml-4">
            <div className="text-orange-400">"fn_call"<span className="text-slate-400">: {'{'}</span></div>

            {/* topics */}
            <div className="ml-4">
              <div className="text-pink-400">"topics"<span className="text-slate-400">: [</span></div>
              <div className="ml-4 space-y-1">
                {jsonStructure.fn_call.topics.map((topic, idx) => (
                  <div key={idx} className="text-emerald-300">
                    "{topic}"{idx < jsonStructure.fn_call.topics.length - 1 ? ',' : ''}
                  </div>
                ))}
              </div>
              <div className="text-slate-400">],</div>
            </div>

            {/* data */}
            <div className="ml-4">
              <div className="text-pink-400">"data"<span className="text-slate-400">: [</span></div>
              <div className="ml-4 space-y-1">
                {jsonStructure.fn_call.data.map((dataItem, idx) => (
                  <div key={idx} className="text-yellow-300">
                    "{dataItem}"{idx < jsonStructure.fn_call.data.length - 1 ? ',' : ''}
                  </div>
                ))}
              </div>
              <div className="text-slate-400">]</div>
            </div>

            <div className="text-slate-400">{'}'}{jsonStructure.fn_return ? ',' : ''}</div>
          </div>

          {/* fn_return section */}
          {jsonStructure.fn_return && (
            <div className="ml-4">
              <div className="text-orange-400">"fn_return"<span className="text-slate-400">: {'{'}</span></div>
              <div className="ml-4">
                <div className="text-pink-400">"data"<span className="text-slate-400">: [</span></div>
                <div className="ml-4">
                  {jsonStructure.fn_return.data.map((returnItem, idx) => (
                    <div key={idx} className="text-green-300">
                      "{returnItem}"
                    </div>
                  ))}
                </div>
                <div className="text-slate-400">]</div>
              </div>
              <div className="text-slate-400">{'}'}</div>
            </div>
          )}

          <div className="text-slate-400">{'}'}</div>
        </div>
      </div>

      {/* Ledger Changes */}
      {operationData?.stateChanges && operationData.stateChanges.length > 0 && (
        <div className="mt-3 pt-3 border-t border-cyan-500/20">
          <div className="text-xs font-semibold text-cyan-400 mb-2">Ledger Changes ({operationData.stateChanges.length})</div>
          <div className="space-y-2">
            {operationData.stateChanges.map((change: any, idx: number) => {
              const contractIdShort = change.contractId
                ? `${change.contractId.slice(0, 4)}…${change.contractId.slice(-4)}`
                : 'Unknown';

              const actionType = change.type || 'updated';
              const storageType = change.storageType || 'data';
              const keyDisplay = change.keyDisplay || change.key || '';

              const dataToShow = change.after !== undefined ? change.after : change.value;
              const hasData = dataToShow !== undefined && dataToShow !== null && dataToShow !== 'ContractInstance';

              return (
                <div key={idx} className="bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-500/30 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="text-emerald-400 mt-0.5 text-xs">●</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-emerald-300 text-[11px] mb-1 leading-tight">
                        Contract {contractIdShort} {actionType} {storageType} {keyDisplay}
                      </div>
                      {hasData && (
                        <div className="ml-0.5">
                          <div className="text-emerald-200 font-mono text-[10px] bg-black/30 p-1.5 rounded border border-emerald-500/20 leading-relaxed break-all">
                            = {formatValueWithType(dataToShow, 100)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TTL Extensions */}
      {operationData?.ttlExtensions && operationData.ttlExtensions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-cyan-500/20">
          <div className="space-y-1">
            {operationData.ttlExtensions.map((ttl: any, idx: number) => (
              <div key={idx} className="flex items-start gap-2 text-xs">
                <Clock className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-slate-300">
                    <span className="font-semibold">TTL Extended</span>
                    {' → '}
                    <span className="font-mono text-amber-300">{ttl.ledgerSeq || ttl.description || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-cyan-400" />
    </div>
  );
}
