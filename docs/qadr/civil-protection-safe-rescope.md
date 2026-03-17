# Civil Protection Safe Rescope

## Status

This note corrects and narrows the implementation baseline for QADR110. It supersedes any ambiguous interpretation of earlier planning notes.

Approved scope only:

- civil protection
- nonviolent crisis response
- humanitarian coordination
- early warning
- de-escalation
- public communication
- sheltering and evacuation
- service continuity
- geospatial governance
- domain-neutral scenario modeling
- Black Swan detection
- watchpoints
- rights-preserving decision support

Out of scope:

- offensive military functionality
- targeting or strike workflows
- coercive crowd-control logic
- repressive or rights-violating workflows
- bypasses of provider or model safeguards
- harmful surveillance patterns

## 1. Corrected Architecture

### Layer 1: Civil Protection and De-escalation

Purpose:

- incident verification
- early warning
- de-escalation support
- protective routing
- evacuation and shelter planning
- service continuity
- rumor and narrative-risk monitoring
- civilian-impact assessment

Primary outputs:

- protective action
- continuity action
- communication action
- monitoring priority
- escalation threshold
- rights note
- civilian impact note

### Layer 2: QADR Core Workspace

QADR remains the primary user-facing workspace for:

- frontend
- desktop shell
- assistant
- War Room
- map UX
- scenario drill-down
- executive summaries
- evidence and audit drill-downs

QADR is a decision-support and coordination workspace, not an enforcement system.

### Layer 3: Humanitarian Coordination

External systems of record:

- Ushahidi for intake and incident reporting
- Sahana Eden for humanitarian workflows, case/task coordination, and resource processes

QADR consumes normalized outputs and presents them in analyst workflows. It does not replace intake, case management, or resource systems of record.

### Layer 4: Geospatial Governance

External systems of record:

- GeoNode for catalog and metadata governance
- GeoServer for interoperable publishing
- PostGIS for authoritative spatial storage
- QGIS for authoring and QA

QADR uses governed spatial assets and metadata. It does not replace GIS governance or editing workflows.

## 2. Corrected Implementation Tasks

### QADR Core

- add `watchpoint-service`
- add `rights-impact-service`
- extend assistant outputs with justification, assumptions, uncertainty, civilian impact note, and rights impact note
- extend War Room and scenario views with protective and humanitarian outputs only
- extend map UX with verified incident overlays, shelter/resource overlays, and governance metadata overlays

### Ushahidi Adapter

- ingest reports into normalized `Report`
- map verification state into `VerificationState`
- derive `AffectedZone`, `Source`, `EvidenceRef`, `CitizenImpact`, and `Watchpoint`
- add deduplication, trust scoring, privacy filters, and human verification checkpoints

### Sahana Eden Adapter

- ingest tasks, cases, requests, and resource states into normalized workflow objects
- expose only:
  - `WorkflowTask`
  - `ResponseAction`
  - `ResourceRequest`
  - `CoordinationStatus`
  - `ServiceContinuityAction`
- require human approval checkpoints for high-impact resource and continuity recommendations

### Geospatial Governance Adapter

- ingest metadata from GeoNode
- ingest service descriptors from GeoServer
- ingest authoritative geometry references from PostGIS
- treat QGIS as publication/QA input, not runtime workflow
- add provenance, metadata completeness, ownership, permissions, cadence, boundary, and change-history handling

### Scenario Stack

Allow only domain-neutral, rights-preserving scenario outputs:

- protective implications
- humanitarian implications
- resilience implications
- watchpoints
- uncertainty tracking
- Black Swan candidates
- nonviolent strategic alternatives

## 3. Corrected Schemas

### Canonical neutral objects

- `Asset`
- `Zone`
- `Event`
- `Capability`
- `Risk`
- `Action`
- `Indicator`
- `Watchpoint`
- `Report`
- `VerificationState`
- `AffectedZone`
- `EvidenceRef`
- `WorkflowTask`
- `ResponseAction`
- `ResourceRequest`
- `CoordinationStatus`
- `ServiceContinuityAction`
- `RightsImpactNote`
- `CivilianImpactEstimate`
- `ResourceAllocation`

### Required governance fields for high-impact recommendations

```ts
interface HighImpactRecommendationEnvelope {
  id: string;
  justification: string;
  assumptions: string[];
  uncertainty: {
    level: 'low' | 'medium' | 'high';
    notes: string[];
  };
  civilianImpactNote: {
    summary: string;
    affectedGroups: string[];
    serviceRisks: string[];
  };
  rightsImpactNote: {
    summary: string;
    concerns: string[];
    mitigations: string[];
  };
  requiredHumanApprovals: string[];
}
```

### Safe action schema

```ts
interface ProtectiveAction {
  id: string;
  type:
    | 'protective-routing'
    | 'incident-verification'
    | 'resource-distribution'
    | 'public-communication'
    | 'shelter-prioritization'
    | 'evacuation-support'
    | 'service-continuity'
    | 'rumor-monitoring'
    | 'resilience-planning';
  objective: string;
  watchpoints: string[];
  rightsImpactNoteId: string;
  civilianImpactEstimateId?: string;
  approvalState: 'draft' | 'pending-human-approval' | 'approved' | 'rejected';
}
```

## 4. Corrected Testing Plan

### Contract Tests

- verify Ushahidi adapter emits only approved neutral objects
- verify Sahana adapter emits only approved workflow/resource objects
- verify geospatial adapters carry provenance, permissions, and ownership metadata

### Safety and Governance Tests

- fail any recommendation missing justification
- fail any high-impact recommendation missing civilian impact note
- fail any high-impact recommendation missing rights impact note
- fail any high-impact recommendation missing required human approvals
- fail any generated action outside the approved safe action taxonomy

### UI Workflow Tests

- verified incident appears in QADR map and assistant
- rumor cluster appears as narrative-risk monitoring, not coercive action
- resource shortage appears as humanitarian coordination and continuity planning
- scenario outputs show protective and humanitarian alternatives only

### Privacy and Access Tests

- PII minimization is enforced for intake reports
- restricted geospatial layers do not render without permission
- evidence redaction works for lower-privilege roles

### Scenario Smoke Tests

- scenario engine accepts normalized civil-protection inputs
- meta-scenario layer models conflicts and uncertainties without harmful recommendations
- Black Swan layer suggests monitoring and contingency planning only
- War Room synthesizes de-escalation, continuity, verification, and humanitarian actions only

## 5. Replacement Note

Any harmful or disallowed idea must be replaced as follows:

| Disallowed idea | Safe replacement |
| --- | --- |
| targeting or strike logic | protective routing, evacuation support, service continuity planning |
| coercive crowd-control logic | de-escalation support, public communication, rumor tracking, civilian-impact assessment |
| repressive workflows | humanitarian workflow orchestration, verification, rights-impact review |
| surveillance-heavy patterns | privacy-minimized incident verification and evidence handling |
| aggressive operational planning | resilience planning, watchpoints, uncertainty tracking, humanitarian coordination |

The intended result is a platform for protective coordination, verified situational awareness, and rights-preserving strategic foresight, not coercive action.
