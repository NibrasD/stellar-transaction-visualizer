// Example: React Integration - Production-Ready Patterns
// This demonstrates best practices for using the SDK in React applications

import React, { useState, useEffect, useMemo } from 'react';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';
import type { TransactionDetails, SorobanOperation } from '@nibrasd/transaction-visualizer';

// ✅ CORRECT: Custom hook using useMemo (not useState)
function useTransactionAnalyzer(isTestnet: boolean = true) {
  // ✅ useMemo re-creates visualizer when isTestnet changes
  const visualizer = useMemo(
    () => new StellarTransactionVisualizer({
      isTestnet,
      networkUrl: isTestnet
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org',
      networkPassphrase: isTestnet
        ? 'Test SDF Network ; September 2015'
        : 'Public Global Stellar Network ; September 2015'
    }),
    [isTestnet] // ✅ Dependency array ensures re-creation on network change
  );

  return visualizer;
}

// Example 1: Transaction Details Component with Proper Cleanup
export function TransactionDetailsCard({
  txHash,
  isTestnet = true
}: {
  txHash: string;
  isTestnet?: boolean;
}) {
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visualizer = useTransactionAnalyzer(isTestnet);

  useEffect(() => {
    // ✅ Cleanup flag to prevent state updates after unmount
    let cancelled = false;

    async function loadTransaction() {
      if (!txHash) return;

      setLoading(true);
      setError(null);

      try {
        const tx = await visualizer.getTransactionDetails(txHash);

        // ✅ Check if component is still mounted before updating state
        if (!cancelled) {
          setTransaction(tx);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load transaction');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTransaction();

    // ✅ Cleanup function to prevent memory leaks
    return () => {
      cancelled = true;
    };
  }, [txHash, visualizer]);

  if (loading) {
    return (
      <div className="transaction-card loading">
        <div className="spinner">Loading transaction...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="transaction-card error">
        <h3>Error Loading Transaction</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!transaction) {
    return <div className="transaction-card">No transaction data</div>;
  }

  // Convert stroops to XLM
  const feeInXLM = (parseInt(transaction.fee) / 10_000_000).toFixed(7);

  return (
    <div className="transaction-card">
      <h2>Transaction Details</h2>
      <div className="detail">
        <strong>Hash:</strong>
        <code>{transaction.hash.slice(0, 16)}...{transaction.hash.slice(-16)}</code>
      </div>
      <div className="detail">
        <strong>Status:</strong>
        <span className={`badge ${transaction.status}`}>
          {transaction.status.toUpperCase()}
        </span>
      </div>
      <div className="detail">
        <strong>Fee:</strong>
        {transaction.fee} stroops ({feeInXLM} XLM)
      </div>
      <div className="detail">
        <strong>Operations:</strong> {transaction.operations.length}
      </div>
      <div className="detail">
        <strong>Ledger:</strong> {transaction.ledger || 'Unknown'}
      </div>
      <div className="detail">
        <strong>Created:</strong>
        {transaction.ledgerTimestamp
          ? new Date(transaction.ledgerTimestamp * 1000).toLocaleString()
          : 'Unknown'
        }
      </div>
    </div>
  );
}

// Example 2: Smart Contract Operations with Error Handling
export function SmartContractOperations({
  txHash,
  isTestnet = true
}: {
  txHash: string;
  isTestnet?: boolean;
}) {
  const [operations, setOperations] = useState<SorobanOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visualizer = useTransactionAnalyzer(isTestnet);

  useEffect(() => {
    let cancelled = false;

    async function loadOperations() {
      if (!txHash) return;

      setLoading(true);
      setError(null);

      try {
        const tx = await visualizer.getTransactionDetails(txHash);
        const sorobanOps = visualizer.getSorobanOperations(tx);

        if (!cancelled) {
          setOperations(sorobanOps);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load operations');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOperations();

    return () => {
      cancelled = true;
    };
  }, [txHash, visualizer]);

  if (loading) return <div>Loading smart contract operations...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (operations.length === 0) {
    return <div>No smart contract operations found</div>;
  }

  return (
    <div className="contract-operations">
      <h3>Smart Contract Operations ({operations.length})</h3>
      {operations.map((op, index) => (
        <div key={index} className="operation">
          <h4>Operation {index + 1}</h4>
          <div><strong>Contract:</strong> <code>{op.contractId}</code></div>
          <div><strong>Function:</strong> {op.functionName || 'Unknown'}</div>

          {op.args && op.args.length > 0 && (
            <div>
              <strong>Arguments:</strong> {op.args.length}
              <pre>{JSON.stringify(op.args, null, 2)}</pre>
            </div>
          )}

          {op.events && op.events.length > 0 && (
            <div><strong>Events:</strong> {op.events.length}</div>
          )}

          {op.stateChanges && op.stateChanges.length > 0 && (
            <div><strong>State Changes:</strong> {op.stateChanges.length}</div>
          )}

          {op.resourceUsage && (
            <div className="resource-usage">
              <strong>Resource Usage:</strong>
              <ul>
                <li>CPU: {op.resourceUsage.cpuInstructions} instructions</li>
                <li>Memory: {op.resourceUsage.memoryBytes} bytes</li>
                <li>Refundable Fee: {op.resourceUsage.refundableFee} stroops</li>
                <li>Non-refundable Fee: {op.resourceUsage.nonRefundableFee} stroops</li>
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Example 3: Transaction Search with Validation
export function TransactionSearch({
  onTransactionFound,
  isTestnet = true
}: {
  onTransactionFound?: (tx: TransactionDetails) => void;
  isTestnet?: boolean;
}) {
  const [txHash, setTxHash] = useState('');
  const [result, setResult] = useState<TransactionDetails | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visualizer = useTransactionAnalyzer(isTestnet);

  const validateHash = (hash: string): boolean => {
    return /^[0-9a-f]{64}$/i.test(hash);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedHash = txHash.trim();

    if (!trimmedHash) {
      setError('Please enter a transaction hash');
      return;
    }

    if (!validateHash(trimmedHash)) {
      setError('Invalid transaction hash format (must be 64 hex characters)');
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const tx = await visualizer.getTransactionDetails(trimmedHash);
      setResult(tx);

      if (onTransactionFound) {
        onTransactionFound(tx);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      console.error('Search failed:', err);
      setError(errorMessage);
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="transaction-search">
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="Enter transaction hash (64 hex characters)"
          disabled={searching}
          className={error ? 'error' : ''}
        />
        <button type="submit" disabled={searching || !txHash.trim()}>
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="search-results">
          <h3>Transaction Found</h3>
          <div><strong>Status:</strong> {result.status}</div>
          <div><strong>Operations:</strong> {result.operations.length}</div>
          <div><strong>Fee:</strong> {result.fee} stroops ({(parseInt(result.fee) / 10_000_000).toFixed(7)} XLM)</div>
          {result.sorobanOperations && result.sorobanOperations.length > 0 && (
            <div><strong>Smart Contracts:</strong> {result.sorobanOperations.length}</div>
          )}
        </div>
      )}
    </div>
  );
}

// Example 4: Real-time Cost Monitor with Proper Calculations
export function CostMonitor({
  txHash,
  isTestnet = true
}: {
  txHash: string;
  isTestnet?: boolean;
}) {
  const [costs, setCosts] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visualizer = useTransactionAnalyzer(isTestnet);

  useEffect(() => {
    let cancelled = false;

    async function calculateCosts() {
      if (!txHash) return;

      setLoading(true);
      setError(null);

      try {
        const tx = await visualizer.getTransactionDetails(txHash);
        const sorobanOps = visualizer.getSorobanOperations(tx);

        let totalRefundable = 0;
        let totalNonRefundable = 0;
        let totalRent = 0;

        sorobanOps.forEach(op => {
          if (op.resourceUsage) {
            totalRefundable += op.resourceUsage.refundableFee || 0;
            totalNonRefundable += op.resourceUsage.nonRefundableFee || 0;
            totalRent += op.resourceUsage.rentFee || 0;
          }
        });

        const baseFee = parseInt(tx.fee);
        const totalStroops = baseFee + totalNonRefundable + totalRent;
        const totalXLM = (totalStroops / 10_000_000).toFixed(7);

        if (!cancelled) {
          setCosts({
            baseFee,
            refundableFee: totalRefundable,
            nonRefundableFee: totalNonRefundable,
            rentFee: totalRent,
            totalStroops,
            totalXLM
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to calculate costs');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    calculateCosts();

    return () => {
      cancelled = true;
    };
  }, [txHash, visualizer]);

  if (loading) return <div>Calculating costs...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!costs) return <div>No cost data</div>;

  return (
    <div className="cost-monitor">
      <h3>Transaction Costs Breakdown</h3>
      <table>
        <tbody>
          <tr>
            <td><strong>Base Fee:</strong></td>
            <td>{costs.baseFee.toLocaleString()} stroops</td>
          </tr>
          <tr>
            <td><strong>Refundable:</strong></td>
            <td>{costs.refundableFee.toLocaleString()} stroops</td>
          </tr>
          <tr>
            <td><strong>Non-Refundable:</strong></td>
            <td>{costs.nonRefundableFee.toLocaleString()} stroops</td>
          </tr>
          <tr>
            <td><strong>Rent Fee:</strong></td>
            <td>{costs.rentFee.toLocaleString()} stroops</td>
          </tr>
          <tr className="total">
            <td><strong>Total Cost:</strong></td>
            <td>
              <strong>{costs.totalStroops.toLocaleString()} stroops</strong>
              <br />
              <span className="xlm-equivalent">({costs.totalXLM} XLM)</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Example 5: Full App Integration with Network Switching
export function TransactionAnalyzerApp() {
  const [txHash, setTxHash] = useState('');
  const [isTestnet, setIsTestnet] = useState(true);

  const handleTransactionFound = (tx: TransactionDetails) => {
    setTxHash(tx.hash);
  };

  return (
    <div className="app">
      <header>
        <h1>Stellar Transaction Analyzer</h1>
        <div className="network-selector">
          <label>
            <input
              type="checkbox"
              checked={isTestnet}
              onChange={(e) => setIsTestnet(e.target.checked)}
            />
            <span>Use Testnet</span>
          </label>
          <span className={`badge ${isTestnet ? 'testnet' : 'mainnet'}`}>
            {isTestnet ? 'TESTNET' : 'MAINNET'}
          </span>
        </div>
      </header>

      <main>
        <TransactionSearch
          onTransactionFound={handleTransactionFound}
          isTestnet={isTestnet}
        />

        {txHash && (
          <div className="analysis-section">
            <TransactionDetailsCard
              txHash={txHash}
              isTestnet={isTestnet}
            />
            <SmartContractOperations
              txHash={txHash}
              isTestnet={isTestnet}
            />
            <CostMonitor
              txHash={txHash}
              isTestnet={isTestnet}
            />
          </div>
        )}
      </main>

      <style>{`
        .app {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #e0e0e0;
        }

        .network-selector {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .badge.testnet {
          background: #fff3e0;
          color: #f57c00;
        }

        .badge.mainnet {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .transaction-card,
        .contract-operations,
        .cost-monitor {
          background: white;
          padding: 20px;
          margin-bottom: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .detail {
          margin: 10px 0;
        }

        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 12px;
          border-radius: 6px;
          margin: 10px 0;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }

        code {
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 13px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        table td {
          padding: 8px;
          border-bottom: 1px solid #e0e0e0;
        }

        table tr.total {
          background: #f5f5f5;
          font-weight: bold;
        }

        .xlm-equivalent {
          color: #666;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

// Export all components for easy import
export default {
  TransactionDetailsCard,
  SmartContractOperations,
  TransactionSearch,
  CostMonitor,
  TransactionAnalyzerApp,
  useTransactionAnalyzer
};
