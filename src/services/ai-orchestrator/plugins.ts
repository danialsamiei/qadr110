import type { OrchestratorToolName } from '@/platform/ai/orchestrator-contracts';

import type { OrchestratorToolContext, OrchestratorToolResult } from './types';

export interface OrchestratorTool {
  name: OrchestratorToolName;
  execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult>;
}

export class OrchestratorToolRegistry {
  private readonly tools = new Map<OrchestratorToolName, OrchestratorTool>();

  constructor(tools: OrchestratorTool[] = []) {
    tools.forEach((tool) => this.register(tool));
  }

  register(tool: OrchestratorTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: OrchestratorToolName): OrchestratorTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Missing orchestrator tool: ${name}`);
    }
    return tool;
  }
}
