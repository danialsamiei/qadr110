import { CHROME_UA } from './constants';
import { getAiProviderOrder, getProviderModel } from '../../src/platform/ai/policy';
import type { AiGatewayProvider } from '../../src/platform/ai/contracts';

export type LlmRoutingHint = 'balanced' | 'fast' | 'reasoning' | 'structured' | 'escalation';

export interface ProviderCredentials {
  apiUrl: string;
  model: string;
  headers: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

const OLLAMA_HOST_ALLOWLIST = new Set([
  'localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal',
]);

function isSidecar(): boolean {
  return typeof process !== 'undefined' &&
    (process.env?.LOCAL_API_MODE || '').includes('sidecar');
}

function resolveProviderModel(provider: AiGatewayProvider, hint: LlmRoutingHint): string {
  if (provider === 'custom') {
    if (hint === 'fast') return process.env.LLM_FAST_MODEL || process.env.LLM_MODEL || 'custom-openai-compatible';
    if (hint === 'reasoning') return process.env.LLM_REASONING_MODEL || process.env.LLM_MODEL || 'custom-openai-compatible';
    if (hint === 'structured') return process.env.LLM_STRUCTURED_MODEL || process.env.LLM_MODEL || 'custom-openai-compatible';
    if (hint === 'escalation') return process.env.LLM_ESCALATION_MODEL || process.env.LLM_MODEL || 'custom-openai-compatible';
    return process.env.LLM_MODEL || 'custom-openai-compatible';
  }

  if (provider === 'openrouter') {
    if (hint === 'escalation') return process.env.OPENROUTER_ESCALATION_MODEL || process.env.OPENROUTER_MODEL || getProviderModel('openrouter');
    if (hint === 'structured') return process.env.OPENROUTER_STRUCTURED_MODEL || process.env.OPENROUTER_MODEL || getProviderModel('openrouter');
    return process.env.OPENROUTER_MODEL || getProviderModel('openrouter');
  }

  if (provider === 'ollama') {
    if (hint === 'fast') return process.env.OLLAMA_FAST_MODEL || process.env.OLLAMA_MODEL || getProviderModel('ollama');
    if (hint === 'reasoning' || hint === 'escalation') return process.env.OLLAMA_REASONING_MODEL || process.env.OLLAMA_MODEL || getProviderModel('ollama');
    if (hint === 'structured') return process.env.OLLAMA_STRUCTURED_MODEL || process.env.OLLAMA_MODEL || getProviderModel('ollama');
    return process.env.OLLAMA_MODEL || getProviderModel('ollama');
  }

  if (provider === 'vllm') {
    if (hint === 'fast') return process.env.VLLM_FAST_MODEL || process.env.VLLM_MODEL || getProviderModel('vllm');
    if (hint === 'reasoning' || hint === 'escalation') return process.env.VLLM_REASONING_MODEL || process.env.VLLM_MODEL || getProviderModel('vllm');
    if (hint === 'structured') return process.env.VLLM_STRUCTURED_MODEL || process.env.VLLM_MODEL || getProviderModel('vllm');
    return process.env.VLLM_MODEL || getProviderModel('vllm');
  }

  if (provider === 'groq') {
    if (hint === 'structured') return process.env.GROQ_STRUCTURED_MODEL || process.env.GROQ_MODEL || getProviderModel('groq');
    return process.env.GROQ_MODEL || getProviderModel('groq');
  }

  return getProviderModel(provider);
}

export function getProviderCredentials(provider: AiGatewayProvider, hint: LlmRoutingHint = 'balanced'): ProviderCredentials | null {
  if (provider === 'custom') {
    const apiUrl = process.env.LLM_API_URL;
    const apiKey = process.env.LLM_API_KEY;
    if (!apiUrl || !apiKey) return null;
    return {
      apiUrl,
      model: resolveProviderModel('custom', hint),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
      model: resolveProviderModel('openrouter', hint),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://qadr.alefba.dev',
        'X-Title': 'QADR110',
      },
    };
  }

  if (provider === 'ollama') {
    const baseUrl = process.env.OLLAMA_API_URL;
    if (!baseUrl) return null;

    if (!isSidecar()) {
      try {
        const hostname = new URL(baseUrl).hostname;
        if (!OLLAMA_HOST_ALLOWLIST.has(hostname)) {
          console.warn(`[llm] Ollama blocked: hostname "${hostname}" not in allowlist`);
          return null;
        }
      } catch {
        return null;
      }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.OLLAMA_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    return {
      apiUrl: new URL('/v1/chat/completions', baseUrl).toString(),
      model: resolveProviderModel('ollama', hint),
      headers,
      extraBody: { think: false },
    };
  }

  if (provider === 'vllm') {
    const baseUrl = process.env.VLLM_API_URL;
    if (!baseUrl) return null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.VLLM_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    return {
      apiUrl: new URL('/v1/chat/completions', baseUrl).toString(),
      model: resolveProviderModel('vllm', hint),
      headers,
    };
  }

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
      model: resolveProviderModel('groq', hint),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  return null;
}

export function stripThinkingTags(text: string): string {
  let s = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<reflection>[\s\S]*?<\/reflection>/gi, '')
    .replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, '')
    .trim();

  s = s
    .replace(/<think>[\s\S]*/gi, '')
    .replace(/<\|thinking\|>[\s\S]*/gi, '')
    .replace(/<reasoning>[\s\S]*/gi, '')
    .replace(/<reflection>[\s\S]*/gi, '')
    .replace(/<\|begin_of_thought\|>[\s\S]*/gi, '')
    .trim();

  return s;
}

const PROVIDER_CHAIN = [
  'openrouter',
  'custom',
  ...getAiProviderOrder('strategic-default').filter((provider) => provider !== 'browser' && provider !== 'openrouter'),
] as const;

const ROUTING_HINT_CHAINS: Record<LlmRoutingHint, AiGatewayProvider[]> = {
  balanced: [...PROVIDER_CHAIN],
  fast: ['ollama', 'custom', 'browser', 'vllm', 'openrouter', 'groq'],
  reasoning: ['vllm', 'custom', 'ollama', 'openrouter', 'groq', 'browser'],
  structured: ['vllm', 'custom', 'ollama', 'openrouter', 'groq'],
  escalation: ['openrouter', 'custom', 'vllm', 'ollama', 'groq', 'browser'],
};

function dedupeProviders(providers: AiGatewayProvider[]): AiGatewayProvider[] {
  return providers.filter((provider, index) => providers.indexOf(provider) === index);
}

export function buildProviderChain(hint: LlmRoutingHint = 'balanced'): AiGatewayProvider[] {
  return dedupeProviders(ROUTING_HINT_CHAINS[hint] ?? ROUTING_HINT_CHAINS.balanced);
}

export interface LlmCallOptions {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  provider?: AiGatewayProvider;
  providerChain?: AiGatewayProvider[];
  retries?: number;
  retryDelayMs?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  extraBodyByProvider?: Partial<Record<AiGatewayProvider, Record<string, unknown>>>;
  stripThinkingTags?: boolean;
  validate?: (content: string) => boolean;
  routingHint?: LlmRoutingHint;
}

export interface LlmCallResult {
  content: string;
  model: string;
  provider: AiGatewayProvider;
  tokens: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStreamingContent(
  resp: Response,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  if (!resp.body) return '';

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const data = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
        const delta = data.choices?.[0]?.delta?.content
          ?? data.choices?.[0]?.message?.content
          ?? '';
        if (!delta) continue;
        content += delta;
        onChunk?.(delta);
      } catch {
        continue;
      }
    }
  }

  return content;
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult | null> {
  const {
    messages,
    temperature = 0.3,
    maxTokens = 1500,
    timeoutMs = 25_000,
    provider: forcedProvider,
    providerChain,
    retries = 1,
    retryDelayMs = 400,
    stream = false,
    onChunk,
    extraBodyByProvider,
    stripThinkingTags: shouldStrip = true,
    validate,
    routingHint = 'balanced',
  } = opts;

  const providers = forcedProvider
    ? [forcedProvider]
    : [...(providerChain?.length ? dedupeProviders(providerChain) : buildProviderChain(routingHint))];

  for (const providerName of providers) {
    const creds = getProviderCredentials(providerName, routingHint);
    if (!creds) {
      if (forcedProvider) return null;
      continue;
    }

    for (let attempt = 0; attempt < Math.max(1, retries); attempt++) {
      try {
        const body = {
          ...creds.extraBody,
          ...(extraBodyByProvider?.[providerName] ?? {}),
          model: creds.model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(stream ? { stream: true } : {}),
        };

        const resp = await fetch(creds.apiUrl, {
          method: 'POST',
          headers: { ...creds.headers, 'User-Agent': CHROME_UA },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!resp.ok) {
          console.warn(`[llm:${providerName}] HTTP ${resp.status}`);
          if (attempt + 1 < Math.max(1, retries)) {
            await sleep(retryDelayMs * (attempt + 1));
            continue;
          }
          if (forcedProvider) return null;
          break;
        }

        let content = '';
        let tokens = 0;

        if (stream) {
          content = (await readStreamingContent(resp, onChunk)).trim();
        } else {
          const data = (await resp.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { total_tokens?: number };
          };

          content = data.choices?.[0]?.message?.content?.trim() || '';
          tokens = data.usage?.total_tokens ?? 0;
        }

        if (!content) {
          if (attempt + 1 < Math.max(1, retries)) {
            await sleep(retryDelayMs * (attempt + 1));
            continue;
          }
          if (forcedProvider) return null;
          break;
        }

        if (shouldStrip) {
          content = stripThinkingTags(content);
          if (!content) {
            if (attempt + 1 < Math.max(1, retries)) {
              await sleep(retryDelayMs * (attempt + 1));
              continue;
            }
            if (forcedProvider) return null;
            break;
          }
        }

        if (validate && !validate(content)) {
          console.warn(`[llm:${providerName}] validate() rejected response, trying next`);
          if (attempt + 1 < Math.max(1, retries)) {
            await sleep(retryDelayMs * (attempt + 1));
            continue;
          }
          if (forcedProvider) return null;
          break;
        }

        return { content, model: creds.model, provider: providerName, tokens };
      } catch (err) {
        console.warn(`[llm:${providerName}] ${(err as Error).message}`);
        if (attempt + 1 < Math.max(1, retries)) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        if (forcedProvider) return null;
        break;
      }
    }
  }

  return null;
}
