import { DEFAULT_INTEROPERABILITY_REGISTRY } from '@/platform/interoperability';
import type { InteroperabilityContext } from '@/platform/interoperability';
import { getConfiguredRuntimeKeys, getConfiguredRuntimeValues, getEnabledRuntimeFeatures } from './runtime-config';

export function createInteroperabilityContext(
  transport: InteroperabilityContext['transport'] = 'web',
): InteroperabilityContext {
  return {
    enabledFeatures: new Set(getEnabledRuntimeFeatures()),
    configuredKeys: new Set(getConfiguredRuntimeKeys()),
    configValues: getConfiguredRuntimeValues(),
    transport,
    now: new Date().toISOString(),
  };
}

export function getInteroperabilityRegistry() {
  return DEFAULT_INTEROPERABILITY_REGISTRY;
}

export function buildInteroperabilitySnapshot(
  transport: InteroperabilityContext['transport'] = 'web',
) {
  return DEFAULT_INTEROPERABILITY_REGISTRY.buildSnapshot(createInteroperabilityContext(transport));
}
