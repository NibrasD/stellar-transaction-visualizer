import * as StellarSdk from '@stellar/stellar-sdk';
import { simpleContractMetadataService, ContractMetadata } from './simpleContractMetadata';

export interface ProcessedEffect {
  type: string;
  account?: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
  asset_type?: string;
  description: string;
  contractId?: string;
  raw?: any;
}

export async function processEventsToEffects(
  events: any[],
  contractId: string
): Promise<ProcessedEffect[]> {
  const effects: ProcessedEffect[] = [];

  if (!events || events.length === 0) {
    return effects;
  }

  for (const event of events) {
    try {
      // Use the event's own contractId if available, otherwise use the passed contractId
      const eventContractId = event.contractId || contractId;
      const metadata = await simpleContractMetadataService.getContractMetadata(eventContractId);

      const processedEffect = await processEventDynamically(event, eventContractId, metadata);
      if (processedEffect) {
        effects.push(processedEffect);
      }
    } catch (error) {
      const eventContractId = event.contractId || contractId;
      effects.push({
        type: 'contract_event',
        description: `Event from contract ${eventContractId.substring(0, 8)}...`,
        contractId: eventContractId,
        raw: event
      });
    }
  }

  return effects;
}

async function processEventDynamically(
  event: any,
  contractId: string,
  metadata: ContractMetadata | null
): Promise<ProcessedEffect | null> {
  if (!event || !event.topics || event.topics.length === 0) {
    return null;
  }

  const eventType = String(event.topics[0]).toLowerCase();
  const topics = event.topics.slice(1);
  const data = Array.isArray(event.data) ? event.data : [];

  if (metadata?.isToken) {
    return processTokenEvent(eventType, topics, data, contractId, metadata);
  }

  return processGenericEvent(eventType, topics, data, contractId);
}

function processTokenEvent(
  eventType: string,
  topics: any[],
  data: any[],
  contractId: string,
  metadata: ContractMetadata
): ProcessedEffect | null {
  const tokenSymbol = metadata.tokenSymbol || 'tokens';
  const tokenDecimals = metadata.tokenDecimals ?? 7;

  let fromAccount = '';
  let toAccount = '';
  let amount = '';

  switch (eventType) {
    case 'transfer':
      if (topics.length >= 2) {
        fromAccount = String(topics[0]);
        toAccount = String(topics[1]);
      }
      break;
    case 'mint':
      if (topics.length >= 1) {
        toAccount = String(topics[0]);
      }
      break;
    case 'burn':
      if (topics.length >= 1) {
        fromAccount = String(topics[0]);
      }
      break;
    case 'approve':
      if (topics.length >= 2) {
        fromAccount = String(topics[0]);
        toAccount = String(topics[1]);
      }
      break;
    default:
      return null;
  }

  if (data.length > 0) {
    const amountValue = data[0];
    if (typeof amountValue === 'number' || typeof amountValue === 'string' || typeof amountValue === 'bigint') {
      amount = String(amountValue);
    }
  }

  if (amount) {
    const formattedAmount = simpleContractMetadataService.formatAmount(amount, tokenDecimals);

    switch (eventType) {
      case 'transfer':
        return {
          type: 'token_transfer',
          account: fromAccount,
          amount: formattedAmount,
          asset_code: tokenSymbol,
          description: `${formattedAmount} ${tokenSymbol} transferred from ${formatAddress(fromAccount)} to ${formatAddress(toAccount)}`,
          contractId
        };
      case 'mint':
        return {
          type: 'token_mint',
          account: toAccount,
          amount: formattedAmount,
          asset_code: tokenSymbol,
          description: `${formattedAmount} ${tokenSymbol} minted to ${formatAddress(toAccount)}`,
          contractId
        };
      case 'burn':
        return {
          type: 'token_burn',
          account: fromAccount,
          amount: formattedAmount,
          asset_code: tokenSymbol,
          description: `${formattedAmount} ${tokenSymbol} burned from ${formatAddress(fromAccount)}`,
          contractId
        };
      case 'approve':
        return {
          type: 'token_approval',
          account: fromAccount,
          amount: formattedAmount,
          asset_code: tokenSymbol,
          description: `${formatAddress(fromAccount)} approved ${formattedAmount} ${tokenSymbol} for ${formatAddress(toAccount)}`,
          contractId
        };
    }
  }

  return null;
}

function processGenericEvent(
  eventType: string,
  topics: any[],
  data: any[],
  contractId: string
): ProcessedEffect {
  const topicsStr = topics.length > 0 ? `with ${topics.length} topic(s)` : '';
  const dataStr = data.length > 0 ? `and ${data.length} data field(s)` : '';

  return {
    type: 'contract_event',
    description: `Event '${eventType}' ${topicsStr} ${dataStr}`.trim(),
    contractId,
    raw: { eventType, topics, data }
  };
}

function formatAddress(address: string): string {
  if (!address || address.length < 12) {
    return address;
  }
  return `${address.substring(0, 4)}…${address.substring(address.length - 4)}`;
}
