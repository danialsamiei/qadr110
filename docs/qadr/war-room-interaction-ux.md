# War Room Interaction UX

## Intent
War Room should feel like a Persian-first strategic workbench, not a flat analytics panel. The interaction model is based on four ideas:

1. board-first overview
2. deck-based deep work
3. report-within-report spotlight sheets
4. keyboard-driven analyst flow

## Layout Model
- `Command strip`: deck switching and high-signal shortcut hints
- `Breadcrumb rail`: drill-down path inside the current debate context
- `Board deck`: agent cards, focus inspector, special view notes
- `Battlefield deck`: scenario ranking, disagreement heatmap, operational layers
- `Timeline deck`: debate rounds and transcript replay
- `Evidence deck`: context packets, provenance, trace, watch indicators
- `Spotlight sheet`: nested report surface for agent / round / scenario / conflict / evidence / executive views

## Interaction Flows

### Flow 1: Analyst overview to deep report
1. Open War Room
2. Scan board deck
3. Select an agent card
4. Press `Enter` or click `بازکردن گزارش عامل`
5. Review spotlight sheet
6. Load a refined question back into War Room if needed

### Flow 2: Scenario battlefield review
1. Switch to `میدان سناریو`
2. Inspect scenario ranking shifts
3. Open a scenario drill-down
4. Review linked conflicts and black swans
5. Seed a new question from that scenario

### Flow 3: Debate replay
1. Switch to `Timeline مناظره`
2. Expand rounds
3. Open a specific round report
4. Review transcript, evidence basis, and quality flags

### Flow 4: Evidence verification
1. Switch to `Evidence Stack`
2. Open a context packet
3. Review provenance, transcript usage, and linked watchpoints
4. Feed the evidence back into a revised debate question

## Keyboard Model
- `1-5`: switch War Room view mode
- `B / G / T / E`: switch deck
- `J / K`: move focused agent
- `Enter`: open drill-down for the current focal item
- `Esc`: close current sheet or return to board deck
- `?`: toggle shortcut overlay

## Motion and Behavior
- Lift-on-hover uses short vertical translation for cards and tabs
- Sheet entry uses fade + rise motion
- Spotlight entry uses slightly slower fade + scale for nested reports
- Reduced-motion mode disables non-essential transitions

## Component Behavior
- `WarRoomPanel`: owns deck state, shortcut handling, and drill-down stack
- `war-room-ui.ts`: owns pure view helpers, deck tabs, shortcut registry, and drill-down resolution
- `panels.css`: owns glass-like presentation, layered surfaces, and motion tokens

## Design Guardrails
- Keep surfaces dense, but never collapse provenance and watchpoints
- Prefer layered drill-down over opening new OS windows
- Preserve deterministic navigation and explainable state
- Keep animations brief and subordinate to readability
