# Musik Tools

Personal music practice tool: player, speed changer, transpose, minus one (classic DSP, no AI), YouTube to MP3.
Source of truth: [`docs/PRD.md`](docs/PRD.md). License: GPL-3.0.

## Layout

| Folder | Purpose |
|---|---|
| `core/` | Audio engine (Web Audio + AudioWorklet + Rubber Band WASM) |
| `ui/` | Shared Svelte components, theme, Indonesian strings (`ui/i18n/id.ts`) |
| `app-pwa/` | PWA (Vite). Lab page for A23 testing: `app-pwa/lab` |
| `ext-chrome/` | MV3 extension skeleton |
| `server/` | Node service skeleton (`GET /api/health`) |
| `scripts/` | Cross-platform build/deploy scripts (Node) |
| `docs/` | PRD, FRONTEND, decisions, test checklists |

## Commands

```
npm install
npm run dev            # lab at http://localhost:5173/lab/
npm run lint && npm run typecheck && npm test
npm run build          # -> out/
npm run test:e2e       # Playwright (Chromium) lab + numeric tests
npm run deploy:prepare # -> ../musik-deploy (or MUSIK_DEPLOY_DIR)
```

See `docs/DEPLOY.md` and `docs/TEST_A23.md`.
