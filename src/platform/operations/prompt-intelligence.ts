import type { AssistantDomainMode } from '../ai/assistant-contracts';
import type { AiTaskClass } from '../ai/contracts';
import type { OrchestratorRouteClass } from '../ai/orchestrator-contracts';
import type { MapContextEnvelope } from './map-context';

export const PROMPT_INTELLIGENCE_EVENT_TYPES = {
  run: 'qadr110:prompt-intelligence-run',
  stateChanged: 'qadr110:prompt-intelligence-state-changed',
} as const;

export type PromptSuggestionCategory =
  | 'osint'
  | 'forecast'
  | 'risk'
  | 'strategy'
  | 'deep-analysis';

export interface PromptSuggestionScoreBreakdown {
  base: number;
  map: number;
  layers: number;
  trends: number;
  scenario: number;
  session: number;
  freshness: number;
  total: number;
}

export interface PromptIntelligenceAgentProfile {
  role: string;
  mission: string;
  analyzes: string[];
  suggests: string[];
  outputContract: string[];
}

export const PROMPT_INTELLIGENCE_AGENT_PROFILE: PromptIntelligenceAgentProfile = {
  role: 'Prompt Intelligence Agent',
  mission: 'تحلیل پیوسته intent کاربر، context نقشه و state سناریو برای تولید promptهای عمیق‌تر، زاویه‌های جایگزین و queryهای راهبردی بهتر.',
  analyzes: ['user intent', 'map context', 'scenario state'],
  suggests: ['deeper questions', 'alternative perspectives', 'strategic queries'],
  outputContract: ['5-10 prompts', 'why it matters', 'expected insight'],
};

export interface PromptSuggestionItem {
  id: string;
  category: PromptSuggestionCategory;
  label: string;
  why: string;
  expectedInsight: string;
  query: string;
  promptText: string;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  score: number;
  scoreBreakdown: PromptSuggestionScoreBreakdown;
  orchestratorRoute: OrchestratorRouteClass;
  routeLabel: string;
}

export interface PromptSuggestionState {
  updatedAt: string;
  anchorLabel: string;
  suggestions: PromptSuggestionItem[];
}

export interface PromptSuggestionRunDetail {
  source: 'floating-panel' | 'map-aware-overlay' | 'scenario-map-overlay';
  suggestion: PromptSuggestionItem;
  mapContext?: MapContextEnvelope | null;
  autoSubmit: boolean;
}

export function dispatchPromptSuggestionRun(target: EventTarget, detail: PromptSuggestionRunDetail): boolean {
  return target.dispatchEvent(new CustomEvent<PromptSuggestionRunDetail>(PROMPT_INTELLIGENCE_EVENT_TYPES.run, { detail }));
}

export function dispatchPromptSuggestionStateChanged(target: EventTarget, detail: PromptSuggestionState): boolean {
  return target.dispatchEvent(new CustomEvent<PromptSuggestionState>(PROMPT_INTELLIGENCE_EVENT_TYPES.stateChanged, { detail }));
}
