# War Room Debate Engine

پیاده‌سازی canonical در [src/ai/war-room/debate-state.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/ai/war-room/debate-state.ts) و [src/ai/war-room/debate-engine.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/ai/war-room/debate-engine.ts) قرار دارد.

## State Machine

1. `initialized`
2. `assessment`
3. `critique`
4. `revision`
5. `synthesis`
6. `completed`

در هر transition، یک `replay_trace` item ثبت می‌شود و هر ورودی round به `debate_transcript` تبدیل می‌شود.

## Controls

- `mode`: `fast | deep`
- `challengeIterations`
- `includedAgentIds`
- `excludedAgentIds`

`fast` به‌صورت پیش‌فرض subset کوچکتری از عامل‌ها را اجرا می‌کند و `deep` همه نقش‌ها را نگه می‌دارد.

## Quality Controls

- `repetitive_debate`
- `shallow_agreement`
- `voice_collapse_risk`
- `evidence_backed_disagreement_ratio`
- `alerts[]`
- `enforcement_notes[]`

## Sample Transcript

```json
{
  "id": "round-2:strategic-analyst:1",
  "round_id": "round-2",
  "round_stage": "critique",
  "round_index": 2,
  "agent_id": "strategic-analyst",
  "label": "Strategic Analyst",
  "prompt_excerpt": "نقش شما: تحلیل‌گر راهبردی ...",
  "response": "تحلیل Economic Analyst shockهای قیمت و بیمه را خوب پوشش می‌دهد اما interaction بازیگران را کمتر توضیح می‌دهد.",
  "target_agent_ids": ["economic-analyst"],
  "markers": ["challenge"],
  "evidence_basis": ["قیمت نفت", "بیمه حمل", "assumption=بازار کاملا قفل نمی‌شود"],
  "quality_flags": ["evidence-backed", "cross-critique"]
}
```

## Disagreement Matrix

هر ردیف مربوط به یک عامل است و برای هر عامل دیگر این فیلدها را نگه می‌دارد:

- `disagreement_score`
- `challenge_count`
- `evidence_backed`
- `summary`
