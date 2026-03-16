import { DEFAULT_PLATFORM_ADAPTERS } from './catalog';
import type {
  AdapterAvailability,
  AdapterStatusSnapshot,
  CapabilityAdapterManifest,
  CapabilityContract,
  CapabilityKind,
  CapabilityRegistryContext,
} from './contracts';

function toSet(values?: Iterable<string>): Set<string> {
  return new Set(values ?? []);
}

function resolveAvailability(
  manifest: CapabilityAdapterManifest,
  context: CapabilityRegistryContext,
): AdapterStatusSnapshot {
  const enabledFeatures = toSet(context.enabledFeatures);
  const configuredKeys = toSet(context.configuredKeys);
  const missingFlags = manifest.runtimeFeatureFlags.filter((flag) => enabledFeatures.size > 0 && !enabledFeatures.has(flag));
  const missingConfig = manifest.requiredConfigKeys.filter((key) => !configuredKeys.has(key));

  let availability: AdapterAvailability = 'available';
  if (missingFlags.length > 0) {
    availability = 'disabled';
  } else if (missingConfig.length > 0) {
    availability = 'missing-configuration';
  } else if (manifest.requiredConfigKeys.length > 0) {
    availability = 'configured';
  }

  return {
    adapterId: manifest.id,
    availability,
    missingFlags,
    missingConfig,
    degradation: manifest.degradation,
  };
}

export class CapabilityRegistry {
  constructor(private readonly manifests: CapabilityAdapterManifest[]) {}

  listAdapters(): CapabilityAdapterManifest[] {
    return [...this.manifests];
  }

  listCapabilities(kind?: CapabilityKind): CapabilityContract[] {
    const capabilities = this.manifests.flatMap((manifest) => manifest.capabilities);
    return kind ? capabilities.filter((entry) => entry.kind === kind) : capabilities;
  }

  getAdapter(adapterId: string): CapabilityAdapterManifest | undefined {
    return this.manifests.find((manifest) => manifest.id === adapterId);
  }

  getStatus(adapterId: string, context: CapabilityRegistryContext = {}): AdapterStatusSnapshot | undefined {
    const manifest = this.getAdapter(adapterId);
    return manifest ? resolveAvailability(manifest, context) : undefined;
  }

  buildSnapshot(context: CapabilityRegistryContext = {}): Array<CapabilityAdapterManifest & { status: AdapterStatusSnapshot }> {
    return this.manifests.map((manifest) => ({
      ...manifest,
      status: resolveAvailability(manifest, context),
    }));
  }

  listCapabilityKinds(): CapabilityKind[] {
    return [...new Set(this.listCapabilities().map((entry) => entry.kind))];
  }
}

export const DEFAULT_CAPABILITY_REGISTRY = new CapabilityRegistry(DEFAULT_PLATFORM_ADAPTERS);
