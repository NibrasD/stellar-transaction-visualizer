import React from 'react';
import { ArrowRight, Code, Zap, AlertCircle, CheckCircle } from 'lucide-react';

interface ContractCall {
  fromContract: string;
  toContract: string;
  functionName?: string;
  success?: boolean;
}

interface ContractFlowDiagramProps {
  contractCalls: ContractCall[];
  mainContractId?: string;
}

export function ContractFlowDiagram({ contractCalls, mainContractId }: ContractFlowDiagramProps) {
  if (!contractCalls || contractCalls.length === 0) {
    return null;
  }

  // Extract unique contracts
  const contracts = new Set<string>();
  contractCalls.forEach(call => {
    contracts.add(call.fromContract);
    contracts.add(call.toContract);
  });

  const contractList = Array.from(contracts);

  const formatContractId = (id: string) => {
    if (id === 'System') return 'System';
    return `${id.substring(0, 6)}...${id.substring(id.length - 6)}`;
  };

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-6 rounded-lg border-2 border-purple-200">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-purple-900">Cross-Contract Call Flow</h3>
      </div>

      {/* Contract boxes */}
      <div className="flex flex-wrap gap-4 mb-6">
        {contractList.map((contractId, idx) => (
          <div
            key={idx}
            className={`px-4 py-3 rounded-lg border-2 ${
              contractId === mainContractId
                ? 'bg-purple-100 border-purple-400'
                : 'bg-white border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-gray-600" />
              <div>
                <p className="text-xs text-gray-500 font-medium">
                  {contractId === mainContractId ? 'Main Contract' : 'Contract'}
                </p>
                <p className="font-mono text-sm text-gray-800">
                  {formatContractId(contractId)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Call flow */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700 mb-2">Call Sequence:</p>
        {contractCalls.map((call, idx) => (
          <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200">
            <span className="text-xs font-bold text-gray-400 min-w-[20px]">{idx + 1}</span>

            {/* From contract */}
            <div className="px-3 py-1 bg-blue-50 rounded border border-blue-200">
              <p className="font-mono text-xs text-blue-800">
                {formatContractId(call.fromContract)}
              </p>
            </div>

            {/* Arrow */}
            <div className="flex items-center gap-1">
              <ArrowRight className="w-4 h-4 text-gray-400" />
              {call.functionName && (
                <span className="text-xs text-gray-600 font-medium px-2 py-0.5 bg-gray-100 rounded">
                  {call.functionName}
                </span>
              )}
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </div>

            {/* To contract */}
            <div className="px-3 py-1 bg-green-50 rounded border border-green-200">
              <p className="font-mono text-xs text-green-800">
                {formatContractId(call.toContract)}
              </p>
            </div>

            {/* Status indicator */}
            {call.success !== undefined && (
              <div className="ml-auto">
                {call.success ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-xs text-blue-800">
          <span className="font-semibold">Cross-Contract Calls:</span> When a contract calls
          another contract, it can execute functions and access data from the called contract.
          This enables complex DeFi operations and composability.
        </p>
      </div>
    </div>
  );
}
