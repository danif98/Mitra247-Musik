# ext-chrome (M1)

Chrome MV3 extension (unpacked): tempo, transpose and minus one for the `<video>`/`<audio>` in the active tab.
Uses the same engine as the PWA (`core/`), same Svelte components (`ui/`).

## Build and install

```powershell
npm run build:ext          # -> ext-chrome/dist
```

1. Chrome -> `chrome://extensions` -> turn on **Developer mode**.
2. **Load unpacked** -> select `ext-chrome/dist`. Stable extension id: `oplajmbpldocoebnjhjliogihkbjncbn` (manifest `key`).
3. After rebuilding, press **Reload** on the extension card and reload the target tab.

## How it works

- Permissions: only `activeTab` + `scripting`. Nothing runs until you click the toolbar icon; the popup then injects `content.js` into the active tab (top frame).
- `content.js` picks the playing / biggest media element, wraps it once with `MusikAudioEngine` (Web Audio + AudioWorklet + Rubber Band R2, path A) and applies popup commands.
- `worklet.js` and `rubberband.wasm` are web-accessible resources loaded with `audioWorklet.addModule`.
- If the page blocks the worklet, the engine falls back to degraded mode: tempo keeps pitch (browser stretch), minus one still works, key shift is hidden, popup says so.
- Shortcuts on the controlled page: `[` / `]` tempo -/+ 0.05, `Shift+Up` / `Shift+Down` key +/- 1.

## Tests

`node e2e/ext.mjs` builds `dist-test` (adds host permission for `127.0.0.1` so tests can inject without a user gesture) and drives Chromium with the extension loaded. See `docs/DECISIONS_M1.md` for what is and is not covered (real YouTube must be tested by hand).
