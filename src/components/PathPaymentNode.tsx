import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ArrowRight, Info, Copy, Check } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

// --- Interfaces ---

interface PathHop {
  fromAmount: string;
  fromAsset: string;
  fromAssetFull: string;
  toAmount: string;
  toAsset: string;
  toAssetFull: string;
  mechanism: string;
  account?: string;
  poolId?: string;
  offerId?: string;
  offerOwner?: string;
}

interface RelatedEffect {
  type: string;
  description: string;
  account?: string;
  amount?: string;
  asset?: string;
  poolId?: string;
  offerId?: string;
  details?: string;
}

interface PathPaymentNodeProps {
  operation: any;
  effects?: any[];
  operationIndex?: number;
}

// --- Helper Functions ---

const formatAssetShort = (type: string, code?: string, issuer?: string) => {
  if (!type || type === 'native') return 'XLM';
  return code || 'ASSET';
};

const formatAssetWithDomain = (type: string, code?: string, issuer?: string) => {
  if (!type || type === 'native') return 'XLM(stellar.org)';
  const shortIssuer = issuer ? `${issuer.substring(0, 4)}...${issuer.substring(issuer.length - 4)}` : '';
  return `${code || 'ASSET'}(${shortIssuer})`;
};

const formatAsset = formatAssetShort;

const formatAmount = (amount: string | number | undefined | null): string => {
  if (amount === undefined || amount === null || amount === '') return '0';
  
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';

  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  } else if (num < 0.0001 && num > 0) {
    return parseFloat(num.toFixed(10)).toString();
  }

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7
  });
};

const formatAccountId = (id: string) => {
  if (!id || id.length < 10) return id;
  return `${id.substring(0, 4)}…${id.substring(id.length - 4)}`;
};

// --- Components ---

const CopyableText: React.FC<{ value: string; displayValue?: string; className?: string }> = ({ value, displayValue, className = "" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const showOnlyIcon = displayValue === "";

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            onClick={handleCopy}
            className={`cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-all rounded inline-flex items-center gap-1 ${showOnlyIcon ? 'p-0.5' : 'px-1'} ${copied ? 'bg-green-100 text-green-800 font-semibold' : ''} ${className}`}
            title="Click to copy"
          >
            {copied ? (
              showOnlyIcon ? <Check className="w-3 h-3 inline text-green-600" /> : '✓'
            ) : (
              <>
                {!showOnlyIcon && (displayValue || value)}
                <Copy className={`${showOnlyIcon ? 'w-3.5 h-3.5' : 'w-3 h-3'} inline opacity-50`} />
              </>
            )}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-gray-900 text-white px-3 py-2 rounded text-sm max-w-sm break-all z-50"
            sideOffset={5}
          >
            {copied ? 'Copied to clipboard!' : `Click to copy: ${value}`}
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

const getAssetFromEffect = (assetData: any, prefix: string): { type?: string; code?: string; issuer?: string } => {
  const type = assetData?.[`${prefix}_asset_type`] || assetData?.[`${prefix}AssetType`] || assetData?.asset_type || assetData?.type;
  const code = assetData?.[`${prefix}_asset_code`] || assetData?.[`${prefix}AssetCode`] || assetData?.asset_code || assetData?.code;
  const issuer = assetData?.[`${prefix}_asset_issuer`] || assetData?.[`${prefix}AssetIssuer`] || assetData?.asset_issuer || assetData?.issuer;
  return { type, code, issuer };
};

const getAmountFromEffect = (effectData: any, fieldNames: string[]): string => {
  for (const field of fieldNames) {
    const value = effectData?.[field];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }
  return '0';
};

const parseAssetString = (assetStr: string): { code: string; issuer?: string; full: string } => {
  if (!assetStr || assetStr === 'native') {
    return { code: 'XLM', full: 'XLM(stellar.org)' };
  }

  if (typeof assetStr === 'string' && assetStr.includes(':')) {
    const parts = assetStr.split(':');
    const code = parts[0];
    const issuer = parts[1];
    return { code, issuer, full: formatAssetWithDomain('credit_alphanum4', code, issuer) };
  }

  return { code: assetStr, full: assetStr };
};

const extractPathHopsAndEffects = (operation: any, effects: any[]): { hops: PathHop[]; relatedEffects: RelatedEffect[]; mainDebit?: RelatedEffect; mainCredit?: RelatedEffect } => {
  const hops: PathHop[] = [];
  const relatedEffects: RelatedEffect[] = [];
  let mainDebit: RelatedEffect | undefined;
  let mainCredit: RelatedEffect | undefined;

  if (!effects || effects.length === 0) {
    return { hops, relatedEffects, mainDebit, mainCredit };
  }

  const sourceAccount = operation?.from || operation?.source_account;
  const sourceAssetCode = operation?.source_asset_type === 'native' ? 'XLM' : (operation?.source_asset_code || 'XLM');
  const destAssetCode = (operation?.asset_type || operation?.dest_asset_type) === 'native' ? 'XLM' : (operation?.asset_code || operation?.dest_asset_code || 'XLM');

  // CRITICAL FIX: Read trades directly from effects in order, no path matching
  const tradesForSourceAccount = effects.filter(e => 
    e.type === 'trade' && 
    (e.account === sourceAccount || e.account_id === sourceAccount)
  );

  // Build hops from actual trade effects in the order they appear
  // IMPORTANT: We need to swap sold/bought because the effect shows the perspective
  // from the account's side, but we want to show: what was given → what was received
  tradesForSourceAccount.forEach((effect) => {
    const soldAsset = getAssetFromEffect(effect, 'sold');
    const boughtAsset = getAssetFromEffect(effect, 'bought');
    
    // SWAP: Display bought → sold (what account received → what account gave)
    const fromAssetCode = formatAsset(boughtAsset.type || '', boughtAsset.code, boughtAsset.issuer);
    const toAssetCode = formatAsset(soldAsset.type || '', soldAsset.code, soldAsset.issuer);
    const fromAssetFull = formatAssetWithDomain(boughtAsset.type || '', boughtAsset.code, boughtAsset.issuer);
    const toAssetFull = formatAssetWithDomain(soldAsset.type || '', soldAsset.code, soldAsset.issuer);

    hops.push({
      fromAmount: getAmountFromEffect(effect, ['bought_amount', 'boughtAmount']),
      fromAsset: fromAssetCode,
      fromAssetFull,
      toAmount: getAmountFromEffect(effect, ['sold_amount', 'soldAmount']),
      toAsset: toAssetCode,
      toAssetFull,
      mechanism: 'DEX offer',
      offerId: effect.offer_id,
      offerOwner: effect.seller,
      account: effect.account || effect.account_id
    });
  });

  // Add pool trades if any
  const poolTrades = effects.filter(e => 
    e.type === 'liquidity_pool_trade' &&
    (e.account === sourceAccount || e.account_id === sourceAccount)
  );

  poolTrades.forEach((effect) => {
    const soldData = effect.sold || {};
    const boughtData = effect.bought || {};
    const soldAsset = parseAssetString(soldData.asset || '');
    const boughtAsset = parseAssetString(boughtData.asset || '');

    hops.push({
      fromAmount: soldData.amount || '0',
      fromAsset: soldAsset.code,
      fromAssetFull: soldAsset.full,
      toAmount: boughtData.amount || '0',
      toAsset: boughtAsset.code,
      toAssetFull: boughtAsset.full,
      mechanism: 'pool',
      poolId: effect.liquidity_pool_id || effect.liquidityPoolId || effect.pool_id || effect.poolId,
      account: effect.account || effect.account_id
    });
  });

  // Process other effects
  effects.forEach((effect) => {
    if (effect.type === 'account_credited' || effect.type === 'account_debited') {
      const asset = formatAssetWithDomain(effect.asset_type, effect.asset_code, effect.asset_issuer);
      const effectAssetCode = effect.asset_type === 'native' ? 'XLM' : effect.asset_code;
      const action = effect.type === 'account_credited' ? 'credited to' : 'debited from';

      const effectData = {
        type: effect.type,
        description: `${formatAmount(effect.amount)} ${asset} ${action} account ${formatAccountId(effect.account)}`,
        account: effect.account,
        amount: effect.amount,
        asset
      };

      if (effect.type === 'account_debited' && effectAssetCode === sourceAssetCode && !mainDebit) {
        mainDebit = effectData;
      } else if (effect.type === 'account_credited' && effectAssetCode === destAssetCode && !mainCredit) {
        mainCredit = effectData;
      } else {
        relatedEffects.push(effectData);
      }
    } else if (effect.type === 'liquidity_pool_updated') {
      const reserves = effect.reserves || [];
      const assetPairs: string[] = [];
      reserves.forEach((r: any) => {
        assetPairs.push(parseAssetString(r.asset || '').code);
      });
      
      const reservesText = reserves.map((r: any) => `${formatAmount(r.amount)} ${parseAssetString(r.asset || '').code}`).join(' / ');
      const poolName = assetPairs.length >= 2 ? `${assetPairs[0]}/${assetPairs[1]}` : 'Pool';
      
      relatedEffects.push({
        type: 'liquidity_pool_updated',
        description: `Liquidity pool ${poolName} updated / ${reservesText} / ${formatAmount(effect.total_shares || effect.shares)} pool shares`,
        poolId: effect.liquidity_pool_id,
        details: effect.liquidity_pool_id ? `pool ${effect.liquidity_pool_id.substring(0, 16)}...` : undefined
      });
    } else if (effect.type === 'trade' && effect.offer_id && effect.seller) {
      if (effect.account !== sourceAccount && effect.account_id !== sourceAccount) {
        const soldAsset = getAssetFromEffect(effect, 'sold');
        const boughtAsset = getAssetFromEffect(effect, 'bought');
        const soldAssetShort = formatAsset(soldAsset.type || '', soldAsset.code, soldAsset.issuer);
        const boughtAssetShort = formatAsset(boughtAsset.type || '', boughtAsset.code, boughtAsset.issuer);

        const soldAmount = parseFloat(getAmountFromEffect(effect, ['sold_amount', 'soldAmount']));
        const boughtAmount = parseFloat(getAmountFromEffect(effect, ['bought_amount', 'boughtAmount']));
        
        const price = soldAmount !== 0 ? boughtAmount / soldAmount : 0;
        const priceStr = (price > 0) ? ` at ${formatAmount(price)} ${boughtAssetShort}/${soldAssetShort}` : '';
        
        relatedEffects.push({
          type: 'dex_offer_updated',
          description: `DEX offer ${effect.offer_id} updated / ${soldAssetShort} → ${boughtAssetShort}${priceStr}`,
          offerId: effect.offer_id,
          details: effect.seller ? `by ${formatAccountId(effect.seller)}` : undefined
        });
      }
    }
  });

  return { hops, relatedEffects, mainDebit, mainCredit };
};

export const PathPaymentNode: React.FC<PathPaymentNodeProps> = ({
  operation,
  effects = [],
  operationIndex
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!operation) return null;

  const isStrictSend = operation.type === 'path_payment_strict_send';
  const sourceAccount = formatAccountId(operation.from || operation.source_account);
  
  const sourceAsset = formatAsset(
    operation.source_asset_type,
    operation.source_asset_code,
    operation.source_asset_issuer
  );
  
  const destAsset = formatAsset(
    operation.asset_type || operation.dest_asset_type,
    operation.asset_code || operation.dest_asset_code,
    operation.asset_issuer || operation.dest_asset_issuer
  );

  let sourceAmount: string;
  let destAmount: string;
  let minDestAmount: string | null = null;
  let maxSourceAmount: string | null = null;

  if (isStrictSend) {
    sourceAmount = formatAmount(operation.source_amount || operation.amount);
    destAmount = formatAmount(operation.amount || operation.destination_amount);
    minDestAmount = operation.destination_min ? formatAmount(operation.destination_min) : null;
  } else {
    sourceAmount = formatAmount(operation.source_amount);
    maxSourceAmount = operation.source_max ? formatAmount(operation.source_max) : null;
    destAmount = formatAmount(operation.amount || operation.destination_amount);
  }

  const { hops, relatedEffects, mainDebit, mainCredit } = extractPathHopsAndEffects(operation, effects);
  const hopCount = hops.length || (operation.path?.length || 0) + 1;
  
  const intermediateAssets = hops.length > 1
    ? hops.slice(0, -1).map(hop => hop.toAssetFull)
    : [];

  return (
    <div className="w-full max-w-full border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow overflow-visible">
      <div
        className="p-4 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">
              {isStrictSend ? 'path payment strict send' : 'path payment strict receive'}
              {operationIndex !== undefined && ` #${operationIndex + 1}`}
            </span>
            <button
              className="text-gray-500 hover:text-gray-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600 mb-1">
          Source: <CopyableText value={operation.from || operation.source_account} displayValue={sourceAccount} className="font-mono text-blue-600" />
        </div>

        <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg">
          <div className="flex flex-col">
            <span className="text-lg font-bold text-gray-800">{sourceAmount} {sourceAsset}</span>
            {maxSourceAmount && <span className="text-xs text-gray-500">max: {maxSourceAmount}</span>}
          </div>

          <div className="flex flex-col items-center px-4">
            <ArrowRight className="w-6 h-6 text-gray-400" />
            <span className="text-xs text-gray-500 font-medium mt-1">
              {hopCount} hop{hopCount !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-lg font-bold text-gray-800">{destAmount} {destAsset}</span>
            {minDestAmount && <span className="text-xs text-gray-500">min: {minDestAmount}</span>}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="mt-4 mb-4 p-4 bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 rounded-lg border border-blue-200 shadow-sm">
            <div className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-blue-600" />
              Swap Summary
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="font-medium">Account:</span>
                <CopyableText value={operation.from || operation.source_account} displayValue={sourceAccount} className="font-mono text-blue-700 font-semibold" />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border-l-4 border-red-400">
                  <div className="text-sm">
                    <span className="text-xs text-red-600 font-medium block">Sent</span>
                    <span className="font-bold text-red-700">{sourceAmount} {sourceAsset}</span>
                    {maxSourceAmount && <span className="text-xs text-gray-500 ml-1">(max {maxSourceAmount})</span>}
                  </div>
                </div>

                {intermediateAssets.length > 0 && (
                  <div className="flex items-center gap-2 pl-4">
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <div className="text-xs text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                      <span className="font-medium">via:</span> {intermediateAssets.join(' → ')}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border-l-4 border-green-400">
                  <div className="text-sm">
                    <span className="text-xs text-green-600 font-medium block">Received</span>
                    <span className="font-bold text-green-700">{destAmount} {destAsset}</span>
                    {minDestAmount && <span className="text-xs text-gray-500 ml-1">(min {minDestAmount})</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500 pt-1 border-t border-blue-100">
                <Info className="w-3.5 h-3.5" />
                <span>{hopCount} hop{hopCount !== 1 ? 's' : ''} • {isStrictSend ? 'strict send' : 'strict receive'} path payment</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Swap Path</div>
            {hops.length > 0 ? (
              hops.map((hop, index) => (
                <div key={index} className="pl-4 border-l-2 border-green-300 bg-green-50/30 rounded-r-lg py-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold text-xs">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-600 mb-1">
                        {hop.account && <span>Account <CopyableText value={hop.account} displayValue={formatAccountId(hop.account)} className="font-mono" /> </span>}
                        swapped{' '}
                        <span className="font-semibold">{formatAmount(hop.fromAmount)} {hop.fromAssetFull}</span>
                        {' '}→{' '}
                        <span className="font-semibold">{formatAmount(hop.toAmount)} {hop.toAssetFull}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {hop.mechanism === 'pool' ? (
                          hop.poolId ? (
                            <span>(pool <CopyableText value={hop.poolId} displayValue={hop.poolId.substring(0, 16) + '...'} className="font-mono" />)</span>
                          ) : <span>(pool)</span>
                        ) : hop.mechanism === 'DEX offer' && hop.offerId ? (
                          <span>
                            (DEX offer {hop.offerId}
                            {hop.offerOwner && <span> by <CopyableText value={hop.offerOwner} displayValue={formatAccountId(hop.offerOwner)} className="font-mono" /></span>})
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500 italic pl-4">
                {operation.path && operation.path.length > 0 ? (
                  <div className="space-y-2">
                    <div>Path through {operation.path.length} intermediate asset{operation.path.length > 1 ? 's' : ''}:</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{sourceAsset}</span>
                      {operation.path.map((asset: any, idx: number) => (
                        <React.Fragment key={idx}>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">
                             {formatAsset(asset.asset_type, asset.asset_code, asset.asset_issuer)}
                          </span>
                        </React.Fragment>
                      ))}
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{destAsset}</span>
                    </div>
                  </div>
                ) : (
                  'No path details available from effects'
                )}
              </div>
            )}
          </div>

          {(mainDebit || mainCredit || relatedEffects.length > 0) && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Related Effects</div>
              <div className="space-y-2">
                {mainDebit && (
                  <div className="text-xs pl-4 py-2 border-l-4 border-red-400 bg-red-50/70 rounded-r">
                    <div className="flex items-start gap-2">
                      <Info className="w-3 h-3 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-1 font-semibold text-red-700">
                          <span>Account Debited (Source):</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-red-800">
                          <span>{mainDebit.description}</span>
                          {mainDebit.account && <CopyableText value={mainDebit.account} displayValue="" className="text-red-600" />}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {mainCredit && (
                  <div className="text-xs pl-4 py-2 border-l-4 border-green-400 bg-green-50/70 rounded-r">
                    <div className="flex items-start gap-2">
                      <Info className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-1 font-semibold text-green-700">
                          <span>Account Credited (Destination):</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-green-800">
                          <span>{mainCredit.description}</span>
                          {mainCredit.account && <CopyableText value={mainCredit.account} displayValue="" className="text-green-600" />}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {relatedEffects.map((effect, index) => (
                  <div key={index} className="text-xs text-gray-600 pl-4 py-1.5 border-l-2 border-gray-300 bg-gray-50/50 rounded-r">
                    <div className="flex items-start gap-2">
                      <Info className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span>{effect.description}</span>
                          {effect.account && effect.type !== 'dex_offer_updated' && (
                            <CopyableText value={effect.account} displayValue="" className="text-blue-600" />
                          )}
                        </div>
                        {effect.details && (
                          <div className="text-gray-500 mt-0.5 flex items-center gap-1">
                            {effect.poolId ? (
                              <>
                                <span>pool {effect.poolId.substring(0, 16)}...</span>
                                <CopyableText value={effect.poolId} displayValue="" className="font-mono" />
                              </>
                            ) : (effect.details.includes('by ') && effect.details.split('by ').length > 1) ? (
                              <>
                                <span>{effect.details.split('by ')[0]}by {effect.details.split('by ')[1]}</span>
                                <CopyableText value={effect.details.split('by ')[1].replace(/[()]/g, '').trim()} displayValue="" className="font-mono" />
                              </>
                            ) : (
                              effect.details
                            )}
                          </div>
                        )}
                        {effect.offerId && (
                          <div className="text-gray-500 mt-0.5 flex items-center gap-1">
                            <span>Offer ID: {effect.offerId}</span>
                            <CopyableText value={effect.offerId} displayValue="" className="text-blue-600" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
