import React from 'react';
import { Cpu, AlertTriangle, Clock, Activity, Database, ChevronDown, ChevronRight, Bug, Zap, CircleDollarSign } from 'lucide-react';
import type { SimulationResult } from '../types/stellar';

interface SimulationPanelProps {
  result: SimulationResult;
}

export function SimulationPanel({ result }: SimulationPanelProps) {
  const [showLogs, setShowLogs] = React.useState(true);
  const [showStackTrace, setShowStackTrace] = React.useState(true);
  const [showOperationBreakdown, setShowOperationBreakdown] = React.useState(true);

  console.log('🎯 SimulationPanel received result:', result);
  console.log('🎯 Enhanced debug info:', result.enhancedDebugInfo);
  console.log('🎯 Resource usage:', result.enhancedDebugInfo?.resourceUsage);
  console.log('🎯 Resource usage DETAILED:', JSON.stringify(result.enhancedDebugInfo?.resourceUsage, null, 2));
  console.log('🎯 Logs count:', result.enhancedDebugInfo?.logs?.length || 0);
  console.log('🎯 Operation breakdown count:', result.enhancedDebugInfo?.operationBreakdown?.length || 0);

  const isSingleOperation = result.enhancedDebugInfo?.operationBreakdown?.length === 1;
  const singleOpSuccess = isSingleOperation ? result.enhancedDebugInfo?.operationBreakdown[0].success : null;

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between p-2 rounded-md border ${
        isSingleOperation
          ? singleOpSuccess
            ? 'bg-green-50 border-green-300'
            : 'bg-red-50 border-red-300'
          : 'bg-white border-gray-200'
      }`}>
        <h3 className={`text-sm font-medium ${
          isSingleOperation
            ? singleOpSuccess
              ? 'text-green-700'
              : 'text-red-700'
            : 'text-gray-900'
        }`}>
          {isSingleOperation ? 'Debugger' : 'Debug Info'}
        </h3>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {result.success ? 'Success' : 'Failed'}
        </span>
      </div>

      {/* Enhanced Resource Usage */}
      {result.enhancedDebugInfo?.resourceUsage && (result.enhancedDebugInfo.resourceUsage.cpuInstructions > 0 || result.enhancedDebugInfo.resourceUsage.memoryBytes > 0) && (() => {
        // Show I/O section if we have the data fields (even if they're 0)
        const hasIO = result.enhancedDebugInfo.resourceUsage.readBytes !== undefined ||
                      result.enhancedDebugInfo.resourceUsage.writeBytes !== undefined ||
                      result.enhancedDebugInfo.resourceUsage.readLedgerEntries !== undefined ||
                      result.enhancedDebugInfo.resourceUsage.writeLedgerEntries !== undefined;

        return (
        <div className={`grid grid-cols-1 ${hasIO ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2'} gap-3`}>
          <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-medium text-blue-800">CPU</p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-blue-800 font-bold">
                  {result.enhancedDebugInfo.resourceUsage.cpuInstructions.toLocaleString()}
                </p>
              </div>
              {result.enhancedDebugInfo.resourceUsage.budgetedCpuInstructions > 0 &&
               result.enhancedDebugInfo.resourceUsage.budgetedCpuInstructions !== result.enhancedDebugInfo.resourceUsage.cpuInstructions && (
                <div className="pt-2 border-t border-blue-300">
                  <p className="text-xs text-blue-500 mb-1">Budgeted</p>
                  <p className="text-sm font-medium text-blue-600">
                    {result.enhancedDebugInfo.resourceUsage.budgetedCpuInstructions.toLocaleString()}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">
                    Saved: {(result.enhancedDebugInfo.resourceUsage.budgetedCpuInstructions - result.enhancedDebugInfo.resourceUsage.cpuInstructions).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-purple-50 rounded-md border border-purple-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Database className="w-4 h-4 text-purple-600" />
              <p className="text-xs font-medium text-purple-800">Memory</p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-purple-800 font-bold">
                  {result.enhancedDebugInfo.resourceUsage.memoryBytes > 0
                    ? `${result.enhancedDebugInfo.resourceUsage.memoryBytes.toLocaleString()} bytes`
                    : '0 bytes'}
                </p>
              </div>
              {result.enhancedDebugInfo.resourceUsage.budgetedMemoryBytes > 0 &&
               result.enhancedDebugInfo.resourceUsage.budgetedMemoryBytes !== result.enhancedDebugInfo.resourceUsage.memoryBytes && (
                <div className="pt-2 border-t border-purple-300">
                  <p className="text-xs text-purple-500 mb-1">Budgeted</p>
                  <p className="text-sm font-medium text-purple-600">
                    {result.enhancedDebugInfo.resourceUsage.budgetedMemoryBytes.toLocaleString()} bytes
                  </p>
                  <p className="text-xs text-purple-500 mt-1">
                    Saved: {(result.enhancedDebugInfo.resourceUsage.budgetedMemoryBytes - result.enhancedDebugInfo.resourceUsage.memoryBytes).toLocaleString()} bytes
                  </p>
                </div>
              )}
            </div>
          </div>

          {hasIO && (
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-5 h-5 text-amber-600" />
                <p className="text-sm font-medium text-amber-800">I/O & Performance</p>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-amber-600">Read Operations</p>
                  <p className="text-sm font-medium text-amber-700">
                    {result.enhancedDebugInfo.resourceUsage.readLedgerEntries || 0} entries
                    ({(result.enhancedDebugInfo.resourceUsage.readBytes || 0).toLocaleString()} bytes)
                  </p>
                </div>
                <div>
                  <p className="text-xs text-amber-600">Write Operations</p>
                  <p className="text-sm font-medium text-amber-700">
                    {result.enhancedDebugInfo.resourceUsage.writeLedgerEntries || 0} entries
                    ({(result.enhancedDebugInfo.resourceUsage.writeBytes || 0).toLocaleString()} bytes)
                  </p>
                </div>
                <div className="pt-2 border-t border-amber-300">
                  <p className="text-xs text-amber-600">Simulation Time</p>
                  <p className="text-sm font-medium text-amber-700">
                    {result.enhancedDebugInfo.timing.simulationTime}ms
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Basic Resource Usage (fallback) */}
      {!result.enhancedDebugInfo?.resourceUsage && (result.resourceUsage.cpuUsage > 0 || result.resourceUsage.memoryUsage > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-gray-600" />
              <p className="text-sm font-medium text-gray-700">Resource Usage</p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500">CPU Instructions</p>
                <p className="text-sm font-medium">{result.resourceUsage.cpuUsage.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Memory Usage</p>
                <p className="text-sm font-medium">{result.resourceUsage.memoryUsage.toLocaleString()} bytes</p>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Transaction Fee */}
      <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
        <div className="flex items-center gap-2 mb-2">
          <CircleDollarSign className="w-5 h-5 text-green-600" />
          <p className="text-sm font-medium text-green-800">Transaction Fee Charged</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-green-700">{result.estimatedFee} stroops</p>
          <p className="text-sm text-green-600">
            {(parseInt(result.estimatedFee) / 10000000).toFixed(7)} XLM
          </p>
        </div>
      </div>

      {/* Unified Execution Debugger */}
      {result.enhancedDebugInfo?.operationBreakdown && (
        <div className={`bg-white rounded-lg border-2 shadow-sm ${
          result.enhancedDebugInfo.operationBreakdown.length === 1
            ? result.enhancedDebugInfo.operationBreakdown[0].success
              ? 'border-green-300'
              : 'border-red-300'
            : 'border-gray-300'
        }`}>
          <div className={`p-4 ${
            result.enhancedDebugInfo.operationBreakdown.length === 1
              ? result.enhancedDebugInfo.operationBreakdown[0].success
                ? 'bg-gradient-to-r from-green-50 to-emerald-50'
                : 'bg-gradient-to-r from-red-50 to-orange-50'
              : 'bg-gradient-to-r from-blue-50 to-indigo-50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className={`w-5 h-5 ${
                  result.enhancedDebugInfo.operationBreakdown.length === 1
                    ? result.enhancedDebugInfo.operationBreakdown[0].success
                      ? 'text-green-600'
                      : 'text-red-600'
                    : 'text-blue-600'
                }`} />
                <h3 className={`text-lg font-semibold ${
                  result.enhancedDebugInfo.operationBreakdown.length === 1
                    ? result.enhancedDebugInfo.operationBreakdown[0].success
                      ? 'text-green-800'
                      : 'text-red-800'
                    : 'text-blue-800'
                }`}>
                  Execution Debugger
                </h3>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                result.enhancedDebugInfo.operationBreakdown.length === 1
                  ? result.enhancedDebugInfo.operationBreakdown[0].success
                    ? 'bg-green-200 text-green-900'
                    : 'bg-red-200 text-red-900'
                  : 'bg-blue-200 text-blue-900'
              }`}>
                {result.enhancedDebugInfo.operationBreakdown.length} {result.enhancedDebugInfo.operationBreakdown.length === 1 ? 'operation' : 'operations'}
              </span>
            </div>
          </div>

          {/* Summary Section */}
          {result.enhancedDebugInfo.operationBreakdown.map((op, index) => (
            <div key={index} className="px-4 py-3 border-t border-gray-200">
              <div className="space-y-3">
                {/* Operation Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">
                      Operation {op.operation + 1}: {op.type}
                    </span>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    op.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {op.success ? '✅ Success' : '❌ Failed'}
                  </span>
                </div>

                {/* Operation Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  {op.resourceCost?.cpuInstructions > 0 && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-600 font-medium mb-1">🖥️ CPU Instructions</p>
                      <p className="text-base font-bold text-blue-800">
                        {op.resourceCost.cpuInstructions.toLocaleString()}
                      </p>
                      {op.resourceCost.budgetedCpu && (
                        <p className="text-xs text-blue-600 mt-1">
                          budgeted: {op.resourceCost.budgetedCpu.toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {op.resourceCost?.memoryBytes > 0 && (
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-600 font-medium mb-1">💾 Memory Usage</p>
                      <p className="text-base font-bold text-purple-800">
                        {op.resourceCost.memoryBytes.toLocaleString()} bytes
                      </p>
                      {op.resourceCost.budgetedMemory && (
                        <p className="text-xs text-purple-600 mt-1">
                          budgeted: {op.resourceCost.budgetedMemory.toLocaleString()} bytes
                        </p>
                      )}
                    </div>
                  )}

                  {(op.resourceCost?.readBytes > 0 || op.resourceCost?.writeBytes > 0) && (
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                      <p className="text-xs text-amber-600 font-medium mb-1">📖 I/O Operations</p>
                      {op.resourceCost?.readBytes > 0 && (
                        <p className="text-xs text-amber-800">
                          Read: {op.resourceCost.readBytes.toLocaleString()}B
                        </p>
                      )}
                      {op.resourceCost?.writeBytes > 0 && (
                        <p className="text-xs text-amber-800">
                          Write: {op.resourceCost.writeBytes.toLocaleString()}B
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {op.error && (
                  <div className="bg-red-100 border border-red-300 p-3 rounded-lg">
                    <p className="text-sm text-red-800 font-medium">
                      ⚠️ Error: {op.error}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Debug Log Section */}
          {result.enhancedDebugInfo?.logs && result.enhancedDebugInfo.logs.length > 0 && (
            <div className="border-t border-gray-200">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Debug Log</span>
                  <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                    {result.enhancedDebugInfo.logs.length} entries
                  </span>
                </div>
                {showLogs ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {showLogs && (
                <div className="px-4 pb-4">
                  <div className="bg-gray-900 text-gray-300 p-3 rounded-lg font-mono text-xs max-h-60 overflow-y-auto">
                    {result.enhancedDebugInfo.logs.map((log, index) => (
                      <div key={index} className="mb-1 hover:bg-gray-800 px-1">
                        <span className="text-gray-500 mr-2">[{index + 1}]</span>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stack Traces */}
      {result.enhancedDebugInfo?.stackTrace && result.enhancedDebugInfo.stackTrace.length > 0 && (
        <div className="bg-white rounded-lg border border-red-200">
          <button
            onClick={() => setShowStackTrace(!showStackTrace)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-red-50 rounded-t-lg"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">Stack Traces</span>
              <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                {result.enhancedDebugInfo.stackTrace.length} errors
              </span>
            </div>
            {showStackTrace ? (
              <ChevronDown className="w-4 h-4 text-red-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-red-500" />
            )}
          </button>
          
          {showStackTrace && (
            <div className="px-4 pb-4 border-t border-red-100">
              <div className="space-y-3 mt-3">
                {result.enhancedDebugInfo.stackTrace.map((trace, index) => (
                  <div key={index} className="bg-red-50 p-3 rounded border-l-4 border-red-400">
                    <p className="text-sm font-medium text-red-800 mb-2">
                      {trace.operation !== undefined ? `Operation ${trace.operation + 1}` : trace.phase} Error
                    </p>
                    <p className="text-xs text-red-600 mb-2">{trace.error}</p>
                    {trace.stack && (
                      <pre className="text-xs bg-red-100 p-2 rounded overflow-x-auto max-h-32 text-red-700">
                        {trace.stack}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result.potentialErrors.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-medium text-gray-700">
              {result.success ? 'Potential Issues' : 'Errors'}
            </p>
          </div>
          <ul className="space-y-2">
            {result.potentialErrors.map((error, index) => (
              <li key={index} className={`text-sm p-2 rounded ${
                result.success ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
              }`}>
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}