import React, { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Flame, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { CopyButton } from './CopyButton';
import type { TransactionDetails, SorobanOperation, TransactionEffect } from '../types/stellar';
import { simpleContractMetadataService } from '../services/simpleContractMetadata';

interface ContractMetadata {
  symbol?: string;
  name?: string;
  decimals?: number;
}

interface AccountEffectsProps {
  details: TransactionDetails;
  sorobanOperations?: SorobanOperation[];
  contractMetadata?: Map<string, ContractMetadata>;
}

interface AccountEffect {
  type: 'credited' | 'debited' | 'burned' | 'minted' | 'trade' | 'pool_trade' | 'pool_updated' | 'offer_updated';
  accountId: string;
  asset: string;
  assetCode?: string;
  assetIssuer?: string;
  amount: string;
  source: string;
  contractId?: string;
  effectType: string;
  poolId?: string;
  offerId?: string;
  sold_amount?: string;
  sold_asset?: string;
  sold_asset_code?: string;
  bought_amount?: string;
  bought_asset?: string;
  bought_asset_code?: string;
  price?: string;
  shares?: string;
  total_shares?: string;
  accounts?: string;
  reserves?: any[];
}

export function AccountEffects({ details, sorobanOperations, contractMetadata }: AccountEffectsProps) {
  const [contractMetadataMap, setContractMetadataMap] = useState<Map<string, ContractMetadata>>(
    contractMetadata || new Map()
  );

  // Move shortenId to the top level
  const shortenId = (id: string) => {
    if (!id || id.length < 12) return id;
    return `${id.substring(0, 6)}…${id.substring(id.length - 6)}`;
  };

  // Fetch metadata for contracts in effects
  useEffect(() => {
  const fetchMetadata = async () => {
    const contractIds = new Set<string>();

    // Collect all contract IDs from effects
    details.effects?.forEach((effect: any) => {
      if (effect.contractId) contractIds.add(effect.contractId);
      if (effect.contract) contractIds.add(effect.contract);
    });

    // Fetch metadata for each contract
    const newMetadata = new Map(contractMetadata || new Map());
    for (const contractId of contractIds) {
      if (!newMetadata.has(contractId)) {
        try {
          const metadata = await simpleContractMetadataService.getContractMetadata(contractId);

          // Store metadata even if not explicitly a token, might still have symbol
          if (metadata) {
            if (metadata.isToken && metadata.tokenSymbol) {
              newMetadata.set(contractId, {
                symbol: metadata.tokenSymbol,
                name: metadata.tokenName,
                decimals: metadata.tokenDecimals
              });
            } else if (metadata.tokenSymbol) {
              // Some SAC contracts might not be marked as isToken but still have symbol
              newMetadata.set(contractId, {
                symbol: metadata.tokenSymbol,
                name: metadata.tokenName,
                decimals: metadata.tokenDecimals
              });
            }
          }
        } catch (e) {
        }
      }
    }

    setContractMetadataMap(newMetadata);
  };

  fetchMetadata();
}, [details.effects, contractMetadata]);

  const effects: AccountEffect[] = [];
  // Track effects to avoid duplicates:: "accountId-assetCode-amount-type"
  const seenEffects = new Set<string>();
  
    // Helper to resolve asset code from contract ID using metadata
  const resolveAssetCode = (contractId: string | undefined, effect: any = {}): string => {
  // Handle native XLM first
  if (effect.asset_type === 'native') {
    return 'XLM';
  }

  // Try to get from contract metadata FIRST (highest priority)
  if (contractId) {
    const metadata = contractMetadataMap.get(contractId);
    if (metadata?.symbol) {
      return metadata.symbol;
    }
  }

  // Check if there's an asset_code directly in the effect (but only if it's not the default "TOKEN")
  if (effect.asset_code && effect.asset_code !== 'undefined' && effect.asset_code !== 'TOKEN') {
    return effect.asset_code;
  }

  // Check for asset in the effect data
  if (effect.asset && typeof effect.asset === 'string' && effect.asset !== 'undefined') {
    // Handle classic assets with issuer
    if (effect.asset.includes(':')) {
      return effect.asset.split(':')[0];
    }
    return effect.asset;
  }

  // If we have a contract ID but no metadata yet, return shortened ID
  if (contractId) {
    return shortenId(contractId);
  }

  // Use effect.asset_code even if it's "TOKEN" as last resort
  if (effect.asset_code && effect.asset_code !== 'undefined') {
    return effect.asset_code;
  }

  // Final fallback
  return 'TOKEN';
  };

  const addEffect = (effect: AccountEffect) => {
    const key = `${effect.accountId}-${effect.assetCode}-${effect.amount}-${effect.type}`;
    if (!seenEffects.has(key)) {
      seenEffects.add(key);
      effects.push(effect);
    }
  };

  // Extract effects from the effects array (classic and Soroban)
  if (details.effects) {
    details.effects.forEach((effect: TransactionEffect, idx: number) => {
      const effectAny = effect as any;

      // Account credited (classic or Soroban)
      if (effect.type === 'account_credited' && effect.account && effect.amount) {
        const assetCode = resolveAssetCode(effectAny.contractId, effect);
        
        addEffect({
          type: 'credited',
          accountId: effect.account,
          asset: assetCode,
          assetCode: assetCode,
          amount: effect.amount,
          source: 'horizon',
          effectType: effect.type
        });
      }

      // Account created (includes starting balance)
      if (effect.type === 'account_created' && effect.account && effect.starting_balance) {
        addEffect({
          type: 'credited',
          accountId: effect.account,
          asset: 'XLM',
          assetCode: 'XLM',
          assetIssuer: undefined,
          amount: effect.starting_balance,
          source: 'classic',
          contractId: undefined,
          effectType: effect.type
        });
      }

      // Account debited (classic or Soroban)
      if (effect.type === 'account_debited' && effect.account && effect.amount) {
        // When issuer sends their own asset, it's effectively "minting"
        const isIssuerMinting = effect.asset_issuer && effect.account === effect.asset_issuer;

        if (isIssuerMinting) {
          // Show this as a mint operation instead of a debit
          const assetCode = resolveAssetCode(effectAny.contractId, effect);

          addEffect({
            type: 'minted',
            accountId: effect.account,
            asset: assetCode,
            assetCode: assetCode,
            assetIssuer: effect.asset_issuer,
            amount: effect.amount,
            source: 'classic',
            contractId: effectAny.contractId,
            effectType: 'account_minted'
          });
        } else {
          const assetCode = resolveAssetCode(effectAny.contractId, effect);

          addEffect({
            type: 'debited',
            accountId: effect.account,
            asset: assetCode,
            assetCode: assetCode,
            assetIssuer: effect.asset_issuer,
            amount: effect.amount,
            source: effectAny.contractId ? 'soroban' : 'classic',
            contractId: effectAny.contractId,
            effectType: effect.type
          });
        }
      }

      // Token burn (Soroban event processed effect)
      if (effect.type === 'token_burn' && effectAny.account && effectAny.amount) {
        const assetCode = resolveAssetCode(effectAny.contractId, effectAny);
        addEffect({
          type: 'burned',
          accountId: effectAny.account,
          asset: assetCode,
          assetCode: assetCode,
          amount: effectAny.amount,
          source: 'soroban',
          contractId: effectAny.contractId,
          effectType: effect.type
        });
      }

      // Account burned (Soroban converted effect)
      if (effect.type === 'account_burned' && effect.account && effect.amount) {
        const assetCode = resolveAssetCode(effectAny.contractId, effectAny);
        addEffect({
          type: 'burned',
          accountId: effect.account,
          asset: assetCode,
          assetCode: assetCode,
          amount: effect.amount,
          source: 'soroban',
          contractId: effectAny.contractId,
          effectType: effect.type
        });
      }

      // Account minted (Soroban converted effect)
      if (effect.type === 'account_minted' && effect.account && effect.amount) {
        const assetCode = resolveAssetCode(effectAny.contractId, effectAny);
        addEffect({
          type: 'minted',
          accountId: effect.account,
          asset: assetCode,
          assetCode: assetCode,
          amount: effect.amount,
          source: 'soroban',
          contractId: effectAny.contractId,
          effectType: effect.type
        });
        // Add credited effect for mint operation
        addEffect({
          type: 'credited',
          accountId: effect.account,
          asset: assetCode,
          assetCode: assetCode,
          amount: effect.amount,
          source: 'soroban',
          contractId: effectAny.contractId,
          effectType: effect.type
        });
      }

      // Token mint (Soroban event processed effect)
      if (effect.type === 'token_mint' && effectAny.account && effectAny.amount) {
        const assetCode = resolveAssetCode(effectAny.contractId, effectAny);
        addEffect({
          type: 'minted',
          accountId: effectAny.account,
          asset: assetCode,
          assetCode: assetCode,
          amount: effectAny.amount,
          source: 'soroban',
          contractId: effectAny.contractId,
          effectType: effect.type
        });
        // Add credited effect for mint operation
        addEffect({
          type: 'credited',
          accountId: effectAny.account,
          asset: assetCode,
          assetCode: assetCode,
          amount: effectAny.amount,
          source: 'soroban',
          contractId: effectAny.contractId,
          effectType: effect.type
        });
      }

      // Token transfer (Soroban event processed effect)
      if (effect.type === 'token_transfer' && effectAny.amount) {
        // Parse the description to extract from/to accounts
        const description = effectAny.description || '';
        const fromMatch = description.match(/from ([A-Z0-9]+…[A-Z0-9]+)/);
        const toMatch = description.match(/to ([A-Z0-9]+…[A-Z0-9]+)/);

        const fromAccount = fromMatch ? fromMatch[1] : effectAny.account;
        const toAccount = toMatch ? toMatch[1] : null;
        const assetCode = resolveAssetCode(effectAny.contractId, effectAny);

        if (fromAccount) {
          addEffect({
            type: 'debited',
            accountId: fromAccount,
            asset: assetCode,
            assetCode: assetCode,
            amount: effectAny.amount,
            source: 'soroban',
            contractId: effectAny.contractId,
            effectType: 'token_transfer'
          });
        }

        if (toAccount) {
          addEffect({
            type: 'credited',
            accountId: toAccount,
            asset: assetCode,
            assetCode: assetCode,
            amount: effectAny.amount,
            source: 'soroban',
            contractId: effectAny.contractId,
            effectType: 'token_transfer'
          });
        }
      }

      // Contract credited (Soroban SAC)
      if (effect.type === 'contract_credited' && effect.amount) {
        const assetCode = resolveAssetCode(effectAny.contract, effectAny);
        addEffect({
          type: 'credited',
          accountId: effectAny.contract || effectAny.account || 'Unknown',
          asset: assetCode,
          assetCode: assetCode,
          assetIssuer: effectAny.asset_issuer,
          amount: effect.amount,
          source: 'soroban',
          contractId: effectAny.contract,
          effectType: effect.type
        });
      }

      // Contract debited (Soroban SAC)
      if (effect.type === 'contract_debited' && effect.amount) {
        const assetCode = resolveAssetCode(effectAny.contract, effectAny);
        addEffect({
          type: 'debited',
          accountId: effectAny.contract || effectAny.account || 'Unknown',
          asset: assetCode,
          assetCode: assetCode,
          assetIssuer: effectAny.asset_issuer,
          amount: effect.amount,
          source: 'soroban',
          contractId: effectAny.contract,
          effectType: effect.type
        });
      }

      // Trade effects are for visualization only
      if (effect.type === 'trade') {
        // Trade effects handled elsewhere for flow visualization
      }

      // Liquidity pool trade - for display purposes only
      if (effect.type === 'liquidity_pool_trade') {
        // Pool trade effects are for visualization only
      }

      // Liquidity pool updated
      if (effect.type === 'liquidity_pool_updated') {
        const reserves = effectAny.reserves || [];
        const assetInfo = reserves.map((r: any) => {
          const assetCode = r.asset === 'native' || r.asset?.includes('native') ? 'XLM' :
                           (r.asset_code || r.asset?.split(':')[0] || 'Unknown');
          return `${r.amount || '0'} ${assetCode}`;
        }).join(' / ');

        addEffect({
          type: 'pool_updated',
          accountId: effectAny.liquidity_pool_id || 'Pool',
          asset: assetInfo || 'Pool shares',
          assetCode: 'Pool',
          amount: effectAny.total_shares || effectAny.shares || '0',
          source: 'classic',
          effectType: effect.type,
          poolId: effectAny.liquidity_pool_id,
          shares: effectAny.shares,
          total_shares: effectAny.total_shares,
          accounts: effectAny.accounts,
          reserves: reserves
        });
      }

      // Offer created/updated/removed
      if (effect.type === 'offer_created' || effect.type === 'offer_updated' || effect.type === 'offer_removed') {
        const sellingAsset = effectAny.selling_asset_type === 'native' ? 'XLM' : effectAny.selling_asset_code;
        const buyingAsset = effectAny.buying_asset_type === 'native' ? 'XLM' : effectAny.buying_asset_code;

        addEffect({
          type: 'offer_updated',
          accountId: effectAny.account || 'Unknown',
          asset: `${sellingAsset} → ${buyingAsset}`,
          assetCode: sellingAsset,
          amount: effectAny.amount || '0',
          source: 'classic',
          effectType: effect.type,
          offerId: effectAny.offer_id,
          sold_asset_code: effectAny.selling_asset_code,
          bought_asset_code: effectAny.buying_asset_code,
          price: effectAny.price
        });
      }
    });
  }

  // Filter to ONLY show credited, debited, minted, burned effects
  // Remove trade, pool_trade, pool_updated, offer_updated
  // Remove effects with undefined or invalid assets
  const balanceChangeEffects = effects.filter(e => {
    // Only these 4 types represent actual balance changes
    if (!['credited', 'debited', 'minted', 'burned'].includes(e.type)) {
      return false;
    }

    // Filter out effects with undefined assets
    if (!e.assetCode || e.assetCode === 'undefined' || e.asset === 'undefined → undefined') {
      return false;
    }

    // Filter out effects with 0 amount
    const amount = parseFloat(e.amount);
    if (isNaN(amount) || amount === 0) {
      return false;
    }

    return true;
  });

  if (balanceChangeEffects.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">No account effects found</p>
        <p className="text-sm text-gray-500 mt-1">
          This transaction did not credit, debit, mint, or burn any assets
        </p>
      </div>
    );
  }

  const getEffectIcon = (type: string) => {
    switch (type) {
      case 'credited':
      case 'minted':
        return <ArrowDownCircle className="w-5 h-5 text-green-600" />;
      case 'debited':
        return <ArrowUpCircle className="w-5 h-5 text-red-600" />;
      case 'burned':
        return <Flame className="w-5 h-5 text-orange-600" />;
      case 'trade':
      case 'pool_trade':
        return <TrendingDown className="w-5 h-5 text-blue-600" />;
      case 'pool_updated':
        return <TrendingUp className="w-5 h-5 text-indigo-600" />;
      case 'offer_updated':
        return <TrendingDown className="w-5 h-5 text-yellow-600" />;
      default:
        return <Wallet className="w-5 h-5 text-gray-600" />;
    }
  };

  const getEffectColor = (type: string) => {
    switch (type) {
      case 'credited':
      case 'minted':
        return 'border-l-green-500 bg-green-50';
      case 'debited':
        return 'border-l-red-500 bg-red-50';
      case 'burned':
        return 'border-l-orange-500 bg-orange-50';
      case 'trade':
      case 'pool_trade':
        return 'border-l-blue-500 bg-blue-50';
      case 'pool_updated':
        return 'border-l-indigo-500 bg-indigo-50';
      case 'offer_updated':
        return 'border-l-yellow-500 bg-yellow-50';
      default:
        return 'border-l-gray-500 bg-gray-50';
    }
  };

  const getEffectBadgeColor = (type: string) => {
    switch (type) {
      case 'credited':
      case 'minted':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'debited':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'burned':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'trade':
      case 'pool_trade':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pool_updated':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'offer_updated':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Group by type (use filtered effects)
  const credited = balanceChangeEffects.filter(e => e.type === 'credited');
  const debited = balanceChangeEffects.filter(e => e.type === 'debited');
  const minted = balanceChangeEffects.filter(e => e.type === 'minted');
  const burned = balanceChangeEffects.filter(e => e.type === 'burned');

  const renderEffect = (effect: AccountEffect, index: number) => {
    return (
      <div
        key={index}
        className={`border-l-4 rounded-lg p-4 ${getEffectColor(effect.type)} shadow-sm hover:shadow-md transition-shadow`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            {getEffectIcon(effect.type)}
          </div>
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getEffectBadgeColor(effect.type)}`}>
                {effect.type.toUpperCase()}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-300">
                {effect.source === 'classic' ? 'Classic' : 'Soroban'}
              </span>
              {effect.operationIndex !== undefined && (
                <span className="text-xs text-gray-500">
                  Op #{effect.operationIndex + 1}
                </span>
              )}
            </div>

            {/* Account */}
            <div className="mb-3 p-3 bg-white rounded border border-gray-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 mb-1">Account:</p>
                  <p className="font-mono text-sm text-gray-900 break-all select-all cursor-pointer hover:bg-gray-50 transition-colors">
                    {effect.accountId}
                  </p>
                </div>
                <CopyButton text={effect.accountId} />
              </div>
            </div>

            {/* Amount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white rounded border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Amount:</p>
                <p className="font-mono text-lg font-semibold text-gray-900">
                  {effect.amount}
                </p>
              </div>
              <div className="p-3 bg-white rounded border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Asset:</p>
                <p className="font-mono text-lg font-semibold text-gray-900">
                  {effect.assetCode || effect.asset}
                </p>
              </div>
            </div>

            {/* Contract ID for Soroban */}
            {effect.contractId && (
              <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-blue-700 font-medium mb-1">Contract:</p>
                    <p className="font-mono text-xs text-blue-900 break-all">
                      {effect.contractId}
                    </p>
                  </div>
                  <CopyButton text={effect.contractId} />
                </div>
              </div>
            )}

            {/* Asset Issuer for Classic */}
            {effect.assetIssuer && effect.assetIssuer !== 'native' && (
              <div className="mt-3 p-2 bg-purple-50 rounded border border-purple-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-purple-700 font-medium mb-1">Issuer:</p>
                    <p className="font-mono text-xs text-purple-900 break-all">
                      {effect.assetIssuer}
                    </p>
                  </div>
                  <CopyButton text={effect.assetIssuer} />
                </div>
              </div>
            )}

            {/* Trade Details */}
            {(effect.type === 'trade' || effect.type === 'pool_trade') && (
              <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                <p className="text-xs text-gray-500 mb-2 font-medium">Trade Details:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-red-600 mb-1">Sold:</p>
                    <p className="font-mono text-sm font-semibold text-gray-900">
                      {effect.sold_amount} {effect.sold_asset || effect.sold_asset_code}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-green-600 mb-1">Bought:</p>
                    <p className="font-mono text-sm font-semibold text-gray-900">
                      {effect.bought_amount} {effect.bought_asset || effect.bought_asset_code}
                    </p>
                  </div>
                </div>
                {effect.price && (
                  <p className="text-xs text-gray-600 mt-2">
                    Price: {effect.price}
                  </p>
                )}
              </div>
            )}

            {/* Pool ID for pool trades */}
            {effect.poolId && (
              <div className="mt-3 p-2 bg-indigo-50 rounded border border-indigo-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-indigo-700 font-medium mb-1">
                      {effect.type === 'pool_updated' ? 'Pool ID:' : 'Liquidity Pool:'}
                    </p>
                    <p className="font-mono text-xs text-indigo-900 break-all">
                      {effect.poolId}
                    </p>
                  </div>
                  <CopyButton text={effect.poolId} />
                </div>
              </div>
            )}

            {/* Pool Update Details */}
            {effect.type === 'pool_updated' && effect.reserves && effect.reserves.length > 0 && (
              <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                <p className="text-xs text-gray-500 mb-2 font-medium">Pool Reserves:</p>
                <div className="space-y-1">
                  {effect.reserves.map((reserve: any, idx: number) => {
                    const assetCode = reserve.asset === 'native' || reserve.asset?.includes('native') ? 'XLM' :
                                     (reserve.asset_code || reserve.asset?.split(':')[0] || 'Unknown');
                    return (
                      <p key={idx} className="font-mono text-sm text-gray-900">
                        {reserve.amount || '0'} {assetCode}
                      </p>
                    );
                  })}
                </div>
                {effect.total_shares && (
                  <p className="text-xs text-gray-600 mt-2">
                    Total Shares: {effect.total_shares}
                  </p>
                )}
                {effect.accounts && (
                  <p className="text-xs text-gray-600 mt-1">
                    Accounts: {effect.accounts}
                  </p>
                )}
              </div>
            )}

            {/* Offer ID for offer updates */}
            {effect.offerId && (
              <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-yellow-700 font-medium mb-1">DEX Offer ID:</p>
                    <p className="font-mono text-xs text-yellow-900 break-all">
                      {effect.offerId}
                    </p>
                  </div>
                  <CopyButton text={effect.offerId} />
                </div>
                {effect.price && (
                  <p className="text-xs text-yellow-700 mt-2">
                    Price: {effect.price}
                  </p>
                )}
              </div>
            )}

            {/* Operation type */}
            {(effect.operationType || effect.eventName) && (
              <div className="mt-2 text-xs text-gray-500">
                {effect.operationType && <span>Operation: {effect.operationType}</span>}
                {effect.eventName && <span>Event: {effect.eventName}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Calculate aggregated summary for each account-asset pair (use filtered effects)
  const aggregatedSummary = React.useMemo(() => {
    const summaryMap = new Map<string, {
      accountId: string;
      asset: string;
      assetCode?: string;
      assetIssuer?: string;
      contractId?: string;
      credited: number;
      debited: number;
      minted: number;
      burned: number;
    }>();

    balanceChangeEffects.forEach(effect => {
      const key = `${effect.accountId}-${effect.assetCode || effect.asset}`;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          accountId: effect.accountId,
          asset: effect.asset,
          assetCode: effect.assetCode,
          assetIssuer: effect.assetIssuer,
          contractId: effect.contractId,
          credited: 0,
          debited: 0,
          minted: 0,
          burned: 0
        });
      }

      const summary = summaryMap.get(key)!;
      const amount = parseFloat(effect.amount);

      if (effect.type === 'credited') {
        summary.credited += amount;
      } else if (effect.type === 'debited') {
        summary.debited += amount;
      } else if (effect.type === 'minted') {
        summary.minted += amount;
      } else if (effect.type === 'burned') {
        summary.burned += amount;
      }
    });

    // Filter out entries where net amount is 0 (no actual change)
    return Array.from(summaryMap.values()).filter(summary => {
      const netCredit = summary.credited + summary.minted;
      const netDebit = summary.debited + summary.burned;
      const netAmount = netCredit - netDebit;
      return netAmount !== 0;
    });
  }, [balanceChangeEffects]);

  const formatAmount = (amount: number) => {
    if (amount < 0.0001 && amount > 0) {
      // For very small numbers, use fixed precision then remove trailing zeros
      return parseFloat(amount.toFixed(10)).toString();
    }
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Effects</h2>
        <p className="text-sm text-gray-600">
          All credits, debits, mints, and burns affecting accounts in this transaction ({balanceChangeEffects.length} total effects)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-xs text-green-700 font-medium">Credited</p>
              <p className="text-2xl font-bold text-green-900">{credited.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-xs text-red-700 font-medium">Debited</p>
              <p className="text-2xl font-bold text-red-900">{debited.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <ArrowDownCircle className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-xs text-emerald-700 font-medium">Minted</p>
              <p className="text-2xl font-bold text-emerald-900">{minted.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Flame className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-xs text-orange-700 font-medium">Burned</p>
              <p className="text-2xl font-bold text-orange-900">{burned.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Aggregated Summary Section */}
      {aggregatedSummary.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-6 shadow-lg">
          <h3 className="text-xl font-bold text-blue-900 mb-4 flex items-center gap-2">
            <Wallet className="w-6 h-6" />
            Final Account Summary
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            Net balance changes per account-asset pair
          </p>
          <div className="space-y-3">
            {aggregatedSummary.map((summary, index) => {
              // If minted and credited are equal, they represent the same mint operation
              // Only count once to avoid double-counting
              const netCredit = (summary.minted > 0 && summary.minted === summary.credited)
                ? summary.minted
                : summary.credited + summary.minted;
              const netDebit = summary.debited + summary.burned;
              const netAmount = netCredit - netDebit;
              const isPositive = netAmount > 0;

              return (
                <div
                  key={index}
                  className={`border-l-4 rounded-lg p-4 shadow-sm ${
                    isPositive
                      ? 'border-l-green-600 bg-white'
                      : netAmount < 0
                      ? 'border-l-red-600 bg-white'
                      : 'border-l-gray-400 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isPositive ? (
                      <TrendingUp className="w-6 h-6 text-green-600 flex-shrink-0" />
                    ) : netAmount < 0 ? (
                      <TrendingDown className="w-6 h-6 text-red-600 flex-shrink-0" />
                    ) : (
                      <Wallet className="w-6 h-6 text-gray-600 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-gray-900 mb-1">
                        {formatAmount(Math.abs(netAmount))} {summary.assetCode || summary.asset} {
                          isPositive ? (summary.minted > 0 && summary.credited === 0 ? 'minted' : 'credited') :
                          'debited'
                        }
                      </p>
                      <p className="text-sm text-gray-600">
                        {isPositive ? 'to' : 'from'} account <span className="font-mono font-semibold">{shortenId(summary.accountId)}</span>
                      </p>

                      {/* Breakdown */}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {summary.credited > 0 && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                            +{formatAmount(summary.credited)} credited
                          </span>
                        )}
                        {summary.minted > 0 && (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded">
                            +{formatAmount(summary.minted)} minted
                          </span>
                        )}
                        {summary.debited > 0 && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded">
                            -{formatAmount(summary.debited)} debited
                          </span>
                        )}
                        {summary.burned > 0 && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded">
                            -{formatAmount(summary.burned)} burned
                          </span>
                        )}
                      </div>

                      {summary.contractId && (
                        <div className="mt-2">
                          <p className="text-xs text-blue-700">
                            Contract: <span className="font-mono">{shortenId(summary.contractId)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Effects */}
      <div className="space-y-3">
        <h3 className="text-xl font-bold text-gray-900 mb-4">All Effects</h3>
        {balanceChangeEffects.map((effect, index) => renderEffect(effect, index))}
      </div>
    </div>
  );
}