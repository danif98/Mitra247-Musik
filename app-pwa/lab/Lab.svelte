<script lang="ts">
  import { onMount } from 'svelte';
  import {
    MusikAudioEngine,
    clampSemitone,
    clampTempo,
    encodeWav,
    generateSine,
    type PitchPath,
    type RubberBandEngine,
  } from '@musik/core';
  import { engineAssets } from '@musik/core/audio/assets';
  import { id } from '@musik/ui';
  import Stepper from '@musik/ui/components/Stepper.svelte';
  import { DiagLog } from './diag-log';

  const t = id.lab;
  const L = t.diagLabels;
  const log = new DiagLog();

  let audioEl: HTMLAudioElement;
  let engine: MusikAudioEngine | null = null;

  let fileName = $state('');
  let status = $state(t.loading);
  let failed = $state(false);
  let playing = $state(false);
  let current = $state(0);
  let duration = $state(0);
  let seeking = false;
  let tempo = $state(1);
  let semitone = $state(0);
  let path = $state<PitchPath>('A');
  let engineSel = $state<RubberBandEngine>('R2');
  let logCount = $state(0);
  let diag = $state<Record<string, string>>({});
  let objectUrl = '';

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const ms = (s: number | null | undefined) => (s == null ? '–' : (s * 1000).toFixed(1));

  function refreshDiag() {
    if (!engine) return;
    const s = engine.snapshot();
    const w = s.worklet;
    const rc = s.renderCapacity;
    diag = {
      [L.state]: s.state,
      [L.sampleRate]: String(s.sampleRate),
      [L.baseLatency]: ms(s.baseLatency),
      [L.outputLatency]: ms(s.outputLatency),
      [L.workletLatency]: w ? ((w.latencyFrames / s.sampleRate) * 1000).toFixed(1) : '–',
      [L.pitchRatio]: s.pitchRatio.toFixed(4),
      [L.playbackRate]: s.playbackRate.toFixed(3),
      [L.preservesPitch]: String(s.preservesPitch),
      [L.underruns]: w ? String(w.underruns) : '–',
      [L.blocks]: w ? String(w.blocks) : '–',
      [L.load]: w ? w.loadPct.toFixed(1) : '–',
      [L.slowBlocks]: w ? String(w.slowBlocks) : '–',
      [L.renderLoad]: rc ? (rc.averageLoad * 100).toFixed(1) : 'n/a',
      [L.renderPeak]: rc ? (rc.peakLoad * 100).toFixed(1) : 'n/a',
      [L.renderUnderrun]: rc ? rc.underrunRatio.toFixed(4) : 'n/a',
    };
    log.sample({
      ...s,
      visibility: document.visibilityState,
      mediaTime: audioEl.currentTime,
      contextTime: engine.context.currentTime,
      paused: audioEl.paused,
    });
    logCount = log.events.length + log.samples.length;
  }

  function logEvent(kind: string, detail?: unknown) {
    log.event(kind, detail);
    logCount = log.events.length + log.samples.length;
  }

  function loadUrl(url: string, title: string) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = url;
    fileName = title;
    audioEl.src = url;
    audioEl.load();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: id.appName });
    }
    logEvent('file', { title });
  }

  function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) loadUrl(URL.createObjectURL(f), f.name);
  }

  function makeTone() {
    const sr = 44100;
    const wav = encodeWav([generateSine(440, sr, 30, 0.5)], sr);
    loadUrl(
      URL.createObjectURL(new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' })),
      'tone-440hz.wav',
    );
  }

  async function togglePlay() {
    if (!engine || !audioEl.src) return;
    await engine.resume();
    if (audioEl.paused) await audioEl.play();
    else audioEl.pause();
  }

  function setTempo(v: number) {
    tempo = clampTempo(v);
    engine?.setTempo(tempo);
    logEvent('tempo', tempo);
  }
  function setSemitone(v: number) {
    semitone = clampSemitone(v);
    engine?.setSemitone(semitone);
    logEvent('semitone', semitone);
  }
  function setPath(p: PitchPath) {
    path = p;
    engine?.setPath(p);
    logEvent('path', p);
  }
  function setEngine(e: RubberBandEngine) {
    engineSel = e;
    engine?.setEngine(e);
    logEvent('engine', e);
  }

  function onSeek(e: Event) {
    audioEl.currentTime = Number((e.currentTarget as HTMLInputElement).value);
    seeking = false;
  }

  onMount(() => {
    const onVis = () => logEvent('visibilitychange', document.visibilityState);
    document.addEventListener('visibilitychange', onVis);

    const mediaEvents = [
      'play',
      'pause',
      'waiting',
      'stalled',
      'ended',
      'error',
      'seeked',
    ] as const;
    for (const name of mediaEvents) {
      audioEl.addEventListener(name, () => {
        logEvent(`media:${name}`, { time: audioEl.currentTime });
        playing = !audioEl.paused;
      });
    }
    audioEl.addEventListener('timeupdate', () => {
      if (!seeking) current = audioEl.currentTime;
    });
    audioEl.addEventListener('loadedmetadata', () => (duration = audioEl.duration));

    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => void togglePlay());
      ms.setActionHandler('pause', () => audioEl.pause());
      ms.setActionHandler('seekto', (d) => {
        if (d.seekTime != null) audioEl.currentTime = d.seekTime;
      });
    }

    engine = new MusikAudioEngine(audioEl, { assets: engineAssets, path, engine: engineSel });
    engine.events.stateChange = (s) => logEvent('audiocontext:state', s);
    engine.events.ready = (r) => {
      logEvent('worklet:ready', r);
      status = t.engineReady;
    };
    engine.events.error = (m) => {
      failed = true;
      status = `${t.engineError}: ${m}`;
      logEvent('worklet:error', m);
    };
    engine
      .init()
      .then(() => logEvent('engine:init', { state: engine?.context.state }))
      .catch((err: unknown) => {
        failed = true;
        status = `${t.engineError}: ${err instanceof Error ? err.message : String(err)}`;
        logEvent('engine:error', String(err));
      });

    const timer = setInterval(refreshDiag, 1000);

    // Test hook for Playwright: /lab/?test
    if (new URLSearchParams(location.search).has('test')) {
      (window as unknown as { __musik: unknown }).__musik = {
        engine: () => engine,
        capture: async (frames = 32768): Promise<number[]> => {
          const e = engine!;
          const an = e.context.createAnalyser();
          an.fftSize = frames;
          e.output.connect(an);
          await new Promise((r) => setTimeout(r, (frames / e.context.sampleRate) * 1000 + 300));
          const buf = new Float32Array(frames);
          an.getFloatTimeDomainData(buf);
          e.output.disconnect(an);
          return Array.from(buf);
        },
        log,
      };
    }

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  });
</script>

<main>
  <h1>{t.title}</h1>
  <p class="muted">{t.intro}</p>
  <p class={failed ? 'bad' : 'muted'} id="status" role="status">{status}</p>

  <div class="actions">
    <label class="btn file">
      {t.pickFile}
      <input type="file" accept="audio/*" onchange={onFile} />
    </label>
    <button type="button" onclick={makeTone}>{t.makeTone}</button>
  </div>
  <p class="muted" id="filename">{fileName || t.noFile}</p>

  <audio bind:this={audioEl} preload="auto" playsinline></audio>

  <div class="transport">
    <button type="button" class="primary play" onclick={togglePlay} id="play">
      {playing ? t.pause : t.play}
    </button>
    <span class="time">{fmtTime(current)} / {fmtTime(duration || 0)}</span>
  </div>
  <input
    type="range"
    aria-label={t.seek}
    min="0"
    max={duration || 0}
    step="0.1"
    value={current}
    oninput={(e) => {
      seeking = true;
      current = Number((e.currentTarget as HTMLInputElement).value);
    }}
    onchange={onSeek}
  />

  <div class="grid">
    <Stepper
      label={t.tempo}
      value={tempo}
      min={0.25}
      max={2}
      step={0.05}
      format={(v) => `${v.toFixed(2)}×`}
      resetTo={1}
      resetLabel={t.reset}
      onchange={setTempo}
    />
    <Stepper
      label={t.key}
      value={semitone}
      min={-12}
      max={12}
      step={1}
      format={(v) => (v > 0 ? `+${v}` : String(v))}
      resetTo={0}
      resetLabel={t.reset}
      onchange={setSemitone}
    />
  </div>

  <section class="panel">
    <h3>{t.path}</h3>
    <div class="seg">
      <button type="button" id="path-a" aria-pressed={path === 'A'} onclick={() => setPath('A')}
        >{t.pathA}</button
      >
      <button type="button" id="path-b" aria-pressed={path === 'B'} onclick={() => setPath('B')}
        >{t.pathB}</button
      >
    </div>
    <h3>{t.engine}</h3>
    <div class="seg">
      <button
        type="button"
        id="eng-r2"
        aria-pressed={engineSel === 'R2'}
        onclick={() => setEngine('R2')}>{t.engineR2}</button
      >
      <button
        type="button"
        id="eng-r3"
        aria-pressed={engineSel === 'R3'}
        onclick={() => setEngine('R3')}>{t.engineR3}</button
      >
    </div>
  </section>

  <section class="panel">
    <h3>{t.diag}</h3>
    <dl id="diag">
      {#each Object.entries(diag) as [k, v] (k)}
        <dt>{k}</dt>
        <dd>{v}</dd>
      {/each}
    </dl>
    <p class="muted">{t.hint}</p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        id="download"
        onclick={() => log.download({ settings: { tempo, semitone, path, engine: engineSel } })}
      >
        {t.downloadLog}
      </button>
      <button
        type="button"
        onclick={() => {
          log.clear();
          logCount = 0;
        }}>{t.clearLog}</button
      >
    </div>
    <p class="muted">{t.logCount}: <span id="logcount">{logCount}</span></p>
  </section>
</main>

<style>
  main {
    max-width: 560px;
    margin: 0 auto;
    padding: 12px 12px 48px;
    display: grid;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
  }
  h3 {
    margin: 8px 0 4px;
    font-size: 0.9rem;
    color: var(--muted);
    font-weight: 500;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .bad {
    color: var(--bad);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .actions > * {
    flex: 1 1 auto;
  }
  .file {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .play {
    min-width: 120px;
    min-height: 56px;
    font-size: 1.1rem;
  }
  .time {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .grid {
    display: grid;
    gap: 12px;
  }
  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 12px;
  }
  .seg {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr 1fr;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 12px;
    margin: 4px 0 8px;
    font-size: 0.9rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
