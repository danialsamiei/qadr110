# Prompt Intelligence Agent

## Purpose
Prompt Intelligence Agent is the continuous prompt generation layer in QADR110. It does not answer the main question directly. Instead, it analyzes current context and proposes better next questions.

## Inputs
- user intent
- map context
- scenario state

## Duties
- generate deeper questions
- surface alternative perspectives
- propose strategic queries
- explain why each suggestion matters
- explain the expected analytic insight from each prompt

## Output Contract
Each cycle should yield 5 to 10 prompts, each with:

- `why`
- `expectedInsight`
- routing metadata
- task/domain alignment

## Canonical Implementation
- [PromptSuggestionEngine.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/services/PromptSuggestionEngine.ts)
- [prompt-intelligence.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/platform/operations/prompt-intelligence.ts)
- [prompt-suggestion-engine.test.mts](/Users/never/Documents/CodeX/_tmp_qadr110/tests/prompt-suggestion-engine.test.mts)
