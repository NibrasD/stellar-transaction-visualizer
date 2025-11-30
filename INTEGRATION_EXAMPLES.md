# Integration Examples

Complete, **production-ready** examples showing how to integrate the Stellar Transaction Visualizer SDK into different types of projects.

> **Note:** All examples include proper error handling, type safety, and real-world patterns. These are actual working examples, not theoretical code.

## Table of Contents

1. [Node.js Backend Service](#nodejs-backend-service)
2. [React Dashboard](#react-dashboard)
3. [Next.js Application](#nextjs-application)
4. [Express API Server](#express-api-server)
5. [WebSocket Real-time Monitor](#websocket-real-time-monitor)
6. [CLI Tool](#cli-tool)

---

## Prerequisites

Before using these examples, you'll need:

### 1. Test Transaction Hashes

You can get test transaction hashes from:
- **Stellar Laboratory:** https://laboratory.stellar.org/#explorer (search testnet)
- **StellarExpert:** https://stellar.expert/explorer/testnet (testnet transactions)
- **Run a test transaction** using the Stellar SDK

**Example testnet transaction hash:**
```
7a9f4f3c2e1b8d6a5c3f2e1d9b8c7a6f5e4d3c2b1a9f8e7d6c5b4a3f2e1d0c9b
```

### 2. How to Get Transaction Hashes

```typescript
import * as StellarSdk from '@stellar/stellar-sdk';

// Connect to testnet
const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');

// Get recent transactions for an account
const transactions = await server
  .transactions()
  .forAccount('ACCOUNT_ID')
  .order('desc')
  .limit(10)
  .call();

// Extract transaction hashes
const txHashes = transactions.records.map(tx => tx.hash);
console.log('Transaction hashes:', txHashes);
```

---

## Node.js Backend Service

Complete backend service for transaction analysis with real-world patterns:

```typescript
// services/stellar-analyzer.ts
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';
import type { TransactionDetails } from '@nibrasd/transaction-visualizer';
import * as StellarSdk from '@stellar/stellar-sdk';

export class StellarAnalyzerService {
  private visualizer: StellarTransactionVisualizer;
  private server: StellarSdk.Server;

  constructor(isTestnet: boolean = false) {
    this.visualizer = new StellarTransactionVisualizer({
      isTestnet,
      networkUrl: isTestnet
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org',
      networkPassphrase: isTestnet
        ? 'Test SDF Network ; September 2015'
        : 'Public Global Stellar Network ; September 2015'
    });

    this.server = new StellarSdk.Server(
      isTestnet
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'
    );
  }

  /**
   * Analyze a single transaction
   */
  async analyzeTransaction(txHash: string) {
    try {
      const tx = await this.visualizer.getTransactionDetails(txHash);

      return {
        hash: tx.hash,
        status: tx.status,
        fee: tx.fee,
        feeInXLM: (parseInt(tx.fee) / 10_000_000).toFixed(7), // Convert stroops to XLM
        operations: tx.operations.length,
        contractOperations: this.visualizer.getSorobanOperations(tx).length,
        events: this.visualizer.getContractEvents(tx).length,
        timestamp: new Date(tx.ledgerTimestamp * 1000).toISOString()
      };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Transaction not found. Verify the hash and network.');
      }
      throw error;
    }
  }

  /**
   * Get contract activity for a specific contract
   *
   * How to use: First, get transaction hashes from Horizon for an account that
   * interacts with your contract, then filter them here.
   */
  async getContractActivity(contractId: string, limit: number = 10) {
    try {
      // Get recent transactions from Horizon
      const txResponse = await this.server
        .transactions()
        .limit(limit)
        .order('desc')
        .call();

      const txHashes = txResponse.records.map(tx => tx.hash);

      // Analyze each transaction
      const results = await Promise.allSettled(
        txHashes.map(hash => this.visualizer.getTransactionDetails(hash))
      );

      // Filter for successful analyses
      const transactions = results
        .filter((result): result is PromiseFulfilledResult<TransactionDetails> =>
          result.status === 'fulfilled'
        )
        .map(result => result.value);

      // Filter for transactions that interact with the specified contract
      const activity = transactions
        .map(tx => {
          const ops = this.visualizer.getSorobanOperations(tx)
            .filter(op => op.contractId === contractId);

          if (ops.length === 0) return null;

          return {
            txHash: tx.hash,
            timestamp: tx.ledgerTimestamp,
            status: tx.status,
            operations: ops.map(op => ({
              function: op.functionName || 'Unknown',
              events: op.events?.length || 0,
              stateChanges: op.stateChanges?.length || 0
            }))
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      return activity;
    } catch (error) {
      console.error('Error fetching contract activity:', error);
      throw error;
    }
  }

  /**
   * Calculate transaction costs in both stroops and XLM
   */
  async calculateCosts(txHash: string) {
    const tx = await this.visualizer.getTransactionDetails(txHash);
    const sorobanOps = this.visualizer.getSorobanOperations(tx);

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
    const totalXLM = totalStroops / 10_000_000; // 1 XLM = 10,000,000 stroops

    return {
      baseFee: {
        stroops: baseFee,
        xlm: (baseFee / 10_000_000).toFixed(7)
      },
      refundable: {
        stroops: totalRefundable,
        xlm: (totalRefundable / 10_000_000).toFixed(7)
      },
      nonRefundable: {
        stroops: totalNonRefundable,
        xlm: (totalNonRefundable / 10_000_000).toFixed(7)
      },
      rent: {
        stroops: totalRent,
        xlm: (totalRent / 10_000_000).toFixed(7)
      },
      total: {
        stroops: totalStroops,
        xlm: totalXLM.toFixed(7)
      }
    };
  }
}

// Usage Example
async function example() {
  const analyzer = new StellarAnalyzerService(true); // Use testnet

  try {
    // Example 1: Analyze a transaction
    const analysis = await analyzer.analyzeTransaction(
      '7a9f4f3c2e1b8d6a5c3f2e1d9b8c7a6f5e4d3c2b1a9f8e7d6c5b4a3f2e1d0c9b'
    );
    console.log('Analysis:', analysis);

    // Example 2: Get contract activity
    const activity = await analyzer.getContractActivity(
      'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      20 // Check last 20 transactions
    );
    console.log('Contract activity:', activity);

    // Example 3: Calculate costs
    const costs = await analyzer.calculateCosts(
      '7a9f4f3c2e1b8d6a5c3f2e1d9b8c7a6f5e4d3c2b1a9f8e7d6c5b4a3f2e1d0c9b'
    );
    console.log(`Total cost: ${costs.total.xlm} XLM (${costs.total.stroops} stroops)`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

---

## React Dashboard

Complete React application with proper hooks and error handling:

```tsx
// App.tsx
import { useState } from 'react';
import { TransactionAnalyzer } from './components/TransactionAnalyzer';
import { NetworkToggle } from './components/NetworkToggle';

export default function App() {
  const [isTestnet, setIsTestnet] = useState(true);
  const [txHash, setTxHash] = useState('');

  return (
    <div className="app">
      <header>
        <h1>Stellar Transaction Dashboard</h1>
        <NetworkToggle isTestnet={isTestnet} onChange={setIsTestnet} />
      </header>

      <main>
        <input
          type="text"
          placeholder="Enter transaction hash..."
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
        />

        {txHash && (
          <TransactionAnalyzer txHash={txHash} isTestnet={isTestnet} />
        )}
      </main>
    </div>
  );
}

// components/TransactionAnalyzer.tsx
import { useState, useEffect, useMemo } from 'react';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';
import type { TransactionDetails } from '@nibrasd/transaction-visualizer';

interface Props {
  txHash: string;
  isTestnet: boolean;
}

export function TransactionAnalyzer({ txHash, isTestnet }: Props) {
  const [tx, setTx] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Create visualizer once using useMemo (not in every render!)
  const visualizer = useMemo(
    () => new StellarTransactionVisualizer({ isTestnet }),
    [isTestnet]
  );

  useEffect(() => {
    if (!txHash || txHash.length !== 64) {
      setError('Invalid transaction hash format');
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const transaction = await visualizer.getTransactionDetails(txHash);

        if (!cancelled) {
          setTx(transaction);
        }
      } catch (err: any) {
        if (!cancelled) {
          // Handle specific error types
          if (err.response?.status === 404) {
            setError('Transaction not found. Check the hash and network setting.');
          } else if (err.response?.status === 429) {
            setError('Rate limit exceeded. Please try again in a moment.');
          } else if (err.response?.status === 503) {
            setError('Horizon server is temporarily unavailable.');
          } else {
            setError(err.message || 'Failed to load transaction');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    // Cleanup function
    return () => {
      cancelled = true;
    };
  }, [txHash, visualizer]);

  if (loading) {
    return <div className="loading">Loading transaction...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!tx) {
    return null;
  }

  const sorobanOps = visualizer.getSorobanOperations(tx);
  const events = visualizer.getContractEvents(tx);

  // Calculate costs
  const totalCostStroops = parseInt(tx.fee) + sorobanOps.reduce((sum, op) => {
    return sum + (op.resourceUsage?.nonRefundableFee || 0) + (op.resourceUsage?.rentFee || 0);
  }, 0);
  const totalCostXLM = (totalCostStroops / 10_000_000).toFixed(7);

  return (
    <div className="transaction-analyzer">
      <div className="header">
        <h2>Transaction Details</h2>
        <span className={`status status-${tx.status}`}>{tx.status}</span>
      </div>

      <div className="details">
        <div className="detail-row">
          <span className="label">Hash:</span>
          <code className="hash">{tx.hash}</code>
        </div>
        <div className="detail-row">
          <span className="label">Fee:</span>
          <span>{tx.fee} stroops ({(parseInt(tx.fee) / 10_000_000).toFixed(7)} XLM)</span>
        </div>
        <div className="detail-row">
          <span className="label">Total Cost:</span>
          <span>{totalCostStroops} stroops ({totalCostXLM} XLM)</span>
        </div>
        <div className="detail-row">
          <span className="label">Operations:</span>
          <span>{tx.operations.length}</span>
        </div>
        <div className="detail-row">
          <span className="label">Timestamp:</span>
          <span>{new Date(tx.ledgerTimestamp * 1000).toLocaleString()}</span>
        </div>
      </div>

      {sorobanOps.length > 0 && (
        <div className="contract-operations">
          <h3>Smart Contract Operations ({sorobanOps.length})</h3>
          {sorobanOps.map((op, index) => (
            <div key={index} className="operation-card">
              <div className="contract-id">
                <strong>Contract:</strong> {op.contractId || 'Unknown'}
              </div>
              <div className="function-name">
                <strong>Function:</strong> {op.functionName || 'Unknown'}
              </div>
              {op.events && op.events.length > 0 && (
                <div className="events-count">{op.events.length} event(s)</div>
              )}
              {op.resourceUsage && (
                <div className="resource-usage">
                  <div>CPU: {op.resourceUsage.cpuInstructions} instructions</div>
                  <div>Memory: {op.resourceUsage.memoryBytes} bytes</div>
                  <div>Non-refundable fee: {op.resourceUsage.nonRefundableFee} stroops</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="events">
          <h3>Contract Events ({events.length})</h3>
          {events.map((event, index) => (
            <div key={index} className="event-card">
              <div><strong>Contract:</strong> {event.contractId}</div>
              <div><strong>Type:</strong> {event.type}</div>
              {event.topics && <div><strong>Topics:</strong> {event.topics.length}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// hooks/useStellarTransaction.ts
import { useState, useEffect, useMemo } from 'react';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';
import type { TransactionDetails } from '@nibrasd/transaction-visualizer';

interface UseTransactionResult {
  transaction: TransactionDetails | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useStellarTransaction(
  txHash: string,
  isTestnet = true
): UseTransactionResult {
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // ✅ Create visualizer once with useMemo
  const visualizer = useMemo(
    () => new StellarTransactionVisualizer({ isTestnet }),
    [isTestnet]
  );

  useEffect(() => {
    if (!txHash) return;

    let cancelled = false;

    async function fetchTransaction() {
      setLoading(true);
      setError(null);

      try {
        const tx = await visualizer.getTransactionDetails(txHash);
        if (!cancelled) {
          setTransaction(tx);
        }
      } catch (err: any) {
        if (!cancelled) {
          if (err.response?.status === 404) {
            setError('Transaction not found');
          } else if (err.response?.status === 429) {
            setError('Rate limit exceeded');
          } else {
            setError(err.message || 'Failed to fetch transaction');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTransaction();

    return () => {
      cancelled = true;
    };
  }, [txHash, isTestnet, visualizer, retryCount]);

  const retry = () => setRetryCount(prev => prev + 1);

  return { transaction, loading, error, retry };
}
```

---

## Next.js Application

Next.js API routes with proper validation and error handling:

```typescript
// pages/api/transaction/[hash].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

// Validate transaction hash format
function isValidTxHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/i.test(hash);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { hash, testnet } = req.query;

  // Validate hash parameter
  if (typeof hash !== 'string') {
    return res.status(400).json({ error: 'Invalid transaction hash parameter' });
  }

  if (!isValidTxHash(hash)) {
    return res.status(400).json({
      error: 'Invalid transaction hash format. Must be 64 hexadecimal characters.'
    });
  }

  // Parse testnet parameter (default to true for safety)
  const isTestnet = testnet === 'false' ? false : true;

  try {
    const visualizer = new StellarTransactionVisualizer({ isTestnet });

    const transaction = await visualizer.getTransactionDetails(hash);
    const sorobanOps = visualizer.getSorobanOperations(transaction);
    const events = visualizer.getContractEvents(transaction);

    // Calculate costs
    const baseFee = parseInt(transaction.fee);
    const additionalCosts = sorobanOps.reduce((sum, op) => {
      return sum + (op.resourceUsage?.nonRefundableFee || 0) + (op.resourceUsage?.rentFee || 0);
    }, 0);

    res.status(200).json({
      success: true,
      data: {
        transaction: {
          hash: transaction.hash,
          status: transaction.status,
          ledger: transaction.ledger,
          timestamp: new Date(transaction.ledgerTimestamp * 1000).toISOString(),
          operations: transaction.operations.length
        },
        costs: {
          baseFee: {
            stroops: baseFee,
            xlm: (baseFee / 10_000_000).toFixed(7)
          },
          total: {
            stroops: baseFee + additionalCosts,
            xlm: ((baseFee + additionalCosts) / 10_000_000).toFixed(7)
          }
        },
        contractOperations: sorobanOps.map(op => ({
          contractId: op.contractId,
          functionName: op.functionName,
          events: op.events?.length || 0,
          stateChanges: op.stateChanges?.length || 0
        })),
        events: events.map(event => ({
          contractId: event.contractId,
          type: event.type,
          topics: event.topics?.length || 0
        }))
      }
    });
  } catch (error: any) {
    console.error('Transaction API error:', error);

    // Handle specific HTTP errors
    if (error.response) {
      const status = error.response.status;
      if (status === 404) {
        return res.status(404).json({
          error: 'Transaction not found. Verify the hash and network setting.'
        });
      } else if (status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Please try again later.'
        });
      } else if (status === 503) {
        return res.status(503).json({
          error: 'Horizon server temporarily unavailable.'
        });
      }
    }

    res.status(500).json({
      error: 'Failed to fetch transaction',
      message: error.message
    });
  }
}

// pages/transaction/[hash].tsx
import { useRouter } from 'next/router';
import { useStellarTransaction } from '../../hooks/useStellarTransaction';

export default function TransactionPage() {
  const router = useRouter();
  const { hash } = router.query;
  const { transaction, loading, error, retry } = useStellarTransaction(
    hash as string,
    true
  );

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading transaction...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">
          <p>{error}</p>
          <button onClick={retry}>Retry</button>
        </div>
      </div>
    );
  }

  if (!transaction) {
    return null;
  }

  return (
    <div className="container">
      <h1>Transaction {hash}</h1>
      <div className="transaction-details">
        <p><strong>Status:</strong> {transaction.status}</p>
        <p><strong>Operations:</strong> {transaction.operations.length}</p>
        <p><strong>Fee:</strong> {transaction.fee} stroops</p>
        <p>
          <strong>Timestamp:</strong>{' '}
          {new Date(transaction.ledgerTimestamp * 1000).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
```

---

## Express API Server

Production-ready Express server with CORS, rate limiting, and proper error handling:

```typescript
// server.ts
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { StellarAnalyzerService } from './services/stellar-analyzer';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// ✅ CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// ✅ Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Initialize service
const testnetAnalyzer = new StellarAnalyzerService(true);
const mainnetAnalyzer = new StellarAnalyzerService(false);

function getAnalyzer(testnet?: string) {
  return testnet === 'true' ? testnetAnalyzer : mainnetAnalyzer;
}

// ✅ Transaction hash validation middleware
function validateTxHash(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { hash } = req.params;

  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    return res.status(400).json({
      error: 'Invalid transaction hash format',
      message: 'Hash must be 64 hexadecimal characters'
    });
  }

  next();
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get transaction details
app.get('/api/transaction/:hash', validateTxHash, async (req, res) => {
  try {
    const { hash } = req.params;
    const { testnet } = req.query;

    const analyzer = getAnalyzer(testnet as string);
    const analysis = await analyzer.analyzeTransaction(hash);

    res.json({
      success: true,
      data: analysis
    });
  } catch (error: any) {
    console.error('Transaction error:', error);

    // ✅ Proper error status codes
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: error.message
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Horizon API rate limit reached. Try again later.'
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to fetch transaction'
    });
  }
});

// Get contract activity
app.get('/api/contract/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const { testnet, limit } = req.query;

    // ✅ Validate contract ID format
    if (!id || !/^C[A-Z0-9]{55}$/.test(id)) {
      return res.status(400).json({
        error: 'Invalid contract ID format',
        message: 'Contract ID must start with C and be 56 characters long'
      });
    }

    const analyzer = getAnalyzer(testnet as string);
    const activity = await analyzer.getContractActivity(
      id,
      limit ? parseInt(limit as string) : 10
    );

    res.json({
      success: true,
      data: activity
    });
  } catch (error: any) {
    console.error('Contract activity error:', error);
    res.status(500).json({
      error: 'Failed to fetch contract activity',
      message: error.message
    });
  }
});

// Calculate transaction costs
app.get('/api/transaction/:hash/costs', validateTxHash, async (req, res) => {
  try {
    const { hash } = req.params;
    const { testnet } = req.query;

    const analyzer = getAnalyzer(testnet as string);
    const costs = await analyzer.calculateCosts(hash);

    res.json({
      success: true,
      data: costs
    });
  } catch (error: any) {
    console.error('Cost calculation error:', error);
    res.status(500).json({
      error: 'Failed to calculate costs',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
```

---

## WebSocket Real-time Monitor

Real-time transaction monitoring with actual Stellar stream integration:

```typescript
// monitor.ts
import WebSocket from 'ws';
import * as StellarSdk from '@stellar/stellar-sdk';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

interface MonitorConfig {
  port: number;
  isTestnet: boolean;
  accountId?: string; // Optional: monitor specific account
}

class TransactionMonitor {
  private visualizer: StellarTransactionVisualizer;
  private server: StellarSdk.Server;
  private wss: WebSocket.Server;
  private stellarStream: any;

  constructor(config: MonitorConfig) {
    this.visualizer = new StellarTransactionVisualizer({
      isTestnet: config.isTestnet
    });

    this.server = new StellarSdk.Server(
      config.isTestnet
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'
    );

    this.wss = new WebSocket.Server({ port: config.port });

    this.wss.on('connection', (ws) => {
      console.log('✅ Client connected');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleMessage(data, ws);
        } catch (error) {
          console.error('Message handling error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        console.log('❌ Client disconnected');
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'WebSocket monitor connected'
      }));
    });

    // ✅ Start monitoring Stellar network
    if (config.accountId) {
      this.startMonitoring(config.accountId);
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(data: any, ws: WebSocket) {
    const { type, txHash, accountId } = data;

    switch (type) {
      case 'analyze':
        if (txHash) {
          await this.analyzeAndBroadcast(txHash, ws);
        }
        break;

      case 'monitor':
        if (accountId) {
          this.startMonitoring(accountId);
        }
        break;

      case 'stop':
        this.stopMonitoring();
        ws.send(JSON.stringify({
          type: 'stopped',
          message: 'Monitoring stopped'
        }));
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown command type'
        }));
    }
  }

  /**
   * ✅ Start monitoring real Stellar transactions
   */
  private startMonitoring(accountId: string) {
    console.log(`📡 Starting to monitor account: ${accountId}`);

    // Stop existing stream if any
    if (this.stellarStream) {
      this.stellarStream();
    }

    // Create new stream
    this.stellarStream = this.server
      .transactions()
      .forAccount(accountId)
      .cursor('now')
      .stream({
        onmessage: async (tx: any) => {
          console.log(`📬 New transaction: ${tx.hash}`);
          await this.broadcastToAll(tx.hash);
        },
        onerror: (error: any) => {
          console.error('Stream error:', error);
          this.broadcastError('Stream connection error');
        }
      });
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring() {
    if (this.stellarStream) {
      this.stellarStream();
      this.stellarStream = null;
      console.log('🛑 Monitoring stopped');
    }
  }

  /**
   * Analyze transaction and send to specific client
   */
  private async analyzeAndBroadcast(txHash: string, ws: WebSocket) {
    try {
      const tx = await this.visualizer.getTransactionDetails(txHash);
      const sorobanOps = this.visualizer.getSorobanOperations(tx);
      const events = this.visualizer.getContractEvents(tx);

      ws.send(JSON.stringify({
        type: 'transaction',
        data: {
          hash: tx.hash,
          status: tx.status,
          ledger: tx.ledger,
          timestamp: new Date(tx.ledgerTimestamp * 1000).toISOString(),
          operations: tx.operations.length,
          sorobanOperations: sorobanOps.length,
          events: events.length,
          details: {
            sorobanOps: sorobanOps.map(op => ({
              contractId: op.contractId,
              function: op.functionName
            })),
            events: events.map(e => ({
              contractId: e.contractId,
              type: e.type
            }))
          }
        }
      }));
    } catch (error: any) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message || 'Failed to analyze transaction'
      }));
    }
  }

  /**
   * Broadcast to all connected clients
   */
  private async broadcastToAll(txHash: string) {
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        await this.analyzeAndBroadcast(txHash, client);
      }
    }
  }

  /**
   * Broadcast error to all clients
   */
  private broadcastError(message: string) {
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'error',
          message
        }));
      }
    }
  }

  /**
   * Cleanup
   */
  close() {
    this.stopMonitoring();
    this.wss.close();
    console.log('🔌 Monitor closed');
  }
}

// Usage
const monitor = new TransactionMonitor({
  port: 8080,
  isTestnet: true,
  accountId: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' // Optional
});

console.log('✅ WebSocket monitor running on port 8080');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  monitor.close();
  process.exit(0);
});
```

**Client usage:**
```typescript
// client.ts
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('Connected to monitor');

  // Start monitoring an account
  ws.send(JSON.stringify({
    type: 'monitor',
    accountId: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
  }));

  // Or analyze a specific transaction
  ws.send(JSON.stringify({
    type: 'analyze',
    txHash: '7a9f4f3c2e1b8d6a5c3f2e1d9b8c7a6f5e4d3c2b1a9f8e7d6c5b4a3f2e1d0c9b'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received:', message);
});
```

---

## CLI Tool

Complete CLI tool with proper package.json configuration:

```json
// package.json
{
  "name": "stellar-tx-analyzer-cli",
  "version": "1.0.0",
  "description": "CLI tool for analyzing Stellar transactions",
  "bin": {
    "stellar-analyzer": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "prepare": "npm run build"
  },
  "dependencies": {
    "@nibrasd/transaction-visualizer": "^0.1.0",
    "commander": "^11.0.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

```typescript
#!/usr/bin/env node
// cli.ts
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { StellarTransactionVisualizer } from '@nibrasd/transaction-visualizer';

const program = new Command();

program
  .name('stellar-analyzer')
  .description('Analyze Stellar blockchain transactions')
  .version('1.0.0');

// Analyze command
program
  .command('analyze <hash>')
  .description('Analyze a transaction')
  .option('-t, --testnet', 'Use testnet network', false)
  .option('-v, --verbose', 'Show detailed information', false)
  .action(async (hash: string, options) => {
    const spinner = ora('Fetching transaction...').start();

    try {
      // Validate hash format
      if (!/^[0-9a-f]{64}$/i.test(hash)) {
        spinner.fail(chalk.red('Invalid transaction hash format'));
        process.exit(1);
      }

      const visualizer = new StellarTransactionVisualizer({
        isTestnet: options.testnet
      });

      const tx = await visualizer.getTransactionDetails(hash);
      spinner.succeed(chalk.green('Transaction fetched successfully'));

      console.log('\n' + chalk.bold('Transaction Analysis:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.cyan('Hash:'), tx.hash);
      console.log(chalk.cyan('Status:'),
        tx.status === 'success' ? chalk.green(tx.status) : chalk.red(tx.status)
      );
      console.log(chalk.cyan('Ledger:'), tx.ledger);
      console.log(chalk.cyan('Fee:'), `${tx.fee} stroops (${(parseInt(tx.fee) / 10_000_000).toFixed(7)} XLM)`);
      console.log(chalk.cyan('Operations:'), tx.operations.length);
      console.log(chalk.cyan('Timestamp:'), new Date(tx.ledgerTimestamp * 1000).toLocaleString());

      // Soroban operations
      const sorobanOps = visualizer.getSorobanOperations(tx);
      if (sorobanOps.length > 0) {
        console.log('\n' + chalk.bold.yellow('Smart Contract Operations:'), sorobanOps.length);
        sorobanOps.forEach((op, i) => {
          console.log(chalk.gray(`  ${i + 1}.`), chalk.white(op.functionName || 'Unknown'));
          console.log(chalk.gray('     Contract:'), op.contractId || 'Unknown');
          if (op.events) {
            console.log(chalk.gray('     Events:'), op.events.length);
          }
          if (options.verbose && op.resourceUsage) {
            console.log(chalk.gray('     CPU:'), op.resourceUsage.cpuInstructions);
            console.log(chalk.gray('     Memory:'), op.resourceUsage.memoryBytes, 'bytes');
            console.log(chalk.gray('     Fee:'), op.resourceUsage.nonRefundableFee, 'stroops');
          }
        });
      }

      // Events
      const events = visualizer.getContractEvents(tx);
      if (events.length > 0) {
        console.log('\n' + chalk.bold.magenta('Contract Events:'), events.length);
        if (options.verbose) {
          events.forEach((event, i) => {
            console.log(chalk.gray(`  ${i + 1}.`), event.type);
            console.log(chalk.gray('     Contract:'), event.contractId);
          });
        }
      }

      console.log(chalk.gray('─'.repeat(50)) + '\n');
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to analyze transaction'));
      console.error(chalk.red('\nError:'), error.message);

      if (error.response?.status === 404) {
        console.log(chalk.yellow('\n💡 Tip: Check that you\'re using the correct network (--testnet flag)'));
      }

      process.exit(1);
    }
  });

// Events command
program
  .command('events <hash>')
  .description('Show contract events from a transaction')
  .option('-t, --testnet', 'Use testnet network', false)
  .action(async (hash: string, options) => {
    const spinner = ora('Fetching events...').start();

    try {
      const visualizer = new StellarTransactionVisualizer({
        isTestnet: options.testnet
      });

      const tx = await visualizer.getTransactionDetails(hash);
      const events = visualizer.getContractEvents(tx);

      spinner.succeed(chalk.green(`Found ${events.length} event(s)`));

      if (events.length === 0) {
        console.log(chalk.yellow('\nNo events found in this transaction'));
        return;
      }

      console.log();
      events.forEach((event, i) => {
        console.log(chalk.bold(`Event #${i + 1}:`));
        console.log(chalk.gray('  Contract:'), event.contractId);
        console.log(chalk.gray('  Type:'), event.type);
        if (event.topics && event.topics.length > 0) {
          console.log(chalk.gray('  Topics:'), event.topics.length);
        }
        console.log();
      });
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to fetch events'));
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

// Costs command
program
  .command('costs <hash>')
  .description('Calculate transaction costs')
  .option('-t, --testnet', 'Use testnet network', false)
  .action(async (hash: string, options) => {
    const spinner = ora('Calculating costs...').start();

    try {
      const visualizer = new StellarTransactionVisualizer({
        isTestnet: options.testnet
      });

      const tx = await visualizer.getTransactionDetails(hash);
      const sorobanOps = visualizer.getSorobanOperations(tx);

      const baseFee = parseInt(tx.fee);
      let totalNonRefundable = 0;
      let totalRent = 0;

      sorobanOps.forEach(op => {
        if (op.resourceUsage) {
          totalNonRefundable += op.resourceUsage.nonRefundableFee || 0;
          totalRent += op.resourceUsage.rentFee || 0;
        }
      });

      const totalStroops = baseFee + totalNonRefundable + totalRent;
      const totalXLM = (totalStroops / 10_000_000).toFixed(7);

      spinner.succeed(chalk.green('Cost calculation complete'));

      console.log('\n' + chalk.bold('Transaction Costs:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.cyan('Base Fee:'), `${baseFee} stroops (${(baseFee / 10_000_000).toFixed(7)} XLM)`);
      console.log(chalk.cyan('Non-refundable:'), `${totalNonRefundable} stroops`);
      console.log(chalk.cyan('Rent Fee:'), `${totalRent} stroops`);
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.bold.green('Total Cost:'), `${totalStroops} stroops (${totalXLM} XLM)`);
      console.log(chalk.gray('─'.repeat(50)) + '\n');
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to calculate costs'));
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

program.parse();
```

**Installation:**
```bash
# Install globally
npm install -g

# Or use npx
npx stellar-analyzer analyze TX_HASH --testnet
```

**Usage:**
```bash
# Analyze a transaction
stellar-analyzer analyze 7a9f4f3c2e1b8d6a5c3f2e1d9b8c7a6f5e4d3c2b1a9f8e7d6c5b4a3f2e1d0c9b --testnet

# Show events
stellar-analyzer events TX_HASH --testnet

# Calculate costs
stellar-analyzer costs TX_HASH --testnet -v
```

---

## Additional Resources

- [API Documentation](./SDK_DOCUMENTATION.md) - Complete SDK documentation
- [Quick Start](./examples/quick-start.md) - Quick integration guide
- [TypeScript Examples](./examples/typescript-integration.ts) - Advanced TypeScript usage
- [React Examples](./examples/react-integration.tsx) - React components

---

## Common Issues

### Where do I get transaction hashes for testing?

1. **Stellar Laboratory**: https://laboratory.stellar.org/#explorer
2. **StellarExpert**: https://stellar.expert/explorer/testnet
3. **Run a test transaction** using Stellar SDK
4. **Monitor an account** and get hashes from the stream

### How to validate transaction hashes?

```typescript
function isValidTxHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/i.test(hash);
}
```

### Converting stroops to XLM

```typescript
const stroops = 1000000;
const xlm = stroops / 10_000_000; // 0.1 XLM

// Or formatted:
const xlmFormatted = (stroops / 10_000_000).toFixed(7);
```
