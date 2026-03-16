import type { AssistantEvidenceCard } from '@/platform/ai/assistant-contracts';
import type { KnowledgeDocument } from '@/platform/retrieval';
import { createConfidenceRecord } from '@/platform/ai/assistant-contracts';
import { runPersianAssistant } from '@/services/intelligence-assistant';

import { buildResilienceReport } from './reporting';
import { getResilienceDashboardModel } from './engine';
import type { ResilienceAiNarrationResult, ResilienceReportType } from './types';

function createKnowledgeDocument(id: string, title: string, content: string, updatedAt: string): KnowledgeDocument {
  return {
    id,
    kind: 'analytic-note',
    title,
    summary: content.slice(0, 180),
    content,
    language: 'fa',
    sourceLabel: title,
    sourceType: 'manual',
    updatedAt,
    tags: ['resilience', 'grounded-report'],
    provenance: {
      sourceIds: [id],
      evidenceIds: [id],
    },
  };
}

function buildPinnedEvidence(reportTitle: string, executiveSummary: string, generatedAt: string): AssistantEvidenceCard[] {
  return [{
    id: `resilience-evidence-${Date.now()}`,
    title: reportTitle,
    summary: executiveSummary,
    timeContext: generatedAt,
    score: 0.74,
    freshnessWeight: 0.82,
    source: {
      id: 'resilience-structured-report',
      type: 'manual',
      title: 'گزارش ساخت‌یافته تاب‌آوری',
      retrievedAt: new Date().toISOString(),
      reliability: createConfidenceRecord(0.74, 'روایت باید مستقیماً از داده ساخت‌یافته تاب‌آوری مشتق شود.'),
    },
    evidence: {
      id: 'resilience-structured-report-evidence',
      sourceId: 'resilience-structured-report',
      summary: executiveSummary,
      collectedAt: new Date().toISOString(),
    },
    provenance: {
      sourceIds: ['resilience-structured-report'],
      evidenceIds: ['resilience-structured-report-evidence'],
    },
    confidence: createConfidenceRecord(0.74, 'این کارت شواهد مستقیماً از فیلدهای گزارش ساخت‌یافته تولید شده است.'),
    tags: ['resilience', 'chart-grounding'],
  }];
}

export async function narrateResilienceReportWithAi(
  primaryCountryCode: string,
  compareCountryCodes: string[] = [],
  reportType: ResilienceReportType = 'national-brief',
): Promise<ResilienceAiNarrationResult> {
  const model = getResilienceDashboardModel(primaryCountryCode, compareCountryCodes);
  const report = buildResilienceReport(primaryCountryCode, compareCountryCodes, reportType);
  const knowledgeDocuments: KnowledgeDocument[] = [
    createKnowledgeDocument(`resilience-report:${report.id}`, report.title, report.markdown, report.generatedAt),
    createKnowledgeDocument(`resilience-summary:${model.primary.countryCode}`, `خلاصه ساخت‌یافته تاب‌آوری: ${model.primary.countryName}`, JSON.stringify({
      composite: model.primary.composite,
      dimensions: model.primary.dimensionOrder.map((id) => ({
        id,
        score: model.primary.dimensions[id].score,
        coveragePercent: model.primary.dimensions[id].coveragePercent,
        rationale: model.primary.dimensions[id].rationale,
      })),
      stressMatrix: model.primary.stressMatrix,
      comparisons: model.rankedRows,
    }, null, 2), report.generatedAt),
  ];
  const pinnedEvidence = buildPinnedEvidence(report.title, report.executiveSummary, report.generatedAt);

  const response = await runPersianAssistant({
    conversationId: `resilience-${model.primary.countryCode}-${Date.now()}`,
    domainMode: 'economic-resilience',
    taskClass: 'chart-narration',
    query: `برای داشبورد تاب‌آوری ${model.primary.countryName} یک روایت فارسی بساز که فقط بر داده‌های ساخت‌یافته این گزارش تکیه کند. بخش‌های «واقعیت‌های مشاهده‌شده»، «استنباط تحلیلی»، «سناریوها»، «عدم‌قطعیت‌ها» و «توصیه‌های دفاعی» را جدا کن. ارزش عددی نمودارها را از داده‌های ساخت‌یافته بردار و ارجاع جعلی نساز.`,
    promptId: 'resilience-chart-narration',
    promptText: report.markdown,
    messages: [],
    pinnedEvidence,
    memoryNotes: [],
    knowledgeDocuments,
    workflowId: 'resilience-reporting',
  });

  return {
    response,
    evidenceCount: response.evidenceCards.length,
  };
}
