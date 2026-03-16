import type {
  ServerContext,
  GetCountryIntelBriefRequest,
  GetCountryIntelBriefResponse,
} from '../../../../src/generated/server/worldmonitor/intelligence/v1/service_server';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { cachedFetchJson } from '../../../_shared/redis';
import { UPSTREAM_TIMEOUT_MS, TIER1_COUNTRIES, sha256Hex } from './_shared';

interface CountryIntelAiDeps {
  callLlm: typeof import('../../../_shared/llm').callLlm;
  getPolicyForTask: typeof import('../../../../src/platform/ai/policy').getPolicyForTask;
  getProviderModel: typeof import('../../../../src/platform/ai/policy').getProviderModel;
}

let countryIntelAiDepsPromise: Promise<CountryIntelAiDeps> | null = null;

async function loadCountryIntelAiDeps(): Promise<CountryIntelAiDeps> {
  if (!countryIntelAiDepsPromise) {
    countryIntelAiDepsPromise = (async () => {
      try {
        const [llm, policy] = await Promise.all([
          import('../../../_shared/llm'),
          import('../../../../src/platform/ai/policy'),
        ]);
        return {
          callLlm: llm.callLlm,
          getPolicyForTask: policy.getPolicyForTask,
          getProviderModel: policy.getProviderModel,
        };
      } catch {
        const repoRoot = process.cwd();
        const [llm, policy] = await Promise.all([
          import(pathToFileURL(resolve(repoRoot, 'server/_shared/llm.ts')).href),
          import(pathToFileURL(resolve(repoRoot, 'src/platform/ai/policy.ts')).href),
        ]);
        return {
          callLlm: llm.callLlm,
          getPolicyForTask: policy.getPolicyForTask,
          getProviderModel: policy.getProviderModel,
        };
      }
    })();
  }

  return countryIntelAiDepsPromise;
}

// ========================================================================
// Constants
// ========================================================================

const INTEL_CACHE_TTL = 7200;

// ========================================================================
// RPC handler
// ========================================================================

export async function getCountryIntelBrief(
  ctx: ServerContext,
  req: GetCountryIntelBriefRequest,
): Promise<GetCountryIntelBriefResponse> {
  const { callLlm, getPolicyForTask, getProviderModel } = await loadCountryIntelAiDeps();
  const empty: GetCountryIntelBriefResponse = {
    countryCode: req.countryCode,
    countryName: '',
    brief: '',
    model: getProviderModel('openrouter'),
    generatedAt: Date.now(),
  };

  if (!req.countryCode) return empty;

  if (!process.env.OPENROUTER_API_KEY && !process.env.OLLAMA_API_URL && !process.env.VLLM_API_URL && !process.env.GROQ_API_KEY && !process.env.LLM_API_KEY) return empty;

  let contextSnapshot = '';
  let lang = 'en';
  try {
    const url = new URL(ctx.request.url);
    contextSnapshot = (url.searchParams.get('context') || '').trim().slice(0, 4000);
    lang = url.searchParams.get('lang') || 'en';
  } catch {
    contextSnapshot = '';
  }

  const contextHash = contextSnapshot ? (await sha256Hex(contextSnapshot)).slice(0, 16) : 'base';
  const cacheKey = `ci-sebuf:v2:${req.countryCode}:${lang}:${contextHash}`;
  const countryName = TIER1_COUNTRIES[req.countryCode] || req.countryCode;
  const dateStr = new Date().toISOString().split('T')[0];

  const systemPrompt = `You are a senior intelligence analyst providing comprehensive country situation briefs. Current date: ${dateStr}. Provide geopolitical context appropriate for the current date.

Write a concise intelligence brief for the requested country covering:
1. Current Situation - what is happening right now
2. Military & Security Posture
3. Key Risk Factors
4. Regional Context
5. Outlook & Watch Items

Rules:
- Be specific and analytical
- 4-5 paragraphs, 250-350 words
- No speculation beyond what data supports
- Use plain language, not jargon
- If a context snapshot is provided, explicitly reflect each non-zero signal category in the brief${lang === 'fr' ? '\n- IMPORTANT: You MUST respond ENTIRELY in French language.' : ''}`;

  let result: GetCountryIntelBriefResponse | null = null;
  try {
    result = await cachedFetchJson<GetCountryIntelBriefResponse>(cacheKey, INTEL_CACHE_TTL, async () => {
      try {
        const userPromptParts = [
          `Country: ${countryName} (${req.countryCode})`,
        ];
        if (contextSnapshot) {
          userPromptParts.push(`Context snapshot:\n${contextSnapshot}`);
        }

        const policy = getPolicyForTask('country-brief');
        const llmResult = await callLlm({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPromptParts.join('\n\n') },
          ],
          temperature: 0.4,
          maxTokens: policy.tokenBudget.outputTokenLimit,
          timeoutMs: UPSTREAM_TIMEOUT_MS,
        });
        const brief = llmResult?.content?.trim() || '';
        if (!brief) return null;

        return {
          countryCode: req.countryCode,
          countryName,
          brief,
          model: llmResult?.model || getProviderModel('openrouter'),
          generatedAt: Date.now(),
        };
      } catch {
        return null;
      }
    });
  } catch {
    return empty;
  }

  return result || empty;
}
