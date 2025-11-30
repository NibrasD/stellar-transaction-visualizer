import React from 'react';
import { X } from 'lucide-react';
import * as StellarSdk from '@stellar/stellar-sdk';

interface ContractEventsFlowProps {
  events: any[];
  onClose: () => void;
  sourceAccount?: string;
  functionName?: string;
  isModal?: boolean; // If false, renders as tab content instead of modal
  assetBalanceChanges?: any[]; // Asset balance changes from Horizon API
}

// Helper to decode base64 contract IDs to Stellar format
const decodeContractId = (value: any): string => {
  if (!value) return 'unknown';

  // If it's already a Stellar address, return it
  if (typeof value === 'string' && (value.startsWith('C') || value.startsWith('G')) && value.length === 56) {
    return value;
  }

  // If it's base64, decode it
  if (typeof value === 'string' && value.includes('=')) {
    try {
      // Decode base64 to bytes
      const binaryString = atob(value);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // If it's 32 bytes, try to encode as contract or account
      if (bytes.length === 32) {
        try {
          return StellarSdk.StrKey.encodeContract(bytes);
        } catch {
          try {
            return StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
          } catch {
            return value; // Return original if can't decode
          }
        }
      }
    } catch (e) {
    }
  }

  return String(value);
};

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString();
  if (typeof val === 'boolean') return val ? 'yes' : 'no';
  if (Array.isArray(val)) return val.map(formatValue).filter(Boolean).join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const formatAddress = (address: string): string => {
  if (!address || address.length < 12) return address;
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};

const formatAmount = (amount: string): { raw: string; formatted: string } => {
  if (!amount) return { raw: '0', formatted: '0' };
  const decimals = 7;
  const num = parseFloat(amount) / Math.pow(10, decimals);
  return {
    raw: amount,
    formatted: num.toFixed(decimals).replace(/\.?0+$/, '')
  };
};

interface FlowStep {
  emoji: string;
  title: string;
  content: string[];
  isPhaseHeader?: boolean;
  phaseTitle?: string;
  phaseEmoji?: string;
  phaseDescription?: string;
}

export function ContractEventsFlow({ events, onClose, sourceAccount, functionName, isModal = true, assetBalanceChanges = [] }: ContractEventsFlowProps) {

  // Filter out duplicates and metrics
  // Strategy: Keep fn_call and fn_return from diagnostic events, but for contract events (mint),
  // only show them once (not duplicated from diagnostics)
  const seenCalls = new Set<string>();
  const filteredEvents = events.filter((event: any) => {
    const topics = event.topics || [];
    if (topics.length === 0) return true;
    const eventType = topics[0];

    // Always filter out metrics
    if (eventType === 'core_metrics') return false;

    // For fn_call events, track them to avoid showing duplicate contract events
    if (eventType === 'fn_call') {
      const contractId = event.contractId || '';
      const functionName = topics[2] || '';
      const key = `${contractId}:${functionName}`;
      seenCalls.add(key);
      return true;
    }

    // For other events (mint, transfer, etc.), only show if we haven't seen them as fn_call
    if (eventType === 'mint' || eventType === 'transfer') {
      const contractId = event.contractId || '';
      const key = `${contractId}:${eventType}`;
      if (seenCalls.has(key)) {
        return false; // Skip, already shown as fn_call
      }
    }

    return true;
  });

  const steps: FlowStep[] = [];
  let currentPhase = '';

  // ALWAYS add initial step showing who triggered the transaction
  // Find the first fn_call event to get details
  const firstCallEvent = filteredEvents.find((e: any) => {
    const topics = e.topics || [];
    return topics[0] === 'fn_call';
  });

  if (firstCallEvent) {
    const topics = firstCallEvent.topics || [];
    const data = firstCallEvent.data || [];

    // Extract function name from topics[2] - DON'T use functionName parameter as it's often wrong
    const extractedFunctionName = topics[2] || 'transaction';

    // Extract caller from topics[1] - this is the TARGET CONTRACT being called, not the account
    // For the initial transaction, we should use sourceAccount instead
    const callerAddress = sourceAccount || 'unknown';

    // Try to extract farmer/target and pail from the function arguments in data
    let farmerAddress = '';
    let pailNumber = '';

    // Arguments are in the data array (after skipping first element which is often the function name)
    const args = Array.isArray(data) ? data : [];

    // First arg is often the farmer/target address
    if (args.length > 0) {
      const firstArg = formatValue(args[0]);
      if (typeof firstArg === 'string' && (firstArg.startsWith('G') || firstArg.startsWith('C'))) {
        farmerAddress = firstArg;
      } else if (!isNaN(Number(firstArg))) {
        pailNumber = firstArg;
      }
    }

    // Second arg might be pail if first was address
    if (args.length > 1 && farmerAddress) {
      const secondArg = formatValue(args[1]);
      if (!isNaN(Number(secondArg))) {
        pailNumber = secondArg;
      }
    }

    const content: string[] = [
      `Account ${formatAddress(callerAddress || sourceAccount || 'unknown')} triggered a ${extractedFunctionName} for the farmer ${farmerAddress ? formatAddress(farmerAddress) : 'unknown'}`
    ];

    if (pailNumber) {
      content.push(`using Pail #${pailNumber.replace(/,/g, '')}.`);
    }

    steps.push({
      emoji: '🚀',
      title: `${extractedFunctionName.charAt(0).toUpperCase() + extractedFunctionName.slice(1)} request started`,
      content,
    });
  }

  const addPhaseHeader = (emoji: string, title: string, description: string) => {
    steps.push({
      emoji,
      title,
      content: [],
      isPhaseHeader: true,
      phaseTitle: title,
      phaseEmoji: emoji,
      phaseDescription: description,
    });
  };

  // First process diagnostic events (fn_call only, skip fn_return)
  const diagnosticEvents = filteredEvents.filter((event: any) => {
    const topics = event.topics || [];
    const eventType = topics[0];
    return eventType === 'fn_call' || eventType === 'burn';
  });

  // DEBUG: Log the first few diagnostic events to understand their structure
  diagnosticEvents.forEach((event: any, idx: number) => {
  });

  // Then add mint/transfer from asset_balance_changes at the END
  const assetEvents: any[] = [];
  if (assetBalanceChanges && assetBalanceChanges.length > 0) {
    assetBalanceChanges.forEach((change: any) => {
      if (change.type === 'mint' || change.type === 'transfer' || change.type === 'credit') {
        assetEvents.push({
          type: change.type,
          topics: [change.type],
          data: change.amount,
          contractId: change.asset_code || 'Token',
          to: change.to,
          from: change.from,
          asset_code: change.asset_code,
          asset_issuer: change.asset_issuer
        });
      }
    });
  }

  // Process all events in order: diagnostic events first, then asset events
  const allEventsInOrder = [...diagnosticEvents, ...assetEvents];

  allEventsInOrder.forEach((event, eventIdx) => {
    const topics = event.topics || [];
    const data = event.data;
    const eventType = topics[0];

    if (eventType === 'fn_call') {
      // For fn_call diagnostic events:
      // - topics[0] = 'fn_call'
      // - topics[1] = contract being called (the target contract) - MAY BE BASE64 ENCODED
      // - topics[2] = function name
      // - topics[3+] = argument names
      // - data = array of argument values

      const targetContractRaw = topics[1]; // The contract being called (may be base64)
      const targetContract = decodeContractId(targetContractRaw); // Decode to Stellar format
      const functionName = topics[2] || 'unknown';
      const args = Array.isArray(data) ? data : [];

      if ((functionName.includes('harvest') || functionName.includes('claim')) && currentPhase !== 'calculation') {
        currentPhase = 'calculation';
        addPhaseHeader('🔍', 'CALCULATION PHASE', '(Several contracts re-calculate the reward to confirm consistency)');
      }

      const content: string[] = [];

      // Extract argument names from topics
      const argNames: string[] = [];
      if (topics.length > 3) {
        // Topics: [event_type, caller/contract, function_name, ...arg_names]
        for (let i = 3; i < topics.length && i < 3 + args.length; i++) {
          const argName = topics[i];
          if (argName && typeof argName === 'string') {
            argNames.push(argName);
          }
        }
      }

      // Use the decoded target contract for display
      const targetContractShort = targetContract && targetContract.length > 12
        ? `${targetContract.substring(0, 6)}...${targetContract.substring(targetContract.length - 6)}`
        : 'unknown';

      args.forEach((arg, idx) => {
        const formatted = formatValue(arg);
        if (formatted) {
          const displayValue = formatted.length > 50 ? formatAddress(formatted) : formatted;
          const label = argNames[idx] || `Input ${idx + 1}`;
          content.push(`${label}: ${displayValue}`);
        }
      });

      steps.push({
        emoji: '📞',
        title: `Contract ${targetContractShort} called ${functionName}`,
        content,
      });
    } else if (eventType === 'mint') {
      if (currentPhase !== 'minting') {
        currentPhase = 'minting';
        addPhaseHeader('🪙', 'TOKEN MINTING PHASE', '(The raw reward number is converted into the actual token)');
      }

      // Check if this is from asset_balance_changes (has already formatted amount)
      let rawAmount = '';
      let formattedAmount = '';
      let tokenCode = event.asset_code || 'tokens';

      if (typeof data === 'string' && !data.match(/^\d+$/)) {
        // Already formatted (from asset_balance_changes)
        formattedAmount = data;
      } else {
        // Raw amount, needs formatting
        const amount = formatValue(data);
        rawAmount = amount;
        const { formatted } = formatAmount(amount);
        formattedAmount = formatted;
      }

      const content: string[] = [
        `Minted: ${rawAmount} units`,
        `Converted into: ${formattedAmount} ${tokenCode}`,
        `(${tokenCode} uses 7 decimals)`
      ];

      steps.push({
        emoji: '🪙',
        title: `${tokenCode} contract (${tokenCode} Token Contract) mints ${formattedAmount} ${tokenCode}`,
        content,
      });
    } else if (eventType === 'transfer' || eventType === 'credit') {
      if (currentPhase !== 'crediting') {
        currentPhase = 'crediting';
        addPhaseHeader('💰', 'CREDITING PHASE', '(Tokens are transferred to your wallet)');
      }

      // Check if this is from asset_balance_changes (has already formatted amount)
      let formattedAmount = '';
      let tokenCode = event.asset_code || 'tokens';
      let recipient = event.to ? formatAddress(event.to) : 'wallet';

      if (typeof data === 'string' && !data.match(/^\d+$/)) {
        // Already formatted (from asset_balance_changes)
        formattedAmount = data;
      } else {
        // Raw amount, needs formatting
        const amount = formatValue(data);
        const { formatted } = formatAmount(amount);
        formattedAmount = formatted;
      }

      const content: string[] = [
        `Action: mint`,
        `To: ${recipient}`,
        `Token: ${tokenCode}`,
        `Issuer: ${event.asset_issuer ? formatAddress(event.asset_issuer) : 'N/A'}`,
        `Amount: ${formattedAmount} ${tokenCode}`
      ];

      steps.push({
        emoji: '📣',
        title: `The ${tokenCode} token contract broadcasts the mint event`,
        content,
      });
    } else if (eventType === 'burn') {
      if (currentPhase !== 'cleanup') {
        currentPhase = 'cleanup';
        addPhaseHeader('🧹', 'CLEANUP PHASE', '(Temporary data is cleared for next use)');
      }

      const targetContract = decodeContractId(event.contractId);
      const contractShort = targetContract && targetContract.length > 12
        ? `${targetContract.substring(0, 6)}...${targetContract.substring(targetContract.length - 6)}`
        : 'unknown';

      const content: string[] = [
        'This simply resets the data so it can be used again later.'
      ];

      steps.push({
        emoji: '🧹',
        title: `Contract ${contractShort} removes temporary data`,
        content,
      });
    } else {
      const content: string[] = [`${eventType} event occurred`, ''];

      if (Array.isArray(data) && data.length > 0) {
        data.forEach((item, idx) => {
          const formatted = formatValue(item);
          if (formatted) {
            const displayValue = formatted.length > 50 ? formatAddress(formatted) : formatted;
            content.push(`Data ${idx + 1}: ${displayValue}`);
          }
        });
      }

      steps.push({
        emoji: 'ℹ️',
        title: `${eventType} event`,
        content,
      });
    }
  });

  const content = (
    <>
      {isModal && (
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-teal-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">🌿 Full Transaction Flow</h2>
            <p className="text-sm text-gray-600 mt-1">Human-readable, step-by-step breakdown</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/80 transition-colors text-gray-600 hover:text-gray-900"
          >
            <X size={24} />
          </button>
        </div>
      )}

      {!isModal && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">🌿 Full Transaction Flow</h2>
          <p className="text-sm text-gray-600 mt-1">Human-readable, step-by-step breakdown</p>
        </div>
      )}

      <div className={isModal ? "flex-1 overflow-y-auto p-8 bg-gradient-to-b from-gray-50 to-white" : ""}>
          {steps.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-lg font-medium text-gray-500">No events to display</p>
            </div>
          ) : (
            <div className="space-y-6 max-w-3xl mx-auto">
              {steps.map((step, index) => (
                <React.Fragment key={index}>
                  {step.isPhaseHeader ? (
                    <div className="my-8">
                      <div className="bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl p-5 border-l-4 border-blue-600">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                          {step.phaseEmoji} {step.phaseTitle}
                        </h3>
                        <p className="text-sm text-gray-700 italic">{step.phaseDescription}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border-2 border-gray-300 shadow-md hover:shadow-lg transition-all">
                      <div className="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl border-b-2 border-gray-300">
                        <div className="flex items-start gap-3">
                          <span className="text-3xl">{step.emoji}</span>
                          <h4 className="text-lg font-bold text-gray-900 pt-1">{step.title}</h4>
                        </div>
                      </div>

                      <div className="p-5">
                        {step.content.map((line, idx) => (
                          <div key={idx}>
                            {line === '' ? (
                              <div className="h-3" />
                            ) : (
                              <p className="text-gray-800 leading-relaxed">{line}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}

              <div className="mt-10 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-300 text-center">
                <div className="text-5xl mb-3">✅</div>
                <p className="text-xl font-bold text-gray-900">Transaction Completed Successfully</p>
                <p className="text-sm text-gray-600 mt-2">All operations executed as expected</p>
              </div>
            </div>
          )}
      </div>
    </>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  return <div>{content}</div>;
}

export default function ContractEventsFlowWrapper(props: ContractEventsFlowProps) {
  return <ContractEventsFlow {...props} />;
}
