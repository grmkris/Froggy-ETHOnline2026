# 0001 — Modular interactive runtime

Status: accepted on 2026-09-04.

The starter uses separate packages for domain, protocol, simulation, rendering, UI, chain, and database concerns. Apps are composition roots. The simulation remains host- and renderer-independent, and optional infrastructure is added through adapters.

This costs more workspace manifests than a single app, but it gives coding agents narrow context, permits deterministic boundary checks, and prevents realtime/game concerns from leaking into React components or persistence code.
