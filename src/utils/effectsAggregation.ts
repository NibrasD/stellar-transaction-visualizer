import type { TransactionEffect } from '../types/stellar';

export const getAssetKey = (effect: TransactionEffect): string => {
  if (effect.asset_type === 'native') {
    return 'XLM';
  }
  if (effect.asset_code) {
    return effect.asset_code;
  }
  if ((effect as any).asset) {
    const asset = (effect as any).asset;
    if (typeof asset === 'string') {
      if (asset.includes(':')) {
        return asset.split(':')[0];
      }
      return asset;
    }
  }
  return 'Unknown';
};

export const isContractAddress = (asset: string): boolean => {
  return asset.length > 50 && /^[A-Z0-9]+$/.test(asset);
};

export const getAssetPriority = (effect: TransactionEffect): number => {
  const asset = getAssetKey(effect);

  // Native XLM gets highest priority
  if (effect.asset_type === 'native') return 100;
  // Named asset codes (USDC, etc.)
  if (effect.asset_code) return 100;
  // Asset in CODE:ISSUER format
  if ((effect as any).asset && typeof (effect as any).asset === 'string' && (effect as any).asset.includes(':')) {
    return 90;
  }
  // Contract addresses get lowest priority
  if (isContractAddress(asset)) return 0;
  return 50;
};

export const filterInternalEffects = (effects: TransactionEffect[]): TransactionEffect[] => {
  const internalTypes = [
    'updated',
    'created',
    'restored',
    'contract_data_created',
    'contract_data_updated',
    'contract_data_removed',
    'contract_created',
    'contract_updated',
    'contract_removed'
  ];

  return effects.filter(effect => {
    if (internalTypes.includes(effect.type)) {
      return false;
    }

    if (effect.type === 'account_credited' || effect.type === 'account_debited' ||
        effect.type === 'contract_credited' || effect.type === 'contract_debited' ||
        effect.type === 'account_minted') {
      if (!effect.amount || !effect.account) {
        return false;
      }
      const amount = parseFloat(effect.amount);
      if (isNaN(amount)) {
        return false;
      }
    }

    return true;
  });
};

export const aggregateBalanceChanges = (effects: TransactionEffect[]): TransactionEffect[] => {
  const aggregated = new Map<string, TransactionEffect>();

  effects.forEach(effect => {
    if (effect.type === 'account_credited' || effect.type === 'account_debited' ||
        effect.type === 'contract_credited' || effect.type === 'contract_debited' ||
        effect.type === 'account_minted') {
      const asset = getAssetKey(effect);
      const key = `${effect.account}-${asset}`;

      const amount = parseFloat(effect.amount || '0');
      const isCredit = effect.type === 'account_credited' || effect.type === 'contract_credited' || effect.type === 'account_minted';
      const delta = isCredit ? amount : -amount;
      const baseType = effect.type.includes('contract') ? 'contract' : 'account';

      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        const existingAmount = parseFloat(existing.amount || '0');
        const newAmount = existingAmount + delta;

        const existingPriority = getAssetPriority(existing);
        const currentPriority = getAssetPriority(effect);

        aggregated.set(key, {
          ...(currentPriority > existingPriority ? effect : existing),
          amount: String(Math.abs(newAmount)),
          type: newAmount >= 0 ? `${baseType}_credited` : `${baseType}_debited`
        });
      } else {
        aggregated.set(key, {
          ...effect,
          amount: String(Math.abs(delta)),
          type: delta >= 0 ? `${baseType}_credited` : `${baseType}_debited`
        });
      }
    } else {
      const key = `${effect.type}-${effect.account || ''}-${Date.now()}-${Math.random()}`;
      aggregated.set(key, effect);
    }
  });

  const accountAssetMap = new Map<string, TransactionEffect[]>();

  Array.from(aggregated.values()).forEach(effect => {
    if (effect.type === 'account_credited' || effect.type === 'account_debited' ||
        effect.type === 'contract_credited' || effect.type === 'contract_debited' ||
        effect.type === 'account_minted') {
      const accountKey = effect.account || '';
      if (!accountAssetMap.has(accountKey)) {
        accountAssetMap.set(accountKey, []);
      }
      accountAssetMap.get(accountKey)!.push(effect);
    }
  });

  const filtered = Array.from(aggregated.values()).filter(effect => {
    if (effect.type !== 'account_credited' && effect.type !== 'account_debited' &&
        effect.type !== 'contract_credited' && effect.type !== 'contract_debited' &&
        effect.type !== 'account_minted') {
      return true;
    }

    const accountKey = effect.account || '';
    const accountEffects = accountAssetMap.get(accountKey) || [];

    if (accountEffects.length > 1) {
      const effectAsset = getAssetKey(effect);
      const isContractAddr = isContractAddress(effectAsset);

      const hasNamedAsset = accountEffects.some(e => {
        const asset = getAssetKey(e);
        return !isContractAddress(asset) && getAssetPriority(e) > 50;
      });

      if (isContractAddr && hasNamedAsset) {
        return false;
      }
    }

    const amount = parseFloat(effect.amount || '0');
    return amount > 0;
  });

  return filtered;
};

export const getMeaningfulEffectsCount = (effects: TransactionEffect[]): number => {
  const filtered = filterInternalEffects(effects);
  const aggregated = aggregateBalanceChanges(filtered);
  return aggregated.length;
};

export const aggregateSorobanEffects = (rawEffects: TransactionEffect[], processedEffects: any[]): any[] => {
  const filtered = filterInternalEffects(rawEffects);

  const aggregated = aggregateBalanceChanges(filtered);

  const accountEffectMap = new Map<string, any>();

  processedEffects.forEach(effect => {
    const key = `${effect.accountId}-${effect.asset}-${effect.type}`;

    if (accountEffectMap.has(key)) {
      const existing = accountEffectMap.get(key)!;
      const existingAmount = parseFloat(existing.amount);
      const newAmount = parseFloat(effect.amount);
      accountEffectMap.set(key, {
        ...existing,
        amount: String(existingAmount + newAmount)
      });
    } else {
      accountEffectMap.set(key, effect);
    }
  });

  const result = Array.from(accountEffectMap.values());

  return result;
};
