# ADR 0001: Vendor-Neutral Interoperability Foundation

## Status

Accepted

## Context

QADR110 already had strong panel, map, and RPC foundations, but interoperability logic was distributed across services and docs. The target platform needs adapter contracts, capability normalization, provenance-aware models, and graceful degradation without replacing the existing app.

## Decision

Add a new foundation namespace under `src/platform` containing:

- canonical domain model
- capability registry and adapter manifests
- AI routing contracts
- operational schemas for prompts, map context, and analysis lifecycle

The existing application architecture remains canonical. New work should extend current panels, services, and handlers by consuming this foundation layer rather than starting a parallel app.

## Consequences

- interoperability work gains a single home
- new connectors can be declared before being fully implemented
- runtime code can adopt contracts incrementally
- some duplication with legacy service-specific types will exist temporarily
