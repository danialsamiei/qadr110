import { getRpcBaseUrl } from '@/services/rpc-client';
import {
  SupplyChainServiceClient,
  type GetShippingRatesResponse,
  type GetChokepointStatusResponse,
  type GetCriticalMineralsResponse,
  type ShippingIndex,
  type ChokepointInfo,
  type CriticalMineral,
  type MineralProducer,
  type ShippingRatePoint,
} from '@/generated/client/worldmonitor/supply_chain/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';

export type {
  GetShippingRatesResponse,
  GetChokepointStatusResponse,
  GetCriticalMineralsResponse,
  ShippingIndex,
  ChokepointInfo,
  CriticalMineral,
  MineralProducer,
  ShippingRatePoint,
};

const client = new SupplyChainServiceClient(getRpcBaseUrl(), { fetch: (...args) => globalThis.fetch(...args) });

const shippingBreaker = createCircuitBreaker<GetShippingRatesResponse>({ name: 'Shipping Rates', cacheTtlMs: 60 * 60 * 1000, persistCache: true });
const chokepointBreaker = createCircuitBreaker<GetChokepointStatusResponse>({ name: 'Chokepoint Status', cacheTtlMs: 5 * 60 * 1000, persistCache: true });
const mineralsBreaker = createCircuitBreaker<GetCriticalMineralsResponse>({ name: 'Critical Minerals', cacheTtlMs: 24 * 60 * 60 * 1000, persistCache: true });

const emptyShipping: GetShippingRatesResponse = { indices: [], fetchedAt: '', upstreamUnavailable: false };
const emptyChokepoints: GetChokepointStatusResponse = { chokepoints: [], fetchedAt: '', upstreamUnavailable: false };
const emptyMinerals: GetCriticalMineralsResponse = { minerals: [], fetchedAt: '', upstreamUnavailable: false };

function markShippingUnavailable(): GetShippingRatesResponse {
  return { ...emptyShipping, upstreamUnavailable: true };
}

function markChokepointsUnavailable(): GetChokepointStatusResponse {
  return { ...emptyChokepoints, upstreamUnavailable: true };
}

function markMineralsUnavailable(): GetCriticalMineralsResponse {
  return { ...emptyMinerals, upstreamUnavailable: true };
}

export async function fetchShippingRates(): Promise<GetShippingRatesResponse> {
  const hydrated = getHydratedData('shippingRates') as GetShippingRatesResponse | undefined;
  if (hydrated?.indices?.length) return hydrated;

  try {
    return await shippingBreaker.execute(async () => {
      return client.getShippingRates({});
    }, emptyShipping);
  } catch {
    return markShippingUnavailable();
  }
}

export async function fetchChokepointStatus(): Promise<GetChokepointStatusResponse> {
  const hydrated = getHydratedData('chokepoints') as GetChokepointStatusResponse | undefined;
  if (hydrated?.chokepoints?.length) return hydrated;

  try {
    return await chokepointBreaker.execute(async () => {
      return client.getChokepointStatus({});
    }, emptyChokepoints);
  } catch {
    return markChokepointsUnavailable();
  }
}

export async function fetchCriticalMinerals(): Promise<GetCriticalMineralsResponse> {
  const hydrated = getHydratedData('minerals') as GetCriticalMineralsResponse | undefined;
  if (hydrated?.minerals?.length) return hydrated;

  try {
    return await mineralsBreaker.execute(async () => {
      return client.getCriticalMinerals({});
    }, emptyMinerals);
  } catch {
    return markMineralsUnavailable();
  }
}
