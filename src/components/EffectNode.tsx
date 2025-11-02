import React from 'react';
import { TrendingUp, TrendingDown, Plus, Minus, DollarSign } from 'lucide-react';
import type { NodeProps } from 'reactflow';

interface EffectNodeData {
  effect: any;
  parentOperationIndex: number;
  effectIndex: number;
}

export function EffectNode({ data }: NodeProps<EffectNodeData>) {
  const { effect, parentOperationIndex, effectIndex } = data;

  const formatAccountId = (id: string) => {
    if (!id || id.length < 10) return id;
    return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return num.toLocaleString(undefined, { maximumFractionDigits: 7 });
  };

  // Determine effect type and styling
  const getEffectInfo = () => {
    const type = effect.type || '';

    if (type.includes('debited') || type.includes('account_debited')) {
      return {
        icon: TrendingDown,
        color: 'bg-red-50 border-red-300',
        iconColor: 'text-red-600',
        label: 'Debited',
        textColor: 'text-red-700'
      };
    }

    if (type.includes('credited') || type.includes('account_credited')) {
      return {
        icon: TrendingUp,
        color: 'bg-green-50 border-green-300',
        iconColor: 'text-green-600',
        label: 'Credited',
        textColor: 'text-green-700'
      };
    }

    if (type.includes('created') || type.includes('trustline_created')) {
      return {
        icon: Plus,
        color: 'bg-blue-50 border-blue-300',
        iconColor: 'text-blue-600',
        label: 'Created',
        textColor: 'text-blue-700'
      };
    }

    if (type.includes('removed') || type.includes('trustline_removed')) {
      return {
        icon: Minus,
        color: 'bg-gray-50 border-gray-300',
        iconColor: 'text-gray-600',
        label: 'Removed',
        textColor: 'text-gray-700'
      };
    }

    return {
      icon: DollarSign,
      color: 'bg-gray-50 border-gray-300',
      iconColor: 'text-gray-600',
      label: type.replace(/_/g, ' '),
      textColor: 'text-gray-700'
    };
  };

  const effectInfo = getEffectInfo();
  const Icon = effectInfo.icon;

  // Build effect description
  let title = effectInfo.label;
  let details: Array<{ label: string; value: string }> = [];

  const asset = effect.asset_type === 'native'
    ? 'XLM'
    : effect.asset_code || effect.asset_type || '';

  const amount = effect.amount ? formatAmount(effect.amount) : '';
  const account = effect.account ? formatAccountId(effect.account) : '';

  if (amount && asset) {
    title = `${effectInfo.label} ${amount} ${asset}`;
  }

  if (account) {
    details.push({ label: 'Account', value: account });
  }

  if (effect.from && effect.to) {
    details.push({ label: 'From', value: formatAccountId(effect.from) });
    details.push({ label: 'To', value: formatAccountId(effect.to) });
  }

  if (effect.balance) {
    details.push({ label: 'New Balance', value: formatAmount(effect.balance) });
  }

  if (effect.limit) {
    details.push({ label: 'Limit', value: formatAmount(effect.limit) });
  }

  return (
    <div className={`rounded-lg border-2 ${effectInfo.color} p-4 shadow-md w-auto`} style={{ minWidth: '280px', maxWidth: '450px', width: 'fit-content' }}>
      <div className="flex items-start gap-2 mb-2">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${effectInfo.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-base font-semibold ${effectInfo.textColor}`}>
            {title}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Effect #{effectIndex + 1}
          </div>
        </div>
      </div>

      {details.length > 0 && (
        <div className="space-y-1.5 text-sm">
          {details.map((detail, idx) => (
            <div key={idx}>
              <span className="text-gray-600">{detail.label}:</span>{' '}
              <span className="font-mono font-medium text-gray-900">{detail.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
