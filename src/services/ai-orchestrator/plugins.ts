import type {
  OrchestratorIntent,
  SourceRecord,
  ToolExecutionContext,
  ToolPlugin,
  ToolPluginId,
  ToolResult,
} from './types';

function inferReliability(provider: ToolPluginId, intent: OrchestratorIntent): number {
  const base: Record<ToolPluginId, number> = {
    'web-search': 0.58,
    gdelt: 0.72,
    netblocks: 0.81,
    'google-trends': 0.66,
    'media-pipelines': 0.75,
    'internal-panels': 0.8,
  };

  if (intent === 'conflict-monitoring' && provider === 'netblocks') return 0.88;
  if (intent === 'media-monitoring' && provider === 'media-pipelines') return 0.84;
  if (intent === 'trend-analysis' && provider === 'google-trends') return 0.83;
  return base[provider];
}

function makeSource(provider: ToolPluginId, query: string, intent: OrchestratorIntent, idx: number): SourceRecord {
  return {
    id: `${provider}-${idx}`,
    title: `${provider} signal for: ${query}`,
    provider,
    publishedAt: new Date().toISOString(),
    reliability: inferReliability(provider, intent),
  };
}

class StaticToolPlugin implements ToolPlugin {
  constructor(
    public readonly id: ToolPluginId,
    private readonly description: string,
    private readonly riskFlags: string[] = [],
  ) {}

  async execute(context: ToolExecutionContext): Promise<ToolResult> {
    const started = performance.now();

    const sources = [makeSource(this.id, context.query, context.intent, 1)];
    const primarySource = sources[0];
    const latencyMs = Math.max(1, Math.round(performance.now() - started));

    return {
      pluginId: this.id,
      summary: `${this.description}: ${context.query}`,
      sources,
      latencyMs,
      confidence: Math.min(0.95, Math.max(0.4, primarySource ? (primarySource.reliability ?? 0.5) : 0.5)),
      riskFlags: this.riskFlags,
    };
  }
}

export function createDefaultToolPlugins(): ToolPlugin[] {
  return [
    new StaticToolPlugin('web-search', 'Web intelligence snapshot'),
    new StaticToolPlugin('gdelt', 'GDELT event stream correlation'),
    new StaticToolPlugin('netblocks', 'Connectivity disruption telemetry', ['connectivity-instability']),
    new StaticToolPlugin('google-trends', 'Search trend acceleration'),
    new StaticToolPlugin('media-pipelines', 'Media narrative extraction', ['narrative-polarization']),
    new StaticToolPlugin('internal-panels', 'Internal dashboard KPIs'),
  ];
}

export class ToolPluginRegistry {
  private readonly plugins = new Map<ToolPluginId, ToolPlugin>();

  constructor(plugins: ToolPlugin[]) {
    for (const plugin of plugins) {
      this.plugins.set(plugin.id, plugin);
    }
  }

  get(id: ToolPluginId): ToolPlugin {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Missing tool plugin: ${id}`);
    }
    return plugin;
  }
}
