/**
 * Content script (injected on demand by the popup via chrome.scripting, `activeTab` only).
 * Finds the active <video>/<audio> (generic, not YouTube specific), routes it through the shared
 * audio engine and applies tempo / transpose / minus one.
 */
import { MusikAudioEngine } from '@musik/core/audio/engine';
import { clampSemitone, clampTempo, SEMITONE_MAX, TEMPO_STEP } from '@musik/core/audio/pitch-math';
import type { ExtRequest, ExtResponse, ExtStatus } from './messages';

declare const __TEST__: boolean;

interface Session {
  engine: MusikAudioEngine;
  media: HTMLMediaElement;
}

const w = window as unknown as { __musikContent?: boolean };

if (!w.__musikContent) {
  w.__musikContent = true;
  main();
}

function main(): void {
  const sessions = new WeakMap<HTMLMediaElement, Session>();
  /** In-flight initialisations: a media element may only be wrapped once, even with fast clicks. */
  const pending = new WeakMap<HTMLMediaElement, Promise<Session | null>>();
  let active: Session | null = null;
  let tempo = 1;
  let semitone = 0;
  let minusOne = false;
  let error = '';

  /** Playing first, then biggest on screen, then longest. */
  function findMedia(): HTMLMediaElement | null {
    const all = Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'));
    if (all.length === 0) return null;
    const score = (m: HTMLMediaElement): number => {
      const r = m.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      const playing = !m.paused && !m.ended && m.readyState > 2 ? 1e9 : 0;
      const hasSrc = m.currentSrc || m.srcObject ? 1e6 : 0;
      return playing + hasSrc + area + (Number.isFinite(m.duration) ? m.duration : 0);
    };
    return all.sort((a, b) => score(b) - score(a))[0] ?? null;
  }

  function ensureSession(media: HTMLMediaElement): Promise<Session | null> {
    const existing = sessions.get(media);
    if (existing) return Promise.resolve(existing);
    let job = pending.get(media);
    if (!job) {
      job = createSession(media).finally(() => pending.delete(media));
      pending.set(media, job);
    }
    return job;
  }

  async function createSession(media: HTMLMediaElement): Promise<Session | null> {
    const engine = new MusikAudioEngine(media, {
      assets: {
        workletUrl: chrome.runtime.getURL('worklet.js'),
        wasmUrl: chrome.runtime.getURL('rubberband.wasm'),
      },
      path: 'A',
      engine: 'R2',
      allowNoWorklet: true,
    });
    try {
      await engine.init();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return null;
    }
    const session = { engine, media };
    sessions.set(media, session);
    return session;
  }

  function status(media: HTMLMediaElement | null): ExtStatus {
    const session = media ? sessions.get(media) : undefined;
    return {
      hasMedia: !!media,
      title: document.title,
      ready: !!session,
      pitchAvailable: session?.engine.pitchAvailable ?? false,
      error: session?.engine.workletError ?? error,
      tempo,
      semitone,
      minusOne,
    };
  }

  async function apply(
    media: HTMLMediaElement,
    patch: { tempo?: number; semitone?: number; minusOne?: boolean },
  ): Promise<void> {
    if (patch.tempo !== undefined) tempo = clampTempo(patch.tempo);
    if (patch.semitone !== undefined) semitone = clampSemitone(patch.semitone);
    if (patch.minusOne !== undefined) minusOne = patch.minusOne;
    const session = await ensureSession(media);
    if (!session) {
      // Engine could not start at all: tempo still works with the browser's own stretch.
      media.preservesPitch = true;
      media.playbackRate = tempo;
      return;
    }
    if (active && active !== session) {
      // Previously controlled media goes back to normal.
      active.engine.setTempo(1);
      active.engine.setSemitone(0);
      active.engine.setMinusOne(false);
    }
    active = session;
    await session.engine.resume().catch(() => undefined);
    session.engine.setTempo(tempo);
    session.engine.setSemitone(semitone);
    session.engine.setMinusOne(minusOne);
  }

  async function handle(req: ExtRequest): Promise<ExtResponse> {
    const media = findMedia();
    if (req.type === 'status') return status(media);
    if (!media) return status(null);
    if (req.type === 'set') {
      await apply(media, req);
      return status(media);
    }
    if (__TEST__ && req.type === 'test-capture') {
      const session = sessions.get(media);
      if (!session) return { samples: [], sampleRate: 0 };
      const e = session.engine;
      const frames = req.frames ?? 32768;
      const an = e.context.createAnalyser();
      an.fftSize = frames;
      e.output.connect(an);
      await new Promise((r) => setTimeout(r, (frames / e.context.sampleRate) * 1000 + 300));
      const buf = new Float32Array(frames);
      an.getFloatTimeDomainData(buf);
      e.output.disconnect(an);
      return { samples: Array.from(buf), sampleRate: e.context.sampleRate };
    }
    return status(media);
  }

  chrome.runtime.onMessage.addListener((req: ExtRequest, _sender, sendResponse) => {
    handle(req).then(sendResponse, (err: unknown) => {
      error = err instanceof Error ? err.message : String(err);
      sendResponse(status(findMedia()));
    });
    return true; // async response
  });

  // Keyboard shortcuts, only after the extension has been used on this page.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      let patch: { tempo?: number; semitone?: number } | null = null;
      if (e.key === '[') patch = { tempo: tempo - TEMPO_STEP };
      else if (e.key === ']') patch = { tempo: tempo + TEMPO_STEP };
      else if (e.shiftKey && e.key === 'ArrowUp')
        patch = { semitone: Math.min(SEMITONE_MAX, semitone + 1) };
      else if (e.shiftKey && e.key === 'ArrowDown') patch = { semitone: semitone - 1 };
      if (!patch) return;
      e.preventDefault();
      e.stopPropagation();
      void apply(active.media, patch);
    },
    true,
  );
}
