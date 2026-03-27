import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { TransactionSearch } from './TransactionSearch';
import { TransactionFlow } from './TransactionFlow';
import { SimulationPanel } from './SimulationPanel';
import { TransactionDetailsPanel } from './TransactionDetails';
import { AccountEffects } from './AccountEffects';
import { StateChangesView } from './StateChangesView';
import { UserOperationFlow } from './UserOperationFlow';
import {
  fetchTransaction,
  createOperationNodes,
  createOperationEdges,
} from '../services/stellar';
import type { TransactionDetails, NetworkConfig } from '../types/stellar';

interface TransactionPageProps {
  networkConfig: NetworkConfig;
}

export function TransactionPage({ networkConfig }: TransactionPageProps) {
  const { hash, tab } = useParams<{ hash?: string; tab?: string }>();
  const navigate = useNavigate();
  const network = networkConfig.isTestnet ? 'testnet' : 'mainnet';

  const [isLoading, setIsLoading] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flowNodes, setFlowNodes] = useState<any[]>([]);

  const activeTab = tab || 'details';

  // Auto-fetch transaction when hash is present in URL
  useEffect(() => {
    if (hash) {
      handleSearch(hash);
    } else {
      setSelectedTransaction(null);
      setError(null);
    }
  }, [hash]);

  const handleSearch = async (value: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const txData = await fetchTransaction(value);
      setSelectedTransaction(txData);

      // If we searched from the search box, navigate to the tx URL
      if (!hash || hash !== value) {
        navigate(`/${network}/tx/${value}`, { replace: !hash });
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch transaction data. Please try again.';
      setError(errorMessage);
      setSelectedTransaction(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchFromInput = (value: string) => {
    // Navigate to the tx URL, which will trigger the useEffect to fetch
    navigate(`/${network}/tx/${value}`);
  };

  // Create flow nodes
  useEffect(() => {
    if (selectedTransaction) {
      createOperationNodes(selectedTransaction).then(nodes => {
        setFlowNodes(nodes);
      });
    } else {
      setFlowNodes([]);
    }
  }, [selectedTransaction]);

  const flowEdges = useMemo(() => {
    return selectedTransaction ? createOperationEdges(selectedTransaction) : [];
  }, [selectedTransaction]);

  const handleTabChange = (newTab: string) => {
    if (hash) {
      navigate(`/${network}/tx/${hash}/${newTab}`);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">Search Transaction</h2>
        <TransactionSearch onSearch={handleSearchFromInput} isLoading={isLoading} />
        {error && (
          <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-1">Transaction Not Found</h3>
                <p className="text-sm text-red-700">{error}</p>
                {error.includes('switch networks') && (
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    💡 Use the network selector above to switch between Mainnet and Testnet.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-[400px] bg-white rounded-xl shadow-lg border border-gray-100 mt-6">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Fetching transaction data...</p>
          </div>
        </div>
      )}

      {!isLoading && selectedTransaction && (
        <div className="mt-6">
          <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <Tabs.List className="flex space-x-2 border-b border-gray-200 bg-gray-50 rounded-t-lg px-4">
              <Tabs.Trigger
                value="details"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600"
              >
                Transaction Details
              </Tabs.Trigger>
              {(!selectedTransaction.sorobanOperations || selectedTransaction.sorobanOperations.length === 0) && (
                <Tabs.Trigger
                  value="flow"
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600"
                >
                  Operation Flow
                </Tabs.Trigger>
              )}
              <Tabs.Trigger
                value="account-effects"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600"
              >
                Account Effects
              </Tabs.Trigger>
              {selectedTransaction.allStateChanges && selectedTransaction.allStateChanges.length > 0 && (
                <Tabs.Trigger
                  value="state-changes"
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600"
                >
                  State Changes ({selectedTransaction.allStateChanges.length})
                </Tabs.Trigger>
              )}
              {selectedTransaction.sorobanOperations && selectedTransaction.sorobanOperations.length > 0 && (
                <Tabs.Trigger
                  value="user-flow"
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600"
                >
                  Operations Flow for Users
                </Tabs.Trigger>
              )}
              {selectedTransaction.sorobanOperations && selectedTransaction.sorobanOperations.length > 0 && selectedTransaction.simulationResult && (
                <Tabs.Trigger
                  value="simulation"
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600"
                >
                  Soroban Debug Info
                </Tabs.Trigger>
              )}
            </Tabs.List>

            <Tabs.Content value="details">
              <TransactionDetailsPanel
                transaction={selectedTransaction}
                networkConfig={networkConfig}
              />
            </Tabs.Content>

            {(!selectedTransaction.sorobanOperations || selectedTransaction.sorobanOperations.length === 0) && (
              <Tabs.Content value="flow">
                <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                  <h2 className="text-xl font-semibold mb-4">
                    Operation Flow
                  </h2>
                  <TransactionFlow
                    nodes={flowNodes}
                    edges={flowEdges}
                    effects={selectedTransaction.effects || []}
                    sorobanOperations={selectedTransaction.sorobanOperations || []}
                    simulationResult={selectedTransaction.simulationResult}
                  />
                </div>
              </Tabs.Content>
            )}

            <Tabs.Content value="account-effects">
              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                <AccountEffects
                  details={selectedTransaction}
                  sorobanOperations={selectedTransaction.sorobanOperations}
                />
              </div>
            </Tabs.Content>

            {selectedTransaction.allStateChanges && selectedTransaction.allStateChanges.length > 0 && (
              <Tabs.Content value="state-changes">
                <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                  <StateChangesView allStateChanges={selectedTransaction.allStateChanges} />
                </div>
              </Tabs.Content>
            )}

            {selectedTransaction.sorobanOperations && selectedTransaction.sorobanOperations.length > 0 && (
              <Tabs.Content value="user-flow">
                <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                  <h2 className="text-xl font-semibold mb-4">Operations Flow for Users</h2>
                  <UserOperationFlow
                    events={selectedTransaction.sorobanOperations[0]?.events || []}
                    sourceAccount={selectedTransaction.sourceAccount}
                    functionName={selectedTransaction.sorobanOperations[0]?.functionName}
                    assetBalanceChanges={selectedTransaction.operations?.[0]?.asset_balance_changes || []}
                    effects={selectedTransaction.effects || []}
                    networkConfig={networkConfig}
                  />
                </div>
              </Tabs.Content>
            )}

            {selectedTransaction.sorobanOperations && selectedTransaction.sorobanOperations.length > 0 && selectedTransaction.simulationResult && (
              <Tabs.Content value="simulation">
                <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                  <SimulationPanel result={selectedTransaction.simulationResult} />
                </div>
              </Tabs.Content>
            )}
          </Tabs.Root>
        </div>
      )}
    </>
  );
}
