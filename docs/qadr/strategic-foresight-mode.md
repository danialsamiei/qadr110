# Strategic Foresight Mode

## Purpose
Strategic Foresight Mode is the integrated second-order workspace in QADR110. It combines:

- Orchestrator
- Scenario Engine
- Meta-Scenario Engine
- Black Swan Detection
- Multi-Agent War Room
- Prompt Suggestion Engine
- Map Context

The mode is designed for Persian-first, RTL, board-ready synthesis rather than isolated panel outputs.

## Flow
1. User asks a question or selects a region.
2. The system gathers map context, local packets, session memory, and recent signals.
3. The Scenario Engine builds dominant and competing baseline futures.
4. The Meta-Scenario layer evaluates interaction, conflict, and higher-order patterns.
5. The Black Swan layer stress-tests assumptions and weak-signal alternatives.
6. War Room may run for disagreement-driven scenario adjustment.
7. Strategic Foresight synthesizes:
   - executive summary
   - dominant scenarios
   - competing futures
   - black swan candidates
   - debate highlights
   - watch indicators
   - recommended next prompts

## Entry Points
- Assistant domain mode: `strategic-foresight`
- Orchestrator tool: `strategic_foresight`
- Map overlay command: `strategic-foresight`
- Floating prompt suggestions: `strategic-foresight-brief`
- Dedicated panel: `strategic-foresight`

## Notes
- The mode does not replace Scenario Engine, Meta-Scenario, Black Swan, or War Room.
- It acts as a synthesis layer on top of those modules.
- Outputs are explainable and keep evidence lineage through reused context packets and source summaries.
