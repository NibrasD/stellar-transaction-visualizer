import React from 'react';
import { Database, Plus, Edit, Trash2 } from 'lucide-react';
import type { NodeProps } from 'reactflow';
import { StateChange } from '../types/stellar';
import * as StellarSdk from '@stellar/stellar-sdk';

interface StateChangeNodeData {
  stateChange: StateChange;
  parentOperationIndex: number;
  changeIndex: number;
}

export function StateChangeNode({ data }: NodeProps<StateChangeNodeData>) {
  const { stateChange, parentOperationIndex, changeIndex } = data;

  const formatAccountId = (id: string) => {
    if (!id || id.length < 10) return id;
    return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
  };

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

  // Format value with type annotations
  const formatValueWithType = (val: any): string => {
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
      return b64.length > 32 ? `${b64.substring(0, 16)}…${b64.substring(b64.length - 8)}bytes` : `${b64}bytes`;
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
      const items = val.map(v => formatValueWithType(v)).join(', ');
      return `[${items}]`;
    }

    if (typeof val === 'object') {
      try {
        const entries = Object.entries(val).map(([k, v]) => {
          const key = typeof k === 'string' ? `"${k}"sym` : k;
          const value = formatValueWithType(v);
          return `${key}: ${value}`;
        });
        return `{${entries.join(', ')}}`;
      } catch {
        return String(val);
      }
    }

    return String(val);
  };

  const formatValue = (val: any): string => {
    return formatValueWithType(val);
  };

  // Build human-readable description
  const buildDescription = (): string => {
    const type = (stateChange.type || stateChange.changeType || '').toLowerCase();
    const storageType = stateChange.storageType || 'data';
    const key = stateChange.keyDisplay || 'entry';
    const contractId = stateChange.contractId ? formatAccountId(stateChange.contractId) : 'Contract';

    let action = 'modified';
    if (type === 'created' || type === 'create') action = 'created';
    else if (type === 'updated' || type === 'update') action = 'updated';
    else if (type === 'removed' || type === 'delete' || type === 'deleted') action = 'removed';

    let valueStr = '';
    const dataToShow = stateChange.after !== undefined ? stateChange.after : stateChange.value;
    if (dataToShow !== undefined && dataToShow !== null && dataToShow !== 'ContractInstance') {
      const formatted = formatValue(dataToShow);
      // Only show value if it's not too long
      if (formatted.length > 100) {
        valueStr = ` = {…}`;
      } else {
        valueStr = ` = ${formatted}`;
      }
    }

    return `Contract ${contractId} ${action} ${storageType} data ${key}${valueStr}`;
  };

  const description = buildDescription();

  const getChangeTypeInfo = () => {
    const type = (stateChange.type || stateChange.changeType || '').toLowerCase();
    switch (type) {
      case 'created':
      case 'create':
        return {
          icon: Plus,
          color: 'bg-green-50 border-green-300',
          iconColor: 'text-green-600'
        };
      case 'updated':
      case 'update':
        return {
          icon: Edit,
          color: 'bg-blue-50 border-blue-300',
          iconColor: 'text-blue-600'
        };
      case 'removed':
      case 'delete':
      case 'deleted':
        return {
          icon: Trash2,
          color: 'bg-red-50 border-red-300',
          iconColor: 'text-red-600'
        };
      default:
        return {
          icon: Database,
          color: 'bg-gray-50 border-gray-300',
          iconColor: 'text-gray-600'
        };
    }
  };

  const typeInfo = getChangeTypeInfo();
  const Icon = typeInfo.icon;

  return (
    <div className={`rounded-lg border-2 ${typeInfo.color} p-4 shadow-md w-auto`} style={{ minWidth: '300px', maxWidth: '600px', width: 'fit-content' }}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${typeInfo.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-800 leading-relaxed">
            {description}
          </div>
        </div>
      </div>
    </div>
  );
}
