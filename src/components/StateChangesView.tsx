import React from 'react';
import { Database, Plus, Edit3, Trash2, Clock, HardDrive, Box } from 'lucide-react';
import { CopyButton } from './CopyButton';
import type { SorobanOperation, StateChange } from '../types/stellar';

interface StateChangesViewProps {
  sorobanOperations?: SorobanOperation[];
  allStateChanges?: StateChange[];
}

export function StateChangesView({ sorobanOperations, allStateChanges: providedStateChanges }: StateChangesViewProps) {
  // Use provided allStateChanges if available, otherwise extract from sorobanOperations
  const allStateChanges = providedStateChanges || sorobanOperations?.flatMap((op, opIndex) => {
    if (!op.stateChanges || op.stateChanges.length === 0) {
      return [];
    }

    return op.stateChanges.map(change => ({
      ...change,
      operationIndex: opIndex,
      contractId: change.contractId || op.contractId,
      functionName: op.functionName
    }));
  }) || [];

  if (allStateChanges.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">No state changes found in this transaction</p>
        <p className="text-sm text-gray-500 mt-1">
          This transaction did not modify any contract storage
        </p>
      </div>
    );
  }

  // Group by storage type
  const groupedByStorageType = {
    temporary: allStateChanges.filter(c => c.storageType === 'temporary' && c.keyDisplay !== '<LedgerKeyContractInstance>'),
    persistent: allStateChanges.filter(c => c.storageType === 'persistent' && c.keyDisplay !== '<LedgerKeyContractInstance>'),
    instance: allStateChanges.filter(c => c.storageType === 'instance' || c.keyDisplay === '<LedgerKeyContractInstance>')
  };

  const getActionIcon = (type: string) => {
    if (type === 'created' || type === 'restored') {
      return <Plus className="w-4 h-4 text-green-600" />;
    }
    if (type === 'updated') {
      return <Edit3 className="w-4 h-4 text-blue-600" />;
    }
    if (type === 'removed') {
      return <Trash2 className="w-4 h-4 text-red-600" />;
    }
    return <Database className="w-4 h-4 text-gray-600" />;
  };

  const getActionColor = (type: string) => {
    if (type === 'created' || type === 'restored') {
      return 'border-l-green-500 bg-green-50';
    }
    if (type === 'updated') {
      return 'border-l-blue-500 bg-blue-50';
    }
    if (type === 'removed') {
      return 'border-l-red-500 bg-red-50';
    }
    return 'border-l-gray-500 bg-gray-50';
  };

  const getStorageIcon = (type: string) => {
    if (type === 'temporary') {
      return <Clock className="w-5 h-5 text-amber-600" />;
    }
    if (type === 'persistent') {
      return <HardDrive className="w-5 h-5 text-purple-600" />;
    }
    if (type === 'instance') {
      return <Box className="w-5 h-5 text-blue-600" />;
    }
    return <Database className="w-5 h-5 text-gray-600" />;
  };

  const shortenId = (id: string) => {
    if (!id || id.length < 12) return id;
    return `${id.substring(0, 4)}…${id.substring(id.length - 4)}`;
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, (key, val) =>
          typeof val === 'bigint' ? val.toString() : val
        , 2);
      } catch (e) {
        return String(value);
      }
    }
    return String(value);
  };

  const renderStateChangeCard = (change: any, index: number) => {
    const actionType = change.type || 'updated';
    const isUpdated = actionType === 'updated';
    const isRemoved = actionType === 'removed';
    const isContractInstance = (typeof change.key === 'string' && change.key === 'ContractInstance') ||
                               change.keyDisplay === '<LedgerKeyContractInstance>';
    const isTrustline = change.ledgerEntryType === 'trustLine';

    // Use properly formatted display values (with type annotations like u64, bool, etc.)
    const afterValue = change.afterDisplay || change.valueDisplay;
    const beforeValue = change.beforeDisplay;
    const hasAfterValue = afterValue && afterValue !== '()';
    const hasBeforeValue = beforeValue && beforeValue !== '()';

    return (
      <div
        key={index}
        className={`border-l-4 rounded-lg p-4 ${getActionColor(actionType)} shadow-sm hover:shadow-md transition-shadow`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            {getActionIcon(actionType)}
          </div>
          <div className="flex-1 min-w-0">
            {/* Header with action type */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                actionType === 'created' || actionType === 'restored' ? 'bg-green-100 text-green-800 border border-green-200' :
                actionType === 'updated' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                actionType === 'removed' ? 'bg-red-100 text-red-800 border border-red-200' :
                'bg-gray-100 text-gray-800 border border-gray-200'
              }`}>
                {actionType.toUpperCase()}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-300">
                #{index + 1}
              </span>
            </div>

            {/* Contract ID or Account ID */}
            {change.contractId && (
              <div className="mb-3 p-2 bg-white rounded border border-gray-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-1">{isTrustline ? 'Account ID:' : 'Contract ID:'}</p>
                    <p className="font-mono text-sm text-gray-900 break-all select-all cursor-pointer hover:bg-gray-50 transition-colors">
                      {change.contractId}
                    </p>
                  </div>
                  <CopyButton text={change.contractId} />
                </div>
              </div>
            )}

            {/* Trustline Asset Info */}
            {isTrustline && change.data && (
              <div className="mb-3 p-2 bg-emerald-50 rounded border border-emerald-200">
                <p className="text-xs font-medium text-emerald-700 mb-2">Asset:</p>
                <div className="space-y-1">
                  <p className="font-mono text-sm text-emerald-900">
                    <span className="font-semibold">Code:</span> {change.data.assetCode}
                  </p>
                  <p className="font-mono text-xs text-emerald-800 break-all">
                    <span className="font-semibold">Issuer:</span> {change.data.assetIssuer}
                  </p>
                </div>
              </div>
            )}

            {/* Storage Key */}
            {change.keyDisplay && !isContractInstance && !isTrustline && (
              <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs font-medium text-blue-700 mb-1">Storage Key:</p>
                <p className="font-mono text-sm text-blue-900 break-all">{change.keyDisplay}</p>
              </div>
            )}

            {isContractInstance && (
              <div className="mb-3 p-2 bg-indigo-50 rounded border border-indigo-200">
                <p className="text-xs font-medium text-indigo-700">Contract Instance Metadata</p>
              </div>
            )}

            {/* Before Value (for updated entries) */}
            {isUpdated && hasBeforeValue && !isTrustline && (
              <div className="p-3 bg-amber-50 rounded border border-amber-200 mb-3">
                <p className="text-xs font-medium text-amber-700 mb-2">Previous Value:</p>
                <pre className="font-mono text-sm text-gray-900 whitespace-pre-wrap break-all bg-white p-3 rounded border border-amber-300">
                  {beforeValue}
                </pre>
              </div>
            )}

            {/* After Value (for created/updated entries) */}
            {hasAfterValue && !isRemoved && !isTrustline && (
              <div className="p-3 bg-white rounded border border-gray-200">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  {actionType === 'created' || actionType === 'restored' ? 'Initial Value:' : 'New Value:'}
                </p>
                <pre className="font-mono text-sm text-gray-900 whitespace-pre-wrap break-all bg-gray-50 p-3 rounded">
                  {afterValue}
                </pre>
              </div>
            )}

            {/* Trustline Balance Display */}
            {isTrustline && (isUpdated || actionType === 'created') && (
              <div className="space-y-3">
                {isUpdated && change.before?.balance && (
                  <div className="p-3 bg-amber-50 rounded border border-amber-200">
                    <p className="text-xs font-medium text-amber-700 mb-2">Previous Balance:</p>
                    <p className="font-mono text-lg text-gray-900">
                      {(BigInt(change.before.balance) / BigInt(10000000)).toString()}.
                      {(BigInt(change.before.balance) % BigInt(10000000)).toString().padStart(7, '0')}
                      <span className="text-sm text-gray-600 ml-2">{change.data.assetCode}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">({change.before.balance} stroops)</p>
                  </div>
                )}
                {change.data?.balance && (
                  <div className="p-3 bg-white rounded border border-gray-200">
                    <p className="text-xs font-medium text-gray-700 mb-2">
                      {actionType === 'created' ? 'Initial Balance:' : 'New Balance:'}
                    </p>
                    <p className="font-mono text-lg text-gray-900">
                      {(BigInt(change.data.balance) / BigInt(10000000)).toString()}.
                      {(BigInt(change.data.balance) % BigInt(10000000)).toString().padStart(7, '0')}
                      <span className="text-sm text-gray-600 ml-2">{change.data.assetCode}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">({change.data.balance} stroops)</p>
                  </div>
                )}
                {isUpdated && change.before?.balance && change.data?.balance && (
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs font-medium text-blue-700 mb-2">Balance Change:</p>
                    <p className="font-mono text-lg text-blue-900">
                      {(() => {
                        const diff = BigInt(change.data.balance) - BigInt(change.before.balance);
                        const absDiff = diff < 0n ? -diff : diff;
                        const units = (absDiff / BigInt(10000000)).toString();
                        const fraction = (absDiff % BigInt(10000000)).toString().padStart(7, '0');
                        return `${diff < 0n ? '-' : '+'}${units}.${fraction}`;
                      })()}
                      <span className="text-sm text-blue-600 ml-2">{change.data.assetCode}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Before Value (for removed items) */}
            {isRemoved && hasBeforeValue && (
              <div className="p-3 bg-white rounded border border-gray-200">
                <p className="text-xs font-medium text-red-700 mb-2">Removed Value:</p>
                <pre className="font-mono text-sm text-gray-900 whitespace-pre-wrap break-all bg-gray-50 p-3 rounded">
                  {beforeValue}
                </pre>
              </div>
            )}

            {/* Function name if available */}
            {change.functionName && (
              <div className="mt-2 text-xs text-gray-500">
                From function: <span className="font-mono text-gray-700">{change.functionName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">State Changes</h2>
        <p className="text-sm text-gray-600">
          All storage and ledger modifications made by this transaction ({allStateChanges.length} total changes)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-600" />
            <div>
              <p className="text-xs text-amber-700 font-medium">Temporary Storage</p>
              <p className="text-2xl font-bold text-amber-900">{groupedByStorageType.temporary.length}</p>
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-2">Expires after some ledgers</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <HardDrive className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-xs text-purple-700 font-medium">Persistent Storage</p>
              <p className="text-2xl font-bold text-purple-900">{groupedByStorageType.persistent.length}</p>
            </div>
          </div>
          <p className="text-xs text-purple-600 mt-2">Permanent contract data</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Box className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-xs text-blue-700 font-medium">Instance Storage</p>
              <p className="text-2xl font-bold text-blue-900">{groupedByStorageType.instance.length}</p>
            </div>
          </div>
          <p className="text-xs text-blue-600 mt-2">Contract metadata</p>
        </div>
      </div>

      {/* Temporary Storage */}
      {groupedByStorageType.temporary.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            {getStorageIcon('temporary')}
            <h3 className="text-xl font-bold text-gray-900">Temporary Storage</h3>
            <span className="text-sm text-gray-500">({groupedByStorageType.temporary.length} changes)</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Temporary data that expires after a certain number of ledgers unless renewed
          </p>
          <div className="space-y-3">
            {groupedByStorageType.temporary.map((change, idx) => renderStateChangeCard(change, idx))}
          </div>
        </div>
      )}

      {/* Persistent Storage */}
      {groupedByStorageType.persistent.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            {getStorageIcon('persistent')}
            <h3 className="text-xl font-bold text-gray-900">Persistent Storage</h3>
            <span className="text-sm text-gray-500">({groupedByStorageType.persistent.length} changes)</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Permanent contract data that persists indefinitely
          </p>
          <div className="space-y-3">
            {groupedByStorageType.persistent.map((change, idx) => renderStateChangeCard(change, idx))}
          </div>
        </div>
      )}

      {/* Instance Storage */}
      {groupedByStorageType.instance.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            {getStorageIcon('instance')}
            <h3 className="text-xl font-bold text-gray-900">Instance Storage</h3>
            <span className="text-sm text-gray-500">({groupedByStorageType.instance.length} changes)</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Contract instance metadata and configuration
          </p>
          <div className="space-y-3">
            {groupedByStorageType.instance.map((change, idx) => renderStateChangeCard(change, idx))}
          </div>
        </div>
      )}
    </div>
  );
}
