export type CapabilityKind =
  | 'ingestion'
  | 'search'
  | 'retrieval'
  | 'correlation'
  | 'geospatial-enrichment'
  | 'vector-retrieval'
  | 'scenario-analysis'
  | 'resilience-scoring'
  | 'report-generation';

export type AdapterCategory =
  | 'ai'
  | 'osint'
  | 'investigation'
  | 'geospatial'
  | 'storage'
  | 'interoperability'
  | 'workforce';

export type AdapterAvailability =
  | 'configured'
  | 'available'
  | 'missing-configuration'
  | 'disabled';

export interface CapabilityContract {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  evidenceAware?: boolean;
  geoAware?: boolean;
}

export interface AdapterDegradationMode {
  mode: 'hide' | 'readonly' | 'cached' | 'manual';
  message: string;
}

export interface AdapterLifecycleHooks {
  validate?: (context: CapabilityRegistryContext) => boolean | Promise<boolean>;
  onConfigure?: (context: CapabilityRegistryContext) => void | Promise<void>;
  onStart?: (context: CapabilityRegistryContext) => void | Promise<void>;
  onStop?: (context: CapabilityRegistryContext) => void | Promise<void>;
}

export interface CapabilityAdapterManifest {
  id: string;
  displayName: string;
  category: AdapterCategory;
  vendorNeutralFamily: string;
  capabilities: CapabilityContract[];
  runtimeFeatureFlags: string[];
  requiredConfigKeys: string[];
  optionalConfigKeys?: string[];
  interoperabilityTags: string[];
  openSource: boolean;
  licenseNotes: string;
  degradation: AdapterDegradationMode;
  lifecycle?: AdapterLifecycleHooks;
}

export interface CapabilityRegistryContext {
  enabledFeatures?: Iterable<string>;
  configuredKeys?: Iterable<string>;
  transport?: 'web' | 'tauri' | 'server' | 'worker';
}

export interface AdapterStatusSnapshot {
  adapterId: string;
  availability: AdapterAvailability;
  missingFlags: string[];
  missingConfig: string[];
  degradation: AdapterDegradationMode;
}
