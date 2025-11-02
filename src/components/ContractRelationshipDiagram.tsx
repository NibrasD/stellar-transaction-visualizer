import React from 'react';
import { Network, GitBranch, Database, Code, Zap } from 'lucide-react';
import type { SorobanOperation } from '../types/stellar';

interface ContractRelationshipDiagramProps {
  sorobanOperations: SorobanOperation[];
}

export function ContractRelationshipDiagram({ sorobanOperations }: ContractRelationshipDiagramProps) {
  console.log('🎨 ContractRelationshipDiagram rendering with operations:', sorobanOperations);

  if (!sorobanOperations || sorobanOperations.length === 0) {
    console.log('⚠️ No sorobanOperations provided to ContractRelationshipDiagram');
    return null;
  }

  // Extract unique contracts
  const contracts = new Map<string, {
    functions: Set<string>;
    calledBy: Set<string>;
    calls: Set<string>;
  }>();

  sorobanOperations.forEach((op, idx) => {
    console.log(`🔍 Processing operation ${idx}:`, {
      contractId: op.contractId,
      functionName: op.functionName,
      hasCrossContractCalls: !!op.crossContractCalls
    });

    const contractId = op.contractId;

    // Skip operations without valid contract IDs
    if (!contractId || contractId === 'Unknown Contract' || contractId.startsWith('Non_Contract')) {
      console.log(`⚠️ Skipping operation ${idx} - invalid contract ID:`, contractId);
      return;
    }

    if (!contracts.has(contractId)) {
      contracts.set(contractId, {
        functions: new Set(),
        calledBy: new Set(),
        calls: new Set(),
      });
    }

    const contract = contracts.get(contractId)!;
    if (op.functionName) {
      contract.functions.add(op.functionName);
    }

    // Track cross-contract calls
    if (op.crossContractCalls) {
      op.crossContractCalls.forEach(call => {
        const fromContract = contracts.get(call.fromContract);
        const toContract = contracts.get(call.toContract);

        if (fromContract) {
          fromContract.calls.add(call.toContract);
        }
        if (toContract) {
          toContract.calledBy.add(call.fromContract);
        }
      });
    }
  });

  const contractList = Array.from(contracts.entries());
  const hasCrossContractCalls = contractList.some(([_, data]) =>
    data.calls.size > 0 || data.calledBy.size > 0
  );

  console.log('📊 Contract summary:', {
    totalContracts: contractList.length,
    hasCrossContractCalls,
    contracts: contractList.map(([id, data]) => ({
      id: id.substring(0, 10),
      functions: Array.from(data.functions),
      calls: Array.from(data.calls).length,
      calledBy: Array.from(data.calledBy).length
    }))
  });

  // If no valid contracts found, show a message
  if (contractList.length === 0) {
    return (
      <div className="bg-yellow-50 rounded-xl p-6 border-2 border-yellow-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-600 rounded-lg">
            <Network className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-yellow-900">Contract Information Unavailable</h3>
            <p className="text-sm text-yellow-700">
              This transaction contains Soroban operations, but contract details could not be extracted from the XDR data.
              This is common for older transactions or when viewing on mainnet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatContractId = (id: string) => {
    if (id === 'System') return 'System';
    return `${id.substring(0, 6)}...${id.substring(id.length - 6)}`;
  };

  const formatAccountId = (id: string) => {
    if (!id || id.length < 10) return id;
    return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
  };

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'number') {
      return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    if (typeof val === 'string') {
      if (val.length > 20 && (val.startsWith('G') || val.startsWith('C'))) {
        return formatAccountId(val);
      }
      return val;
    }
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  };

  return (
    <div className="space-y-4">
      {/* Compact Operation List */}
      <div className="bg-white rounded-xl p-4 border-2 border-blue-200 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Code className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-blue-900">Operations Summary</h3>
            <p className="text-xs text-blue-700">{sorobanOperations.length} operation{sorobanOperations.length !== 1 ? 's' : ''} in this transaction</p>
          </div>
        </div>

        <div className="space-y-2">
          {sorobanOperations.map((op, idx) => {
            const caller = op.auth && op.auth[0]?.credentials?.address
              ? formatAccountId(op.auth[0].credentials.address)
              : 'Unknown';
            const contract = formatContractId(op.contractId);
            const func = op.functionName || 'unknown';
            const args = op.args || [];

            // Format arguments display
            const argsDisplay = args.map((arg, i) => {
              const formatted = formatValue(arg);
              return formatted;
            }).filter(a => a).join(', ');

            return (
              <div key={idx} className="p-3 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border border-blue-200 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full text-xs font-bold flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 break-words">
                      <span className="font-semibold text-blue-700">{caller}</span>
                      {' invoked contract '}
                      <span className="font-mono text-purple-700">{contract}</span>
                      {' '}
                      <span className="font-medium text-green-700">{func}</span>
                      {argsDisplay && (
                        <span className="text-gray-600">
                          ({argsDisplay})
                        </span>
                      )}
                    </p>
                    {op.result && (
                      <p className="text-xs text-gray-600 mt-1">
                        Result: {formatValue(op.result)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 rounded-xl p-6 border-2 border-blue-200 shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-600 rounded-lg">
          <Network className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-blue-900">Contract Relationship Map</h3>
          <p className="text-sm text-blue-700">Visual overview of contract interactions in this transaction</p>
        </div>
      </div>

      {/* Contract Nodes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {contractList.map(([contractId, data], idx) => (
          <div
            key={idx}
            className={`relative p-4 rounded-xl border-2 shadow-md transition-all hover:shadow-xl ${
              data.calls.size > 0 || data.calledBy.size > 0
                ? 'bg-gradient-to-br from-purple-100 to-pink-100 border-purple-400'
                : 'bg-white border-blue-300'
            }`}
          >
            {/* Contract Header */}
            <div className="flex items-start gap-3 mb-3">
              <div className={`p-2 rounded-lg ${
                data.calls.size > 0 || data.calledBy.size > 0
                  ? 'bg-purple-600'
                  : 'bg-blue-600'
              }`}>
                <Code className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-600 mb-1">Contract {idx + 1}</p>
                <p className="font-mono text-xs text-gray-800 break-all leading-tight">
                  {formatContractId(contractId)}
                </p>
              </div>
            </div>

            {/* Functions */}
            {data.functions.size > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1 mb-2">
                  <Zap className="w-3 h-3 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-900">Functions</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(data.functions).map((fn, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-medium border border-amber-300"
                    >
                      {fn}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Cross-Contract Calls */}
            {(data.calls.size > 0 || data.calledBy.size > 0) && (
              <div className="space-y-2 pt-2 border-t border-gray-200">
                {data.calls.size > 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <GitBranch className="w-3 h-3 text-green-600" />
                      <p className="text-xs font-semibold text-green-900">Calls</p>
                    </div>
                    <div className="text-xs text-green-700 space-y-0.5">
                      {Array.from(data.calls).map((called, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span className="text-green-500">→</span>
                          <span className="font-mono">{formatContractId(called)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.calledBy.size > 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <GitBranch className="w-3 h-3 text-blue-600 rotate-180" />
                      <p className="text-xs font-semibold text-blue-900">Called By</p>
                    </div>
                    <div className="text-xs text-blue-700 space-y-0.5">
                      {Array.from(data.calledBy).map((caller, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span className="text-blue-500">←</span>
                          <span className="font-mono">{formatContractId(caller)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Flow Diagram for Cross-Contract Calls */}
      {hasCrossContractCalls && (
        <div className="bg-white rounded-xl p-4 border-2 border-purple-200">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-5 h-5 text-purple-600" />
            <h4 className="font-bold text-purple-900">Execution Flow</h4>
          </div>
          <div className="space-y-2">
            {sorobanOperations.map((op, idx) => {
              if (!op.crossContractCalls || op.crossContractCalls.length === 0) {
                return (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900">
                        {formatContractId(op.contractId)}
                      </p>
                      <p className="text-xs text-blue-700">
                        {op.functionName}
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-6 h-6 bg-purple-600 text-white rounded-full text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-purple-900">
                        {formatContractId(op.contractId)}
                      </p>
                      <p className="text-xs text-purple-700">
                        {op.functionName}
                      </p>
                    </div>
                  </div>
                  <div className="ml-9 space-y-1 pl-4 border-l-2 border-purple-300">
                    {op.crossContractCalls.map((call, callIdx) => (
                      <div key={callIdx} className="flex items-center gap-2 text-xs">
                        <span className="text-purple-500">↳</span>
                        <div className="flex items-center gap-1 flex-1">
                          <span className="font-mono text-purple-700">
                            {formatContractId(call.fromContract)}
                          </span>
                          <span className="text-purple-400">→</span>
                          <span className="font-mono text-purple-800 font-medium">
                            {formatContractId(call.toContract)}
                          </span>
                          {call.functionName && (
                            <span className="text-purple-600 font-medium">
                              .{call.functionName}()
                            </span>
                          )}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          call.success
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {call.success ? 'OK' : 'FAIL'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-blue-200">
          <p className="text-xs font-semibold text-blue-900 mb-2">Legend</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-600"></div>
              <span className="text-xs text-gray-700">Direct Call</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-purple-600"></div>
              <span className="text-xs text-gray-700">Cross-Contract</span>
            </div>
            <div className="flex items-center gap-2">
              <GitBranch className="w-3 h-3 text-green-600" />
              <span className="text-xs text-gray-700">Outgoing Calls</span>
            </div>
            <div className="flex items-center gap-2">
              <GitBranch className="w-3 h-3 text-blue-600 rotate-180" />
              <span className="text-xs text-gray-700">Incoming Calls</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
