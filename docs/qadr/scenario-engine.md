# QADR110 Scenario Engine

## Overview

The scenario engine in [src/ai/scenario-engine.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/ai/scenario-engine.ts) builds deterministic, evidence-aware scenario trees from:

- explicit triggers such as `اگر تنگه هرمز مسدود شود`
- map context and nearby signals
- local OSINT packets such as GDELT and Polymarket-derived context
- session memory and reusable insights

It is integrated into the orchestrator as the `scenario_engine` tool and can be used as:

- a grounding source for LLM prompting
- a structured fallback when model JSON is invalid
- a packet generator for evidence-aware UI surfaces

## Interactive simulation layer

The interactive what-if simulator in [src/ai/scenario-simulation.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/ai/scenario-simulation.ts) extends the engine into a branchable analyst workbench:

- accepts a hypothetical event plus optional map/session context
- generates 3 to 5 future branches from the current scenario state
- supports analyst controls:
  - probability bias
  - intensity
  - actor-behavior toggles
  - constraint toggles
- produces:
  - branch summaries
  - next-step chains
  - decision-tree / graph nodes and edges
  - recommended orchestrator tools per branch

It is integrated into the orchestrator as the `scenario_simulation` tool and also powers the interactive controls inside [src/components/ScenarioPlannerPanel.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/components/ScenarioPlannerPanel.ts).

## Meta-scenario layer

The second-order reasoning layer in [src/ai/meta-scenario-engine.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/ai/meta-scenario-engine.ts) works on top of the base scenario output and adds:

- scenario fusion
- interaction analysis
- scenario wars with dynamic probability redistribution
- Black Swan candidate detection
- higher-order strategic insights

It is exposed to the orchestrator as `meta_scenario_engine`. Full details are documented in [docs/qadr/meta-scenario-engine.md](/Users/never/Documents/CodeX/_tmp_qadr110/docs/qadr/meta-scenario-engine.md).

## Dynamic API

The engine also exposes a live-update API:

- `getScenarios(context)`:
  builds an initial scenario state with signal fusion, confidence, compare summary, and per-scenario timeline seeds
- `updateScenarios(newSignals)`:
  merges new GDELT / Polymarket / news-cluster / social-sentiment / map signals into the existing state, updates probabilities, and emits drift records
- `compareScenarios(a, b)`:
  compares two active scenarios by likelihood, impact, confidence, and strategic relevance

The frontend loop in [src/services/scenario-intelligence.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/services/scenario-intelligence.ts) listens to:

- `wm:intelligence-updated`
- map clicks and map state changes
- assistant workspace changes

and pushes live state into the Scenario Planner panel.

## Map-aware scenario layers

The map-aware overlay in [src/services/ScenarioMapOverlay.ts](/Users/never/Documents/CodeX/_tmp_qadr110/src/services/ScenarioMapOverlay.ts):

- extracts anchor location, bounding box, and nearby entities from the active map context
- builds location-specific hotspots from outages, protests, cyber signals, and geolocated news clusters
- renders scenario-oriented layers:
  - risk heatmap
  - escalation paths
  - impact zones
- exposes direct analyst triggers:
  - `simulate this region`
  - `forecast escalation here`
  - `what happens if conflict spreads from here?`

## Output shape

Each scenario includes:

- `id`
- `title`
- `description`
- `probability`
- `impact_level`
- `time_horizon`
- `drivers[]`
- `causal_chain[]`
- `indicators_to_watch[]`
- `mitigation_options[]`
- `uncertainty_level`

The simulation layer adds:

- `simulation.title`
- `simulation.event`
- `simulation.mode`
- `simulation.controls_summary[]`
- `simulation.branches[]`
- `simulation.graph.nodes[]`
- `simulation.graph.edges[]`

## Sample output

```json
{
  "id": "economic-spillover",
  "title": "شوک اقتصادی و کالایی مرتبط با تنگه هرمز",
  "description": "انسداد می‌تواند از مسیر قیمت، بیمه و لجستیک به شوک چندلایه اقتصادی منجر شود.",
  "probability": "high",
  "impact_level": "critical",
  "time_horizon": "ساعت‌ها تا چند هفته",
  "drivers": [
    "واکنش بازار انرژی",
    "رفتار بیمه و حمل"
  ],
  "causal_chain": [
    { "stage": "event", "summary": "رخداد اولیه ثبت می‌شود." },
    { "stage": "reaction", "summary": "بازارها ریسک را بازقیمت‌گذاری می‌کنند." },
    { "stage": "escalation", "summary": "فشار ارزی و لجستیکی سرریز می‌کند." },
    { "stage": "outcome", "summary": "هزینه تجارت و نوسان بازار بالا می‌رود." }
  ],
  "indicators_to_watch": [
    "شکاف قیمتی انرژی",
    "افزایش هزینه بیمه/حمل"
  ],
  "mitigation_options": [
    "پایش شوک قیمت و بیمه",
    "شناسایی مسیرهای جایگزین تجارت"
  ],
  "uncertainty_level": "medium"
}
```
