import { ContractInvocation, ContractEvent } from '../types/stellar';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

interface CallStackEntry {
  id: string;
  depth: number;
  invoker: string;
  invokerType: 'account' | 'contract';
  contractId: string;
  functionName: string;
  parameters: any[];
  returnValue?: any;
  children: ContractInvocation[];
  events: ContractEvent[];
  success: boolean;
}

function decodeContractId(value: any): string {
  if (!value) return 'Unknown';

  // Already encoded address
  if (typeof value === 'string') {
    if (value.startsWith('C') && value.length === 56) {
      return value;
    }

    if (value.startsWith('G') && value.length === 56) {
      return value;
    }

    // Try to decode base64 string
    try {
      // Use atob for browser compatibility
      const binaryString = atob(value);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (bytes.length === 32) {
        try {
          return StellarSdk.StrKey.encodeContract(Buffer.from(bytes));
        } catch (err) {
          try {
            return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(bytes));
          } catch (err2) {
            return value;
          }
        }
      }
    } catch (e) {
      return value;
    }
  }

  // Handle Uint8Array
  if (value instanceof Uint8Array) {
    try {
      if (value.length === 32) {
        try {
          return StellarSdk.StrKey.encodeContract(Buffer.from(value));
        } catch {
          try {
            return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(value));
          } catch {
            return 'Unknown';
          }
        }
      }
    } catch (e) {
      return 'Unknown';
    }
  }

  // Handle object with numeric keys (byte array as object)
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    if (keys.length === 32 && keys.every((k: string) => /^\d+$/.test(k))) {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = value[i];
      }
      try {
        return StellarSdk.StrKey.encodeContract(Buffer.from(bytes));
      } catch {
        try {
          return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(bytes));
        } catch {
          return 'Unknown';
        }
      }
    }
  }

  return String(value);
}

function formatValue(value: any, maxLength: number = 40): string {
  if (value === null || value === undefined) return 'null';

  if (typeof value === 'string') {
    if (value.length > maxLength) {
      return `"${value.substring(0, maxLength)}..."`;
    }
    return `"${value}"`;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return `${value}`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) {
      return `[${value.map(v => formatValue(v, 20)).join(', ')}]`;
    }
    return `[${value.slice(0, 3).map(v => formatValue(v, 20)).join(', ')}, ...${value.length - 3} more]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    if (entries.length <= 2) {
      return `{${entries.map(([k, v]) => `${k}: ${formatValue(v, 15)}`).join(', ')}}`;
    }
    return `{${entries.slice(0, 2).map(([k, v]) => `${k}: ${formatValue(v, 15)}`).join(', ')}, ...}`;
  }

  return String(value);
}

function formatContractId(contractId: string): string {
  if (!contractId || contractId === 'Unknown') return contractId;
  if (contractId.length <= 12) return contractId;
  return `${contractId.substring(0, 4)}…${contractId.substring(contractId.length - 4)}`;
}

function formatAddress(address: string): string {
  if (!address) return address;
  if (address.length <= 12) return address;
  return `${address.substring(0, 4)}…${address.substring(address.length - 4)}`;
}

function parseTopicValue(topic: any): string {
  if (typeof topic === 'string') {
    return topic.replace('sym', '').replace('str', '');
  }
  return String(topic);
}

export function parseContractInvocations(
  events: ContractEvent[],
  sourceAccount: string
): ContractInvocation[] {
  const callStack: CallStackEntry[] = [];
  const rootInvocations: ContractInvocation[] = [];
  let invocationCounter = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const topics = event.topics || [];
    const eventType = topics.length > 0 ? parseTopicValue(topics[0]).toLowerCase() : '';

    if (eventType === 'fn_call') {
      const rawContractId = topics.length > 1 ? topics[1] : event.contractId;
      const contractId = decodeContractId(rawContractId);
      const functionName = topics.length > 2 ? parseTopicValue(topics[2]) : 'unknown';

      const parameters = event.data !== null && event.data !== undefined
        ? (Array.isArray(event.data) ? event.data : [event.data])
        : [];

      const depth = callStack.length;
      const invoker = depth === 0 ? sourceAccount : callStack[callStack.length - 1].contractId;
      const invokerType = depth === 0 ? 'account' : 'contract';

      const invocation: CallStackEntry = {
        id: `inv-${invocationCounter++}`,
        depth,
        invoker,
        invokerType,
        contractId,
        functionName,
        parameters,
        children: [],
        events: [],
        success: true,
      };

      if (depth === 0) {
        rootInvocations.push(invocation as ContractInvocation);
      } else {
        const parent = callStack[callStack.length - 1];
        parent.children.push(invocation as ContractInvocation);
      }

      callStack.push(invocation);
    } else if (eventType === 'fn_return') {
      if (callStack.length > 0) {
        const currentCall = callStack[callStack.length - 1];
        currentCall.returnValue = event.data;
        callStack.pop();
      }
    } else {
      if (callStack.length > 0) {
        const currentCall = callStack[callStack.length - 1];
        const processedEvent = {
          ...event,
          contractId: decodeContractId(event.contractId)
        };
        currentCall.events.push(processedEvent);
      }
    }
  }

  return rootInvocations;
}

export function formatInvocationDisplay(
  invocation: ContractInvocation,
  options: {
    showInvoker?: boolean;
    indent?: number;
  } = {}
): string {
  const { showInvoker = true, indent = 0 } = options;
  const indentStr = ' '.repeat(indent);

  let result = '';

  if (showInvoker && indent === 0) {
    result += `${formatAddress(invocation.invoker)} invoked contract `;
  } else {
    result += `${indentStr}Invoked contract `;
  }

  result += `${formatContractId(invocation.contractId)} `;
  result += `${invocation.functionName}(`;

  if (invocation.parameters.length > 0) {
    const formattedParams = invocation.parameters.map(p => formatValue(p)).join(', ');
    result += formattedParams;
  }

  result += ')';

  if (invocation.returnValue !== undefined && invocation.returnValue !== null) {
    result += ` → ${formatValue(invocation.returnValue)}`;
  }

  return result;
}

export function formatInvocationTree(invocations: ContractInvocation[]): string[] {
  const lines: string[] = [];

  function processInvocation(invocation: ContractInvocation, depth: number = 0) {
    const showInvoker = depth === 0;
    const indent = depth > 0 ? depth * 1 : 0;

    lines.push(formatInvocationDisplay(invocation, { showInvoker, indent }));

    if (invocation.events.length > 0) {
      invocation.events.forEach(event => {
        const topics = event.topics || [];
        const eventType = topics.length > 0 ? parseTopicValue(topics[0]) : 'unknown';
        const eventData = event.data !== null ? formatValue(event.data) : '';
        const topicsStr = topics.slice(1).map(t => parseTopicValue(t)).join(', ');

        const eventIndent = ' '.repeat(indent + 1);
        lines.push(
          `${eventIndent}Contract ${formatContractId(event.contractId)} raised event [${topicsStr}] with data ${eventData}`
        );
      });
    }

    invocation.children.forEach(child => {
      processInvocation(child, depth + 1);
    });
  }

  invocations.forEach(inv => processInvocation(inv, 0));

  return lines;
}
