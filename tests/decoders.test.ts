import { describe, it, expect } from 'vitest';
import {
  decodeScVal,
  createOperationEdges,
} from '../src/sdk/index';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('Operation Flow & Edges', () => {
  it('creates sequential edges between valid operations', () => {
    const mockTx: any = {
      hash: 'tx-seq-123',
      operations: [
        { id: 'op-0', type: 'payment' },
        { id: 'op-1', type: 'invoke_host_function' },
        { id: 'op-2', type: 'manage_data' },
      ],
    };

    const edges = createOperationEdges(mockTx);
    expect(edges).toHaveLength(2);
    expect(edges[0].source).toBe('op-0');
    expect(edges[0].target).toBe('op-1');
    expect(edges[1].source).toBe('op-1');
    expect(edges[1].target).toBe('op-2');
  });

  it('filters out internal core_metrics operations from edges', () => {
    const mockTx: any = {
      hash: 'tx-metrics-123',
      operations: [
        { id: 'op-0', type: 'payment' },
        { id: 'op-metrics', type: 'core_metrics' },
        { id: 'op-1', type: 'manage_data' },
      ],
    };

    const edges = createOperationEdges(mockTx);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('op-0');
    expect(edges[0].target).toBe('op-1');
  });

  it('returns empty array when transaction has fewer than 2 operations', () => {
    const singleOpTx: any = {
      hash: 'tx-single',
      operations: [{ id: 'op-0', type: 'payment' }],
    };
    expect(createOperationEdges(singleOpTx)).toEqual([]);

    const noOpTx: any = { hash: 'tx-empty', operations: [] };
    expect(createOperationEdges(noOpTx)).toEqual([]);
  });
});

describe('Advanced ScVal Types', () => {
  it('decodes i128 values into big integers or strings', () => {
    const lo = new StellarSdk.xdr.Uint64(123456789);
    const hi = new StellarSdk.xdr.Int64(0);
    const parts = new StellarSdk.xdr.Int128Parts({ hi, lo });
    const i128Val = StellarSdk.xdr.ScVal.scvI128(parts);

    const decoded = decodeScVal(i128Val);
    expect(decoded).toBeDefined();
    expect(String(decoded)).toContain('123456789');
  });

  it('decodes Contract address ScAddress properly', () => {
    const rawContractId = Buffer.alloc(32, 7);
    const scAddress = StellarSdk.xdr.ScAddress.scAddressTypeContract(rawContractId);
    const addressVal = StellarSdk.xdr.ScVal.scvAddress(scAddress);

    const decoded = decodeScVal(addressVal);
    expect(typeof decoded).toBe('string');
    expect(decoded.startsWith('C')).toBe(true);
    expect(decoded).toHaveLength(56);
  });

  it('decodes Account address ScAddress properly', () => {
    const rawPubKey = Buffer.alloc(32, 3);
    const accountId = StellarSdk.Keypair.fromRawEd25519Seed(rawPubKey).xdrAccountId();
    const scAddress = StellarSdk.xdr.ScAddress.scAddressTypeAccount(accountId);
    const addressVal = StellarSdk.xdr.ScVal.scvAddress(scAddress);

    const decoded = decodeScVal(addressVal);
    expect(typeof decoded).toBe('string');
    expect(decoded.startsWith('G')).toBe(true);
    expect(decoded).toHaveLength(56);
  });
});
