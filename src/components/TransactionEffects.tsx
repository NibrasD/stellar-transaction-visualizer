import React from 'react';
import { TrendingUp, TrendingDown, Wallet, Shield, Users, ArrowRightLeft } from 'lucide-react';
import type { TransactionEffect } from '../types/stellar';

interface TransactionEffectsProps {
  effects: TransactionEffect[];
}

export function TransactionEffects({ effects }: TransactionEffectsProps) {
  if (!effects || effects.length === 0) {
    return null;
  }

  const getEffectIcon = (type: string) => {
    if (type.includes('credited') || type.includes('mint') || type.includes('claimable_balance_created')) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    }
    if (type.includes('debited') || type.includes('removed') || type.includes('claimable_balance_claimed')) {
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
    return <Wallet className="w-4 h-4 text-gray-600" />;
  };

  const formatAmount = (amount?: string) => {
    if (!amount) return '';
    const num = parseFloat(amount);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
  };

  const formatAsset = (effect: TransactionEffect) => {
    if (effect.asset_type === 'native') {
      return 'XLM';
    }
    if (effect.asset_code) {
      return effect.asset_code;
    }
    return 'Unknown Asset';
  };

  const getEffectDescription = (effect: TransactionEffect) => {
    const asset = formatAsset(effect);
    const amount = formatAmount(effect.amount);

    switch (effect.type) {
      case 'account_credited':
        return `Credited ${amount} ${asset} to ${effect.account?.substring(0, 8)}...`;

      case 'account_debited':
        return `Debited ${amount} ${asset} from ${effect.account?.substring(0, 8)}...`;

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

      default:
        return effect.type.replace(/_/g, ' ');
    }
  };

  const getEffectColor = (type: string) => {
    if (type.includes('credited') || type.includes('created') || type.includes('authorized')) {
      return 'border-l-green-500 bg-green-50';
    }
    if (type.includes('debited') || type.includes('removed') || type.includes('deauthorized')) {
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Effects</h2>
      </div>

      <div className="space-y-3">
        {effects.map((effect, index) => (
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
                {effect.account && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Account Address:</p>
                    <p className="font-mono text-sm text-gray-900 break-all">{effect.account}</p>
                  </div>
                )}
                {effect.amount && (
                  <div className="mt-2 inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-gray-200">
                    <span className="text-xs text-gray-500">Amount:</span>
                    <span className="font-semibold text-gray-900">{formatAmount(effect.amount)} {formatAsset(effect)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {effects.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-600">No effects recorded for this transaction.</p>
        </div>
      )}
    </div>
  );
}
