# QADR110 Meta-Scenario Engine

## Purpose

The meta-scenario layer in [src/ai/meta-scenario-engine.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/ai/meta-scenario-engine.ts) sits above the base scenario engine and performs second-order reasoning on top of already generated futures.

It is designed to answer questions such as:

- which scenarios reinforce one another
- which scenarios suppress or compete with one another
- where a scenario war is forming
- which low-probability / high-impact futures should be treated as Black Swan candidates

## Architecture

The engine does not replace the existing scenario engine. It consumes:

- base scenarios from [src/ai/scenario-engine.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/ai/scenario-engine.ts)
- map context and nearby signals
- local OSINT / context packets
- session memory and reusable insights

Integration path:

1. `scenario_engine` generates ranked first-order scenarios.
2. `meta_scenario_engine` fuses those scenarios into second-order interactions.
3. The orchestrator merges `metaScenario` into the final structured output.
4. The assistant UI renders meta-scenarios, scenario conflicts, and Black Swan candidates.

## Scoring Logic

The engine uses explicit, deterministic heuristics.

### 1. Pairwise interaction score

For each pair of scenarios it computes:

- token overlap:
  title, description, drivers, indicators, second-order effects
- domain overlap:
  shared geopolitics / economics / infrastructure / public sentiment / cyber domains
- indicator overlap:
  shared watch indicators
- evidence support delta:
  how much current evidence supports one scenario more than another

The blended interaction strength is a weighted score over those factors.

### 2. Relationship classification

Each pair is classified as one of:

- `amplifying`
- `suppressing`
- `competing`
- `converging`

Direction is inferred from:

- escalatory vs stabilizing language
- evidence support imbalance
- contradiction score

### 3. Scenario war redistribution

For suppressing / competing pairs the engine redistributes probability mass dynamically:

- base probability from the original scenario engine
- support boost from current evidence
- penalty when the opposing scenario is better supported

The result is a `probability_redistribution` object per conflict.

### 4. Black Swan detection

The Black Swan layer looks for:

- low-probability / high-impact scenarios
- sparse weak signals
- contradictory evidence
- regime-shift indicators such as shutdowns, closures, outages, collapse-like signals

Each candidate explains:

- why it matters
- which assumptions it breaks
- which signals and watchpoints should be monitored

## Orchestrator Integration

The tool is exposed as `meta_scenario_engine` in:

- [src/platform/ai/orchestrator-contracts.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/platform/ai/orchestrator-contracts.ts)
- [src/services/ai-orchestrator/prompt-strategy.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/services/ai-orchestrator/prompt-strategy.ts)
- [server/worldmonitor/intelligence/v1/orchestrator-tools.ts](/Users/never/Documents/CodeX/_tmp_qadr110/server/worldmonitor/intelligence/v1/orchestrator-tools.ts)
- [src/services/ai-orchestrator/orchestrator.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/services/ai-orchestrator/orchestrator.ts)

The UI surface is rendered in:

- [src/components/qadr-assistant-ui.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/components/qadr-assistant-ui.ts)

## Output Shape

```json
{
  "meta_scenarios": [
    {
      "id": "meta-economic-security",
      "title": "هم‌افزایی شوک اقتصادی و اختلال امنیتی",
      "source_scenarios": ["economic-spillover", "security-escalation"],
      "relationship_type": "amplifying",
      "summary": "این دو سناریو از مسیر drivers و indicators مشترک یکدیگر را تقویت می‌کنند.",
      "combined_probability": "high",
      "impact_level": "critical",
      "uncertainty_level": "medium",
      "critical_dependencies": ["بیمه حمل", "ترافیک دریایی"],
      "trigger_indicators": ["افزایش هزینه حمل", "تجمع سیگنال دریایی"],
      "watchpoints": ["افزایش backlog", "بازقیمت‌گذاری انرژی"],
      "strategic_implications": ["cascade چنددامنه‌ای محتمل‌تر می‌شود"],
      "recommended_actions": ["پایش شاخص‌های مشترک", "بازبینی dependencyهای حیاتی"]
    }
  ],
  "scenario_conflicts": [
    {
      "id": "conflict-managed-vs-escalation",
      "left_scenario_id": "managed-de-escalation",
      "right_scenario_id": "security-escalation",
      "relationship_type": "competing",
      "interaction_strength": 0.67,
      "direction": "toward:security-escalation",
      "summary": "این دو آینده برای plausibility رقابت می‌کنند.",
      "probability_redistribution": {
        "managed-de-escalation": 0.41,
        "security-escalation": 0.59
      },
      "decisive_indicators": ["تحرک دریایی", "سیگنال دیپلماتیک"]
    }
  ],
  "black_swan_candidates": [
    {
      "id": "black-swan-hormuz",
      "title": "قوی سیاه اختلال غیرخطی",
      "summary": "یک regime shift ناگهانی می‌تواند tree فعلی را ناکافی کند.",
      "probability": "low",
      "impact_level": "critical",
      "uncertainty_level": "high",
      "why_it_matters": "فرض‌های پایه درباره پایداری مسیر و cadence تشدید را می‌شکند.",
      "broken_assumptions": ["ثبات مسیرهای جایگزین"],
      "weak_signals": ["شایعه قطع ارتباطات"],
      "contradictory_evidence": ["پیام آرام‌ساز دیپلماتیک"],
      "regime_shift_indicators": ["انسداد", "قطعی مخابراتی"],
      "watchpoints": ["ترافیک دریایی", "قیمت بیمه"],
      "recommended_actions": ["watchlist مستقل", "بازبینی فرض‌های پایه"]
    }
  ]
}
```

## Tests

Coverage is in:

- [tests/meta-scenario-engine.test.mts](/Users/never/Documents/CodeX/_tmp_qadr110/tests/meta-scenario-engine.test.mts)
- [tests/ai-orchestrator-routing.test.mts](/Users/never/Documents/CodeX/_tmp_qadr110/tests/ai-orchestrator-routing.test.mts)
- [tests/ai-orchestrator-runner.test.mts](/Users/never/Documents/CodeX/_tmp_qadr110/tests/ai-orchestrator-runner.test.mts)
- [tests/qadr-assistant-ui.test.mts](/Users/never/Documents/CodeX/_tmp_qadr110/tests/qadr-assistant-ui.test.mts)
