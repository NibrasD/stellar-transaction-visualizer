import { createClient } from '@supabase/supabase-js';
import * as StellarSdk from '@stellar/stellar-sdk';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

let supabase: any | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export interface FunctionSpec {
  name: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ type: string }>;
}

export interface EventSpec {
  name: string;
  topics: Array<{ name: string; type: string }>;
  data: Array<{ name: string; type: string }>;
}

export interface ContractMetadata {
  contractId: string;
  network: string;
  spec?: any;
  functions?: FunctionSpec[];
  events?: EventSpec[];
  isToken: boolean;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  cachedAt: string;
}

export interface TokenMetadata {
  contractId: string;
  network: string;
  isToken: boolean;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  cachedAt: string;
}

class SimpleContractMetadataService {
  private rpcUrl: string = '';
  private network: string = 'testnet';
  private networkPassphrase: string = '';
  private memoryCache: Map<string, ContractMetadata> = new Map();

  setNetwork(network: string, rpcUrl: string, networkPassphrase: string) {
    this.network = network;
    this.rpcUrl = rpcUrl;
    this.networkPassphrase = networkPassphrase;
  }

  async getContractMetadata(contractId: string): Promise<ContractMetadata | null> {
    const cacheKey = `${contractId}-${this.network}`;

    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('contract_metadata')
        .select('*')
        .eq('contract_id', contractId)
        .eq('network', this.network)
        .maybeSingle();

      if (data && !error) {
        const hasFunctions = data.functions && data.functions.length > 0;
        const hasTokenMetadata = data.is_token && data.token_symbol;

        // Skip cache if:
        // 1. No functions AND not marked as token
        // 2. Marked as token but missing symbol (incomplete token metadata)
        const isIncomplete = (!hasFunctions && !data.is_token) ||
          (data.is_token && !data.token_symbol);

        if (isIncomplete) {
        } else {
          const metadata: ContractMetadata = {
            contractId: data.contract_id,
            network: data.network,
            spec: data.spec,
            functions: data.functions,
            isToken: data.is_token || false,
            tokenName: data.token_name,
            tokenSymbol: data.token_symbol,
            tokenDecimals: data.token_decimals,
            cachedAt: data.cached_at,
          };
          this.memoryCache.set(cacheKey, metadata);
          return metadata;
        }
      }
    }

    const metadata = await this.fetchFromRPC(contractId);
    if (metadata) {
      // Only cache if we got meaningful data (has functions OR is a token with symbol)
      const hasValidData = (metadata.functions && metadata.functions.length > 0) ||
        (metadata.isToken && metadata.tokenSymbol);

      if (hasValidData) {
        this.memoryCache.set(cacheKey, metadata);
        if (supabase) {
          await this.saveContractToCache(metadata);
        }
      } else {
      }
    }

    return metadata;
  }

  async getTokenMetadata(contractId: string): Promise<TokenMetadata | null> {
    const fullMetadata = await this.getContractMetadata(contractId);
    if (!fullMetadata) return null;

    return {
      contractId: fullMetadata.contractId,
      network: fullMetadata.network,
      isToken: fullMetadata.isToken,
      tokenName: fullMetadata.tokenName,
      tokenSymbol: fullMetadata.tokenSymbol,
      tokenDecimals: fullMetadata.tokenDecimals,
      cachedAt: fullMetadata.cachedAt,
    };
  }

  private async fetchFromStellarExpert(contractId: string): Promise<FunctionSpec[] | null> {
    try {
      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
      const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl) {
        return null;
      }

      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fetch-contract-spec?contractId=${contractId}&network=${this.network}`;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (supabaseAnonKey) {
        headers['Authorization'] = `Bearer ${supabaseAnonKey}`;
      }

      const response = await fetch(edgeFunctionUrl, { headers });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      if (data.functions && Array.isArray(data.functions)) {
        return data.functions;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private async fetchFromRPC(contractId: string): Promise<ContractMetadata | null> {
    try {
      if (!this.rpcUrl) {
        return null;
      }

      let tokenName: string | undefined;
      let tokenSymbol: string | undefined;
      let tokenDecimals: number | undefined;
      let isToken = false;

      let functions: FunctionSpec[] | undefined;
      let events: EventSpec[] | undefined;

      const specResult = await this.fetchContractSpecFromRPC(null as any, contractId);
      functions = specResult.functions || undefined;
      events = specResult.events || undefined;

      if (!functions) {
        functions = await this.fetchFromStellarExpert(contractId) || undefined;
      }

      // Try to detect if this is a token contract
      let hasTokenFunctions = false;
      let functionNames: string[] = [];

      if (functions) {
        const tokenFunctions = ['transfer', 'balance', 'decimals', 'name', 'symbol'];
        functionNames = functions.map(f => f.name.toLowerCase());
        hasTokenFunctions = tokenFunctions.filter(tf => functionNames.includes(tf)).length >= 3;

      } else {
      }

      // Try calling token functions (either if spec says it's a token, or if no spec available)
      if (hasTokenFunctions || !functions) {
        // Try calling symbol() function
        try {
          tokenSymbol = await this.callContractFunction(null as any, contractId, 'symbol');
          // Symbol normalization is now done in the edge function
          if (tokenSymbol) {
            isToken = true; // If symbol() succeeds, it's a token
          }
        } catch (error) {
        }

        // Try calling name() function
        if (isToken || !functions) {
          try {
            tokenName = await this.callContractFunction(null as any, contractId, 'name');
            if (tokenName) {
              isToken = true;
            }
          } catch (error) {
          }
        }

        // Try calling decimals() function
        if (isToken || !functions) {
          try {
            const decimalsStr = await this.callContractFunction(null as any, contractId, 'decimals');
            if (decimalsStr) {
              tokenDecimals = parseInt(decimalsStr, 10);
              isToken = true;
            }
          } catch (error) {
          }
        }

        if (isToken) {
        }
      }

      if (!functions && isToken) {
        functions = [
          { name: 'transfer', inputs: [{ name: 'from', type: 'Address' }, { name: 'to', type: 'Address' }, { name: 'amount', type: 'i128' }], outputs: [] },
          { name: 'mint', inputs: [{ name: 'to', type: 'Address' }, { name: 'amount', type: 'i128' }], outputs: [] },
          { name: 'burn', inputs: [{ name: 'from', type: 'Address' }, { name: 'amount', type: 'i128' }], outputs: [] },
          { name: 'approve', inputs: [{ name: 'from', type: 'Address' }, { name: 'spender', type: 'Address' }, { name: 'amount', type: 'i128' }, { name: 'expiration_ledger', type: 'u32' }], outputs: [] },
          { name: 'balance', inputs: [{ name: 'id', type: 'Address' }], outputs: [{ type: 'i128' }] },
          { name: 'allowance', inputs: [{ name: 'from', type: 'Address' }, { name: 'spender', type: 'Address' }], outputs: [{ type: 'i128' }] },
        ];
      }

      return {
        contractId,
        network: this.network,
        spec: functions ? { functions } : undefined,
        functions,
        events,
        isToken,
        tokenName,
        tokenSymbol,
        tokenDecimals,
        cachedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.createBasicMetadata(contractId);
    }
  }

  private async fetchContractSpecFromRPC(server: StellarSdk.rpc.Server, contractId: string): Promise<{ functions: FunctionSpec[] | null; events: EventSpec[] | null }> {
    try {
      if (!supabaseUrl) {
        return { functions: null, events: null };
      }

      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fetch-contract-spec?contractId=${contractId}&network=${this.network}&method=rpc`;

      const response = await fetch(edgeFunctionUrl, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return { functions: null, events: null };
      }

      const data = await response.json();

      return {
        functions: data.functions || null,
        events: data.events || null
      };
    } catch (error) {
      return { functions: null, events: null };
    }
  }

  private getTypeName(type: any): string {
    const typeName = type.switch().name;

    switch (typeName) {
      case 'scSpecTypeI32': return 'i32';
      case 'scSpecTypeI64': return 'i64';
      case 'scSpecTypeI128': return 'i128';
      case 'scSpecTypeU32': return 'u32';
      case 'scSpecTypeU64': return 'u64';
      case 'scSpecTypeU128': return 'u128';
      case 'scSpecTypeBool': return 'bool';
      case 'scSpecTypeSymbol': return 'Symbol';
      case 'scSpecTypeString': return 'String';
      case 'scSpecTypeAddress': return 'Address';
      case 'scSpecTypeBytes': return 'Bytes';
      case 'scSpecTypeVec':
        const vecElement = type.vec()?.elementType();
        return vecElement ? `Vec<${this.getTypeName(vecElement)}>` : 'Vec';
      case 'scSpecTypeOption':
        const optionValue = type.option()?.valueType();
        return optionValue ? `Option<${this.getTypeName(optionValue)}>` : 'Option';
      case 'scSpecTypeMap':
        return 'Map';
      case 'scSpecTypeTuple':
        return 'Tuple';
      case 'scSpecTypeUdt':
        const udt = type.udt();
        return udt ? udt.name().toString() : 'Custom';
      default:
        return typeName.replace('scSpecType', '');
    }
  }

  private async callContractFunction(
    server: StellarSdk.rpc.Server,
    contractId: string,
    functionName: string
  ): Promise<string | null> {
    try {
      // Use edge function to avoid CORS issues
      if (!supabaseUrl) {
        return null;
      }

      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fetch-contract-spec?contractId=${contractId}&network=${this.network}&tokenFunction=${functionName}`;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (supabaseKey) {
        headers['Authorization'] = `Bearer ${supabaseKey}`;
      }

      const response = await fetch(edgeFunctionUrl, { headers });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      if (data.value !== undefined && data.value !== null) {
        return data.value;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  private createBasicMetadata(contractId: string): ContractMetadata {
    return {
      contractId,
      network: this.network,
      isToken: false,
      cachedAt: new Date().toISOString(),
    };
  }

  private async saveContractToCache(metadata: ContractMetadata): Promise<void> {
    if (!supabase) return;

    try {
      await supabase.from('contract_metadata').upsert({
        contract_id: metadata.contractId,
        network: metadata.network,
        spec: metadata.spec,
        functions: metadata.functions,
        is_token: metadata.isToken,
        token_name: metadata.tokenName,
        token_symbol: metadata.tokenSymbol,
        token_decimals: metadata.tokenDecimals,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
    }
  }

  getFunctionSpec(contractMetadata: ContractMetadata | null, functionName: string): FunctionSpec | null {
    if (!contractMetadata || !contractMetadata.functions) {
      return null;
    }

    return contractMetadata.functions.find(f => f.name === functionName) || null;
  }

  formatFunctionCall(
    contractMetadata: ContractMetadata | null,
    functionName: string,
    args: any[]
  ): string {
    const spec = this.getFunctionSpec(contractMetadata, functionName);

    if (!spec || !spec.inputs || spec.inputs.length === 0) {
      return `${functionName}(${args.map((_, i) => `arg${i}`).join(', ')})`;
    }

    const formattedArgs = args.map((arg, i) => {
      const paramName = spec.inputs[i]?.name || `arg${i}`;
      const paramType = spec.inputs[i]?.type || 'unknown';
      return `${paramName}: ${arg}`;
    }).join(', ');

    return `${functionName}(${formattedArgs})`;
  }

  formatAmount(amount: string | number | bigint, decimals?: number): string {
    const amountStr = String(amount);

    // Validate that the amount is a valid number
    if (!amountStr || amountStr === '(decode error)' || !/^-?\d+$/.test(amountStr.replace(/[ui]\d+$/, ''))) {
      return '0';
    }

    if (decimals === undefined || decimals === null) {
      return amountStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    try {
      const divisor = Math.pow(10, decimals);
      const numericAmount = BigInt(amountStr);
      const integerPart = numericAmount / BigInt(divisor);
      const fractionalPart = numericAmount % BigInt(divisor);

      // Use absolute value for fractional part to avoid double negative (e.g., "-263.-8582598")
      const absFractionalPart = fractionalPart < BigInt(0) ? -fractionalPart : fractionalPart;
      const fractionalStr = String(absFractionalPart).padStart(decimals, '0');
      const trimmedFractional = fractionalStr.replace(/0+$/, '');

      if (trimmedFractional) {
        return `${integerPart.toLocaleString()}.${trimmedFractional}`;
      }

      return integerPart.toLocaleString();
    } catch (e) {
      return '0';
    }
  }

  async getContractLabel(contractId: string): Promise<string> {
    const metadata = await this.getTokenMetadata(contractId);

    if (metadata && metadata.isToken && metadata.tokenSymbol) {
      return metadata.tokenSymbol;
    }

    return `${contractId.substring(0, 4)}…${contractId.substring(contractId.length - 4)}`;
  }
}

export const simpleContractMetadataService = new SimpleContractMetadataService();
