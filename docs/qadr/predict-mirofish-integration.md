# QADR Predict Integration

This document tracks the vendored integration of [MiroFish](https://github.com/666ghj/MiroFish) inside QADR under `/predict`.

## What was integrated

- Source code is vendored into [`/predict`](/C:/Users/never/Documents/CodeX/_tmp_qadr110/predict).
- Frontend is built as part of the main QADR web build.
- The main QADR static server now serves:
  - `https://predict.alefba.dev/`
  - `https://qadr.alefba.dev/predict/`
- The same Node server proxies:
  - `https://predict.alefba.dev/api/*` -> local predict backend
  - `https://qadr.alefba.dev/predict/api/*` -> local predict backend

## Runtime design

- QADR web shell remains on port `3000`.
- Predict backend runs as a separate Flask service on `127.0.0.1:5101`.
- Cloudflared maps `predict.alefba.dev` to the same port `3000` as QADR; host-based routing inside `scripts/serve-dist.mjs` selects the correct app.

## Required credentials for full functionality

The predict backend can start in degraded mode, but full simulation requires:

1. `ZEP_API_KEY`
   - Required by the graph/memory pipeline.
   - Without it, core simulation preparation and graph memory features will fail.

2. OpenAI-compatible LLM endpoint
   - `LLM_API_KEY`
   - `LLM_BASE_URL`
   - `LLM_MODEL_NAME`

Recommended production wiring on this server:

- `LLM_BASE_URL=http://127.0.0.1:4000/v1`
- `LLM_API_KEY=alefba-key`
- `LLM_MODEL_NAME=devstral-small-2`

This uses the existing LiteLLM gateway and local model stack already present on the server.

## Recommended infrastructure for best performance

- CPU: 8+ vCPU
- RAM: 32 GB recommended
- Disk: 20+ GB free for uploads, generated simulation data, and logs
- Python: 3.11 or 3.12
- Node.js: 18+
- Network access from backend to:
  - LiteLLM / OpenRouter endpoint
  - Zep Cloud

## Deployment notes

- Predict frontend build path: `predict/frontend/dist`
- Predict backend service template:
  - [`deploy/systemd/qadr110-predict-backend.service`](/C:/Users/never/Documents/CodeX/_tmp_qadr110/deploy/systemd/qadr110-predict-backend.service)
  - [`deploy/systemd/qadr110-predict-backend-docker.service`](/C:/Users/never/Documents/CodeX/_tmp_qadr110/deploy/systemd/qadr110-predict-backend-docker.service)
- Main reverse-proxy/static entrypoint:
  - [`scripts/serve-dist.mjs`](/C:/Users/never/Documents/CodeX/_tmp_qadr110/scripts/serve-dist.mjs)

## Python compatibility note

- Upstream `camel-oasis==0.2.5` requires Python `<3.12`.
- On servers that only ship Python `3.12`, deploy the predict backend with the Docker-based service template above.
- On servers with Python `3.11`, the plain systemd + virtualenv path remains valid.

## Known limitations

- Without `ZEP_API_KEY`, the backend runs in degraded mode only.
- The vendored frontend remains in its upstream visual language; it is linked into QADR navigation but not fully reskinned to the QADR shell.
