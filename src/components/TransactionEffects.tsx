import React from 'react';
import { TrendingUp, TrendingDown, Wallet, Shield, Users, ArrowRightLeft, Database } from 'lucide-react';
import type { TransactionEffect } from '../types/stellar';
import { CopyButton } from './CopyButton';

interface TransactionEffectsProps {
  effects: TransactionEffect[];
}

export function TransactionEffects({ effects }: TransactionEffectsProps) {
  if (!effects || effects.length === 0) {
    return null;
  }

  // Display ALL effects without filtering or aggregation
  const allEffects = effects;

  const getEffectIcon = (type: string) => {
    if (type.includes('credited') || type.includes('mint') || type.includes('claimable_balance_created')) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    }
    if (type.includes('debited') || type.includes('burned') || type.includes('removed') || type.includes('claimable_balance_claimed')) {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    }
    if (type.includes('trustline') || type.includes('trust')) {
      return <Shield className="w-4 h-4 text-blue-600" />;
    }
    if (type.includes('signer')) {
      return <Users className="w-4 h-4 text-purple-600" />;
    }
    if (type.includes('trade')) {
      return <ArrowRightLeft className="w-4 h-4 text-orange-600" />;
    }
    if (type.includes('data_')) {
      return <Database className="w-4 h-4 text-indigo-600" />;
    }
    return <Wallet className="w-4 h-4 text-gray-600" />;
  };

  const formatAmount = (amount?: string) => {
    if (!amount) return '';
    const num = parseFloat(amount);
    if (num < 0.0001 && num > 0) {
      // For very small numbers, use fixed precision then remove trailing zeros
      return parseFloat(num.toFixed(10)).toString();
    }
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
  };

  const formatAsset = (effect: TransactionEffect) => {
    if (effect.asset_type === 'native') {
      return 'XLM';
    }
    if (effect.asset_code) {
      return effect.asset_code;
    }
    // Handle Soroban asset format: "ASSET:ISSUER" or contract address
    if ((effect as any).asset) {
      const asset = (effect as any).asset;
      if (typeof asset === 'string') {
        if (asset.includes(':')) {
          // Format: CODE:ISSUER
          return asset.split(':')[0];
        }
        // If it's a long contract address, truncate it
        if (asset.length > 10) {
          return `${asset.substring(0, 8)}...${asset.substring(asset.length - 4)}`;
        }
        return asset;
      }
    }
    return 'Unknown';
  };

  const getAssetIssuer = (effect: TransactionEffect) => {
    if (effect.asset_issuer) {
      return effect.asset_issuer;
    }
    if ((effect as any).asset) {
      const asset = (effect as any).asset;
      if (typeof asset === 'string' && asset.includes(':')) {
        return asset.split(':')[1];
      }
    }
    return null;
  };

  const shortenId = (id: string) => {
    if (!id || id.length < 12) return id;
    return `${id.substring(0, 4)}…${id.substring(id.length - 4)}`;
  };

  const formatContractStateChange = (effect: any) => {
    const contractId = shortenId(effect.contractId || '');
    const action = effect.type === 'created' ? 'created' : effect.type === 'updated' ? 'updated' : 'removed';
    const storageType = effect.storageType || 'temporary';
    const keyDisplay = effect.keyDisplay || '';
    const valueDisplay = effect.valueDisplay || '';

    let description = `Contract ${contractId} ${action} ${storageType} data`;

    if (keyDisplay) {
      description += ` ${keyDisplay}`;
    }

    if (valueDisplay && action !== 'removed') {
      description += ` = ${valueDisplay}`;
    }

    return description;
  };

  const formatTTLExtension = (effect: any) => {
    const contractId = shortenId(effect.contractId || '');
    const ledger = effect.extendTo || '';
    const entryKey = effect.keyHash ? shortenId(effect.keyHash) : '';

    let description = `Time-to-live extended to ledger ${ledger}`;

    if (contractId) {
      description += ` for ${contractId} contract state entry`;
    }

    if (entryKey) {
      description += ` ${entryKey}`;
    }

    return description;
  };

  const getEffectDescription = (effect: TransactionEffect) => {
    const effectAny = effect as any;

    // Handle contract state changes (ledger entry effects)
    if (effectAny.ledgerEntryType === 'contractData' || effectAny.changeType?.includes('ledgerEntry')) {
      return formatContractStateChange(effectAny);
    }

    // Handle TTL extensions
    if (effectAny.type === 'contract_code_updated' && effectAny.extendTo) {
      return formatTTLExtension(effectAny);
    }

    if (effectAny.description?.includes('Time-to-live')) {
      return formatTTLExtension(effectAny);
    }

    const asset = formatAsset(effect);
    const amount = formatAmount(effect.amount);
    const accountShort = effect.account ? `${effect.account.substring(0, 4)}...${effect.account.substring(effect.account.length - 4)}` : 'Unknown';

    switch (effect.type) {
      case 'account_credited':
        return `Credited ${amount || '0'} ${asset} to ${accountShort}`;

      case 'account_debited':
        return `Debited ${amount || '0'} ${asset} from ${accountShort}`;

      case 'account_burned':
        return `${accountShort} burned ${amount || '0'} ${asset}`;

      case 'account_created':
        return `Account created: ${effect.account?.substring(0, 8)}... with ${formatAmount(effect.starting_balance)} XLM`;

      case 'account_removed':
        return `Account removed: ${effect.account?.substring(0, 8)}...`;

      case 'trustline_created':
        return `Trustline created for ${asset} by ${effect.account?.substring(0, 8)}...`;

      case 'trustline_updated':
        return `Trustline updated for ${asset} (limit: ${formatAmount(effect.limit)})`;

      case 'trustline_removed':
        return `Trustline removed for ${asset}`;

      case 'trustline_authorized':
        return `Trustline authorized for ${asset}`;

      case 'trustline_deauthorized':
        return `Trustline deauthorized for ${asset}`;

      case 'signer_created':
        return `Signer added: ${effect.public_key?.substring(0, 12)}... (weight: ${effect.weight})`;

      case 'signer_updated':
        return `Signer updated: ${effect.public_key?.substring(0, 12)}... (weight: ${effect.weight})`;

      case 'signer_removed':
        return `Signer removed: ${effect.public_key?.substring(0, 12)}...`;

      case 'trade':
        const soldAsset = effect.sold_asset_code || 'XLM';
        const boughtAsset = effect.bought_asset_code || 'XLM';
        return `Trade: ${formatAmount(effect.sold_amount)} ${soldAsset} → ${formatAmount(effect.bought_amount)} ${boughtAsset}`;

      case 'liquidity_pool_deposited':
        return `Deposited to liquidity pool: ${effect.liquidity_pool_id?.substring(0, 12)}...`;

      case 'liquidity_pool_withdrew':
        return `Withdrew from liquidity pool: ${effect.liquidity_pool_id?.substring(0, 12)}...`;

      case 'claimable_balance_created':
        return `Claimable balance created: ${amount} ${asset}`;

      case 'claimable_balance_claimed':
        return `Claimable balance claimed: ${amount} ${asset}`;

      case 'contract_credited':
        return `Contract credited ${amount || '0'} ${asset}`;

      case 'contract_debited':
        return `Contract debited ${amount || '0'} ${asset}`;

      case 'data_created':
        const createdName = (effect as any).name || 'Unknown';
        const createdValue = (effect as any).value ? `"${(effect as any).value}"` : '';
        return `Data entry created: ${createdName} ${createdValue ? `= ${createdValue}` : ''}`;

      case 'data_updated':
        const updatedName = (effect as any).name || 'Unknown';
        const updatedValue = (effect as any).value ? `"${(effect as any).value}"` : '';
        return `Data entry updated: ${updatedName} ${updatedValue ? `= ${updatedValue}` : ''}`;

      case 'data_removed':
        const removedName = (effect as any).name || 'Unknown';
        return `Data entry removed: ${removedName}`;

      case 'contract_data_created':
        return `Contract data entry created`;

      case 'contract_data_updated':
        return `Contract data entry updated`;

      case 'contract_data_removed':
        return `Contract data entry removed`;

      case 'contract_created':
        return `Contract created`;

      case 'contract_updated':
        return `Contract updated`;

      case 'contract_removed':
        return `Contract removed`;

      default:
        return effect.type.replace(/_/g, ' ');
    }
  };

  const getEffectColor = (type: string) => {
    if (type.includes('credited') || type.includes('created') || type.includes('authorized')) {
      return 'border-l-green-500 bg-green-50';
    }
    if (type.includes('debited') || type.includes('burned') || type.includes('removed') || type.includes('deauthorized')) {
      return 'border-l-red-500 bg-red-50';
    }
    if (type.includes('updated') || type.includes('trade')) {
      return 'border-l-blue-500 bg-blue-50';
    }
    return 'border-l-gray-500 bg-gray-50';
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Ledger Effects</h2>
        <p className="text-sm text-gray-600">All ledger effects including account credits, debits, and state changes</p>
      </div>

      <div className="space-y-3">
        {allEffects.map((effect, index) => (
          <div
            key={index}
            className={`border-2 rounded-lg p-4 ${getEffectColor(effect.type)} shadow-sm hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {getEffectIcon(effect.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-300">
                    #{index + 1}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                    {effect.type.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <p className="text-base font-semibold text-gray-900 mb-2">
                  {getEffectDescription(effect)}
                </p>

                {/* Contract Data Display */}
                {(effect as any).contractId && (
                  <div className="mt-3 space-y-2">
                    <div className="p-2 bg-white rounded border border-gray-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 mb-1">Contract ID:</p>
                          <p className="font-mono text-sm text-gray-900 break-all select-all cursor-pointer hover:bg-gray-50 transition-colors">{(effect as any).contractId}</p>
                        </div>
                        <CopyButton text={(effect as any).contractId} />
                      </div>
                    </div>

                    {(effect as any).keyDisplay && (
                      <div className="p-2 bg-blue-50 rounded border border-blue-200">
                        <p className="text-xs font-medium text-blue-700 mb-1">Key:</p>
                        <p className="font-mono text-sm text-blue-900 break-all">{(effect as any).keyDisplay}</p>
                      </div>
                    )}

                    {(effect as any).valueDisplay && (effect as any).type !== 'removed' && (
                      <div className="p-2 bg-green-50 rounded border border-green-200">
                        <p className="text-xs font-medium text-green-700 mb-1">Value:</p>
                        <p className="font-mono text-sm text-green-900 break-all whitespace-pre-wrap">{(effect as any).valueDisplay}</p>
                      </div>
                    )}

                    {(effect as any).storageType && (
                      <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-gray-200">
                        <span className="text-xs text-gray-500">Storage Type:</span>
                        <span className="font-semibold text-gray-900">{(effect as any).storageType}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* TTL Extension Display */}
                {(effect as any).extendTo && (
                  <div className="mt-3 space-y-2">
                    <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-gray-200">
                      <span className="text-xs text-gray-500">Extended to Ledger:</span>
                      <span className="font-semibold text-gray-900">{(effect as any).extendTo}</span>
                    </div>
                    {(effect as any).keyHash && (
                      <div className="p-2 bg-white rounded border border-gray-200">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-500 mb-1">Entry Key Hash:</p>
                            <p className="font-mono text-sm text-gray-900 break-all select-all cursor-pointer hover:bg-gray-50 transition-colors">{(effect as any).keyHash}</p>
                          </div>
                          <CopyButton text={(effect as any).keyHash} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {effect.account && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-1">Account Address:</p>
                        <p className="font-mono text-sm text-gray-900 break-all select-all cursor-pointer hover:bg-gray-50 transition-colors">{effect.account}</p>
                      </div>
                      <CopyButton text={effect.account} />
                    </div>
                  </div>
                )}
                {effect.amount && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-1">Amount:</p>
                        <p className="font-semibold text-gray-900 select-all cursor-pointer hover:bg-gray-50 transition-colors">{formatAmount(effect.amount)} {formatAsset(effect)}</p>
                      </div>
                      <CopyButton text={effect.amount} />
                    </div>
                  </div>
                )}
                {getAssetIssuer(effect) && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-1">Asset Issuer:</p>
                        <p className="font-mono text-sm text-gray-900 break-all select-all cursor-pointer hover:bg-gray-50 transition-colors">{getAssetIssuer(effect)}</p>
                      </div>
                      <CopyButton text={getAssetIssuer(effect) || ''} />
                    </div>
                  </div>
                )}
                {(effect as any).balance_id && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-1">Balance ID:</p>
                        <p className="font-mono text-sm text-gray-900 break-all select-all cursor-pointer hover:bg-gray-50 transition-colors">{(effect as any).balance_id}</p>
                      </div>
                      <CopyButton text={(effect as any).balance_id} />
                    </div>
                  </div>
                )}
                {effect.limit && (
                  <div className="mt-2 inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-gray-200">
                    <span className="text-xs text-gray-500">Limit:</span>
                    <span className="font-semibold text-gray-900">{formatAmount(effect.limit)}</span>
                  </div>
                )}
                {(effect as any).starting_balance && (
                  <div className="mt-2 inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-gray-200">
                    <span className="text-xs text-gray-500">Starting Balance:</span>
                    <span className="font-semibold text-gray-900">{formatAmount((effect as any).starting_balance)} XLM</span>
                  </div>
                )}
                {((effect as any).name_base64 || (effect as any).value_base64) && (
                  <div className="mt-2 p-2 bg-indigo-50 rounded border border-indigo-200">
                    <p className="text-xs font-medium text-indigo-700 mb-1">Original Base64 Values:</p>
                    {(effect as any).name_base64 && (
                      <div className="mb-1">
                        <span className="text-xs text-indigo-600">Name: </span>
                        <span className="font-mono text-xs text-indigo-900 break-all">{(effect as any).name_base64}</span>
                      </div>
                    )}
                    {(effect as any).value_base64 && (
                      <div>
                        <span className="text-xs text-indigo-600">Value: </span>
                        <span className="font-mono text-xs text-indigo-900 break-all">{(effect as any).value_base64}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
