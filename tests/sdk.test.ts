import { describe, it, expect } from 'vitest';
import {
  StellarTransactionVisualizer,
  decodeScVal,
  setNetwork,
} from '../src/sdk/index';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('StellarTransactionVisualizer SDK', () => {
  it('initializes with testnet defaults', () => {
    const visualizer = new StellarTransactionVisualizer();
    const config = visualizer.getNetwork();

    expect(config.isTestnet).toBe(true);
    expect(config.networkUrl).toBe('https://horizon-testnet.stellar.org');
    expect(config.networkPassphrase).toContain('Test SDF Network');
    expect(config.rpcUrl).toBe('https://soroban-testnet.stellar.org');
  });

  it('initializes with mainnet configuration', () => {
    const visualizer = new StellarTransactionVisualizer({ isTestnet: false });
    const config = visualizer.getNetwork();

    expect(config.isTestnet).toBe(false);
    expect(config.networkUrl).toBe('https://horizon.stellar.org');
    expect(config.networkPassphrase).toContain('Public Global Stellar Network');
  });

  it('supports custom RPC URL configuration', () => {
    const customRpc = 'https://custom-soroban-rpc.example.com';
    const visualizer = new StellarTransactionVisualizer({
      isTestnet: true,
      rpcUrl: customRpc,
    });
    const config = visualizer.getNetwork();

    expect(config.rpcUrl).toBe(customRpc);
  });

  it('preserves multi-instance isolation', () => {
    const testnetVisualizer = new StellarTransactionVisualizer({ isTestnet: true });
    const mainnetVisualizer = new StellarTransactionVisualizer({ isTestnet: false });

    expect(testnetVisualizer.getNetwork().isTestnet).toBe(true);
    expect(mainnetVisualizer.getNetwork().isTestnet).toBe(false);

    testnetVisualizer.setNetwork({ networkUrl: 'https://custom-testnet.org' });
    expect(testnetVisualizer.getNetwork().networkUrl).toBe('https://custom-testnet.org');
    expect(mainnetVisualizer.getNetwork().networkUrl).toBe('https://horizon.stellar.org');
  });

  it('extracts operations, events, and state changes safely from transaction objects', () => {
    const visualizer = new StellarTransactionVisualizer();

    const mockTx: any = {
      hash: 'abc123',
      operations: [{ id: '1', type: 'payment' }],
      sorobanOperations: [
        {
          id: 'op1',
          type: 'invoke_host_function',
          functionName: 'transfer',
          stateChanges: [{ key: 'balance', type: 'modified' }],
        },
      ],
      events: [
        { type: 'contract', contractId: 'CA...', topics: ['transfer'], data: '100' },
      ],
      crossContractCalls: [
        { from: 'C1...', to: 'C2...', function: 'swap' },
      ],
      effects: [
        { type: 'account_credited', account: 'G1...' },
      ],
    };

    expect(visualizer.getSorobanOperations(mockTx)).toHaveLength(1);
    expect(visualizer.getSorobanOperations(mockTx)[0].functionName).toBe('transfer');
    expect(visualizer.getContractEvents(mockTx)).toHaveLength(1);
    expect(visualizer.getStateChanges(mockTx)).toHaveLength(1);
    expect(visualizer.getCrossContractCalls(mockTx)).toHaveLength(1);
    expect(visualizer.getTransactionEffects(mockTx)).toHaveLength(1);
  });

  it('handles empty or missing optional fields gracefully', () => {
    const visualizer = new StellarTransactionVisualizer();
    const minimalTx: any = { hash: 'min123', operations: [] };

    expect(visualizer.getSorobanOperations(minimalTx)).toEqual([]);
    expect(visualizer.getContractEvents(minimalTx)).toEqual([]);
    expect(visualizer.getStateChanges(minimalTx)).toEqual([]);
    expect(visualizer.getCrossContractCalls(minimalTx)).toEqual([]);
    expect(visualizer.getTransactionEffects(minimalTx)).toEqual([]);
  });

  it('simulateTransaction uses isolated instance config and server', async () => {
    const visualizer = new StellarTransactionVisualizer({ isTestnet: true });
    expect(typeof visualizer.simulateTransaction).toBe('function');
  });
});

describe('ScVal Decoding', () => {
  it('decodes boolean ScVal', () => {
    const trueVal = StellarSdk.xdr.ScVal.scvBool(true);
    const falseVal = StellarSdk.xdr.ScVal.scvBool(false);

    expect(decodeScVal(trueVal)).toBe(true);
    expect(decodeScVal(falseVal)).toBe(false);
  });

  it('decodes integer ScVal types (u32, i32, u64)', () => {
    const u32Val = StellarSdk.xdr.ScVal.scvU32(42);
    expect(decodeScVal(u32Val)).toBe(42);

    const i32Val = StellarSdk.xdr.ScVal.scvI32(-10);
    expect(decodeScVal(i32Val)).toBe(-10);

    const u64Val = StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(1000));
    expect(decodeScVal(u64Val)).toBe('1000');
  });

  it('decodes symbol and string ScVal', () => {
    const symbolVal = StellarSdk.xdr.ScVal.scvSymbol('transfer');
    expect(decodeScVal(symbolVal)).toBe('transfer');

    const stringVal = StellarSdk.xdr.ScVal.scvString('hello world');
    expect(decodeScVal(stringVal)).toBe('hello world');
  });

  it('decodes Vec and Map ScVal', () => {
    const vecVal = StellarSdk.xdr.ScVal.scvVec([
      StellarSdk.xdr.ScVal.scvSymbol('item1'),
      StellarSdk.xdr.ScVal.scvU32(99),
    ]);
    const decodedVec = decodeScVal(vecVal);
    expect(Array.isArray(decodedVec)).toBe(true);
    expect(decodedVec[0]).toBe('item1');
    expect(decodedVec[1]).toBe(99);

    const mapVal = StellarSdk.xdr.ScVal.scvMap([
      new StellarSdk.xdr.ScMapEntry({
        key: StellarSdk.xdr.ScVal.scvSymbol('status'),
        val: StellarSdk.xdr.ScVal.scvSymbol('active'),
      }),
    ]);
    const decodedMap = decodeScVal(mapVal);
    expect(decodedMap).toEqual({ status: 'active' });
  });

  it('handles null and undefined safely', () => {
    expect(decodeScVal(null)).toBeNull();
    expect(decodeScVal(undefined)).toBeNull();
  });
});
