import type { AdapterHealth, InteroperabilityAdapter, InteroperabilityContext } from './contracts';
import { DEFAULT_INTEROPERABILITY_ADAPTERS } from './adapters';

export class InteroperabilityAdapterRegistry {
  constructor(private readonly adapters: InteroperabilityAdapter[]) {}

  listAdapters(): InteroperabilityAdapter[] {
    return [...this.adapters];
  }

  getAdapter(adapterId: string): InteroperabilityAdapter | undefined {
    return this.adapters.find((adapter) => adapter.id === adapterId);
  }

  getHealth(adapterId: string, context: InteroperabilityContext): AdapterHealth | undefined {
    const adapter = this.getAdapter(adapterId);
    return adapter?.getHealth(context);
  }

  buildSnapshot(context: InteroperabilityContext): Array<InteroperabilityAdapter & { health: AdapterHealth }> {
    return this.adapters.map((adapter) => ({
      ...adapter,
      health: adapter.getHealth(context),
    }));
  }
}

export const DEFAULT_INTEROPERABILITY_REGISTRY = new InteroperabilityAdapterRegistry(DEFAULT_INTEROPERABILITY_ADAPTERS);
