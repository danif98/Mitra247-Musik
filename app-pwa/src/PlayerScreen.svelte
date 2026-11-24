<script lang="ts">
  import { id } from '@musik/ui';
  import Icon from '@musik/ui/components/Icon.svelte';
  import Stepper from '@musik/ui/components/Stepper.svelte';
  import Waveform from '@musik/ui/components/Waveform.svelte';
  import { EQ_BAND_LABELS, formatDuration, isSupportedAudio } from '@musik/core';
  import type { Player } from './player.svelte';

  interface Props {
    player: Player;
    ongoLibrary: () => void;
  }
  let { player, ongoLibrary }: Props = $props();
  const t = id.player;
  const PRESETS = [0.5, 0.75, 1, 1.25];

  let infoOpen = $state(false);
  let panel = $state<'eq' | 'metro' | null>(null);
  const MODES = [
    { key: 'basic', label: t.moBasic, hint: t.moHintBasic },
    { key: 'bass', label: t.moBass, hint: t.moHintBass },
    { key: 'focus', label: t.moFocus, hint: t.moHintFocus },
  ] as const;
  const hint = $derived(MODES.find((m) => m.key === player.moParams.mode)?.hint ?? '');
  const toggle = (name: 'eq' | 'metro') => (panel = panel === name ? null : name);

  async function onOpenFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter(isSupportedAudio);
    input.value = '';
    if (files.length) await player.playFiles(files);
  }
</script>

<section class="screen">
  {#if player.error}
    <p class="error" role="alert" id="player-error">{player.error}</p>
  {:else if player.engineState === 'loading'}
    <p class="muted">{t.engineLoading}</p>
  {/if}

  {#if !player.current}
    <div class="empty">
      <p>{t.empty}</p>
      <div class="row2">
        <button type="button" class="primary" onclick={ongoLibrary}>{t.goLibrary}</button>
        <label class="btn file">
          <Icon name="folder" size={20} />
          {t.openPlay}
          <input
            type="file"
            id="open-play-empty"
            accept="audio/*,.flac,.m4a,.opus"
            multiple
            onchange={onOpenFiles}
          />
        </label>
      </div>
    </div>
  {:else}
    <header>
      <h1 id="song-title">{player.current.title}</h1>
      <p class="muted sub">
        {#if player.queue.length > 1}<span id="queue-pos"
            >{player.queueIndex + 1} / {player.queue.length}</span
          >{/if}
        {#if player.currentIsTemp}
          <span>{t.temp}</span>
          <button type="button" class="link" id="save-temp" onclick={() => player.saveCurrent()}>
            <Icon name="save" size={16} />{t.saveTemp}
          </button>
        {/if}
      </p>
      {#if player.countingIn}<p class="muted" id="counting">{t.counting}</p>{/if}
    </header>

    <Waveform
      peaks={player.current.peaks}
      position={player.position}
      duration={player.duration}
      label={t.seek}
      loopA={player.loopA}
      loopB={player.loopB}
      onseek={(s) => player.seek(s)}
    />
    <p class="time">
      <span id="pos"
        >{formatDuration(player.position) === '–' ? '0:00' : formatDuration(player.position)}</span
      >
      <span>{formatDuration(player.duration)}</span>
    </p>

    <div class="transport" role="group" aria-label="Kontrol putar">
      <button type="button" aria-label={t.back5} onclick={() => player.skip(-5)}
        ><Icon name="back5" /></button
      >
      <button type="button" id="prev" aria-label={t.prev} onclick={() => player.prev()}
        ><Icon name="prev" /></button
      >
      <button type="button" id="stop" aria-label={t.stop} onclick={() => player.stop()}
        ><Icon name="stop" /></button
      >
      <button
        type="button"
        class="primary play"
        id="play"
        aria-label={player.playing ? t.pause : t.play}
        onclick={() => player.toggle()}
      >
        <Icon name={player.playing ? 'pause' : 'play'} size={30} />
      </button>
      <button
        type="button"
        id="next"
        aria-label={t.next}
        disabled={!player.hasNext}
        onclick={() => player.next()}><Icon name="next" /></button
      >
      <button type="button" aria-label={t.fwd5} onclick={() => player.skip(5)}
        ><Icon name="fwd5" /></button
      >
    </div>

    <div class="modes" role="group" aria-label={t.modes}>
      <button
        type="button"
        id="mode-shuffle"
        aria-pressed={player.shuffle}
        aria-label={t.shuffle}
        onclick={() => player.toggleShuffle()}
      >
        <Icon name="shuffle" size={20} /><span>{t.shuffle}</span>
      </button>
      <button
        type="button"
        id="mode-repeat"
        aria-pressed={player.repeat !== 'off'}
        aria-label={player.repeat === 'one'
          ? t.repeatOne
          : player.repeat === 'all'
            ? t.repeatAll
            : t.repeatOff}
        onclick={() => player.cycleRepeat()}
      >
        <Icon name={player.repeat === 'one' ? 'repeatOne' : 'repeat'} size={20} /><span
          >{player.repeat === 'one'
            ? t.repeatOne
            : player.repeat === 'all'
              ? t.repeatAll
              : t.repeatOff}</span
        >
      </button>
      <button
        type="button"
        id="mode-autonext"
        aria-pressed={player.autoNext}
        aria-label={t.autoNext}
        onclick={() => player.toggleAutoNext()}
      >
        <Icon name="autoNext" size={20} /><span>{t.autoNextShort}</span>
      </button>
    </div>

    <div class="grid">
      <Stepper
        label={t.tempo}
        value={player.tempo}
        min={0.25}
        max={2}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        resetTo={1}
        resetLabel={t.reset}
        onchange={(v) => player.setTempo(v)}
      />
      <Stepper
        label={t.key}
        value={player.semitone}
        min={-12}
        max={12}
        step={1}
        format={(v) => (v > 0 ? `+${v}` : String(v))}
        resetTo={0}
        resetLabel={t.reset}
        onchange={(v) => player.setSemitone(v)}
      />
    </div>

    <div class="chips" role="group" aria-label={t.presets}>
      {#each PRESETS as p (p)}
        <button
          type="button"
          class="chip"
          aria-pressed={Math.abs(player.tempo - p) < 0.001}
          onclick={() => player.setTempo(p)}>{p}×</button
        >
      {/each}
    </div>

    <div class="tools" role="group" aria-label="Alat latihan">
      <button
        type="button"
        id="loop-a"
        class:on={player.loopA !== null}
        aria-label={t.loopA}
        title={t.loopA}
        onclick={() => player.setLoopA()}
      >
        <Icon name="loopA" />
      </button>
      <button
        type="button"
        id="loop-b"
        class:on={player.loopB !== null}
        aria-label={t.loopB}
        title={t.loopB}
        onclick={() => player.setLoopB()}
      >
        <Icon name="loopB" />
      </button>
      <button
        type="button"
        id="loop-clear"
        aria-label={t.loopClear}
        title={t.loopClear}
        disabled={player.loopA === null && player.loopB === null}
        onclick={() => player.clearLoop()}
      >
        <Icon name="loopClear" />
      </button>
      <button
        type="button"
        id="eq-toggle"
        class:on={panel === 'eq'}
        aria-pressed={panel === 'eq'}
        aria-label={t.eqToggle}
        title={t.eqToggle}
        onclick={() => toggle('eq')}
      >
        <Icon name="eq" />
      </button>
      <button
        type="button"
        id="metro-toggle"
        class:on={panel === 'metro' || player.metroOn}
        aria-pressed={panel === 'metro'}
        aria-label={t.metroToggle}
        title={t.metroToggle}
        onclick={() => toggle('metro')}
      >
        <Icon name="metronome" />
      </button>
    </div>

    {#if panel === 'eq'}
      <section class="panel" id="eq-panel" aria-label={t.eqToggle}>
        <div class="eq">
          {#each EQ_BAND_LABELS as band, i (band)}
            <div class="band">
              <span class="gain">{(player.eq[i] ?? 0) > 0 ? '+' : ''}{player.eq[i] ?? 0}</span>
              <input
                type="range"
                class="vslider"
                min="-12"
                max="12"
                step="1"
                value={player.eq[i] ?? 0}
                aria-label="{t.eqBand} {band}"
                oninput={(e) =>
                  player.setEqBand(i, Number((e.currentTarget as HTMLInputElement).value))}
              />
              <span class="hz">{band}</span>
            </div>
          {/each}
          <button
            type="button"
            id="eq-reset"
            class="ghost eqreset"
            aria-label={t.eqReset}
            title={t.eqReset}
            onclick={() => player.resetEq()}
          >
            <Icon name="reset" size={20} />
          </button>
        </div>
      </section>
    {/if}

    {#if panel === 'metro'}
      <section class="panel" id="metro-panel" aria-label={t.metroPanel}>
        <div class="mrow">
          <button
            type="button"
            id="metro-on"
            class:on={player.metroOn}
            aria-pressed={player.metroOn}
            aria-label={t.metroOn}
            title={t.metroOn}
            onclick={() => player.toggleMetronome()}
          >
            <Icon name="metronome" />
          </button>
          <button
            type="button"
            id="count-in"
            class:on={player.countIn}
            aria-pressed={player.countIn}
            aria-label={t.countIn}
            title={t.countIn}
            onclick={() => player.setCountIn(!player.countIn)}>1 2 3 4</button
          >
        </div>
        <div class="grid">
          <Stepper
            label={t.bpm}
            value={player.bpm}
            min={30}
            max={240}
            step={1}
            format={(v) => String(v)}
            resetTo={100}
            resetLabel={t.reset}
            onchange={(v) => player.setBpm(v)}
          />
          <Stepper
            label={t.beats}
            value={player.beatsPerBar}
            min={1}
            max={12}
            step={1}
            format={(v) => String(v)}
            resetTo={4}
            resetLabel={t.reset}
            onchange={(v) => player.setBeatsPerBar(v)}
          />
        </div>
      </section>
    {/if}

    <div class="bottom">
      <span class="vol-icon" aria-hidden="true"><Icon name="volume" /></span>
      <input
        type="range"
        aria-label={t.volume}
        min="0"
        max="1"
        step="0.01"
        value={player.volume}
        oninput={(e) => player.setVolume(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <button
        type="button"
        id="mo"
        class:on={player.minusOne}
        aria-pressed={player.minusOne}
        aria-label={t.minusOneToggle}
        title={t.minusOneToggle}
        onclick={() => player.setMinusOne(!player.minusOne)}
      >
        <Icon name={player.minusOne ? 'micOff' : 'mic'} />
      </button>
      <button
        type="button"
        id="mo-info"
        class="ghost"
        aria-expanded={infoOpen}
        aria-label={t.minusOneInfo}
        onclick={() => (infoOpen = !infoOpen)}
      >
        <Icon name="info" size={20} />
      </button>
    </div>
    {#if player.minusOne}
      <section class="panel" id="mo-panel" aria-label={t.moModes}>
        <div class="modes" role="group" aria-label={t.moModes}>
          {#each MODES as m (m.key)}
            <button
              type="button"
              id="mo-mode-{m.key}"
              aria-pressed={player.moParams.mode === m.key}
              onclick={() => player.setMinusOneParams({ mode: m.key })}>{m.label}</button
            >
          {/each}
        </div>
        <p class="muted" id="mo-hint">{hint}</p>
        <label class="slider">
          <span>{t.moStrength}</span>
          <input
            type="range"
            id="mo-strength"
            min="0"
            max="100"
            step="5"
            value={Math.round(player.moParams.strength * 100)}
            oninput={(e) =>
              player.setMinusOneParams({
                strength: Number((e.currentTarget as HTMLInputElement).value) / 100,
              })}
          />
          <output>{Math.round(player.moParams.strength * 100)}%</output>
        </label>
        {#if player.moParams.mode === 'bass'}
          <label class="slider">
            <span>{t.moCutoff}</span>
            <input
              type="range"
              id="mo-cutoff"
              min="80"
              max="300"
              step="10"
              value={player.moParams.cutoff}
              oninput={(e) =>
                player.setMinusOneParams({
                  cutoff: Number((e.currentTarget as HTMLInputElement).value),
                })}
            />
            <output>{player.moParams.cutoff} Hz</output>
          </label>
        {/if}
        {#if player.moParams.mode === 'focus'}
          <label class="slider">
            <span>{t.moWidth}</span>
            <input
              type="range"
              id="mo-width"
              min="0"
              max="100"
              step="5"
              value={Math.round(player.moParams.width * 100)}
              oninput={(e) =>
                player.setMinusOneParams({
                  width: Number((e.currentTarget as HTMLInputElement).value) / 100,
                })}
            />
            <output>{Math.round(player.moParams.width * 100)}%</output>
          </label>
        {/if}
      </section>
    {/if}
    {#if infoOpen}
      <p class="muted note" id="mo-note">{t.minusOneNotes}</p>
    {/if}
  {/if}
</section>

<style>
  .screen {
    display: grid;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: 1.25rem;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    min-height: 1.2em;
  }
  .error {
    color: var(--bad);
  }
  .empty {
    display: grid;
    gap: 12px;
    justify-items: center;
    padding: 48px 0;
    text-align: center;
  }
  .row2 {
    display: grid;
    gap: 8px;
    justify-items: stretch;
  }
  .file {
    position: relative;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .link {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    min-height: 32px;
    padding: 0 8px;
    background: transparent;
    color: var(--accent);
    font-size: 0.9rem;
  }
  .time {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-size: 0.9rem;
    margin-top: -6px;
  }
  .transport {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1.5fr 1fr 1fr;
    gap: 6px;
  }
  .transport button {
    padding: 0;
    min-width: 0;
    display: grid;
    place-items: center;
    min-height: 56px;
  }
  .transport button:disabled {
    opacity: 0.35;
  }
  .play {
    min-height: 64px !important;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .modes button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    min-height: 44px;
    padding: 0 6px;
    font-size: 0.82rem;
  }
  .modes span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tools {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .tools button,
  .mrow button {
    padding: 0;
    min-width: 0;
    display: grid;
    place-items: center;
    min-height: 52px;
  }
  .tools button.on,
  .mrow button.on {
    background: var(--accent);
    color: #06121a;
  }
  .tools button:disabled {
    opacity: 0.35;
  }
  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 12px;
    display: grid;
    gap: 10px;
  }
  .eq {
    display: grid;
    grid-template-columns: repeat(5, 1fr) var(--tap);
    gap: 4px;
    align-items: end;
  }
  .band {
    display: grid;
    justify-items: center;
    gap: 2px;
  }
  .gain,
  .hz {
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .vslider {
    writing-mode: vertical-lr;
    direction: rtl;
    width: 44px;
    height: 130px;
    min-height: 0;
  }
  .eqreset {
    padding: 0;
    display: grid;
    place-items: center;
  }
  .mrow {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
  }
  .mrow button {
    letter-spacing: 0.08em;
  }
  .grid {
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr 1fr;
  }
  .chips {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .bottom {
    display: grid;
    grid-template-columns: auto 1fr var(--tap) var(--tap);
    align-items: center;
    gap: 6px;
  }
  .bottom button {
    padding: 0;
    display: grid;
    place-items: center;
  }
  .bottom button.on {
    background: var(--accent);
    color: #06121a;
  }
  .ghost {
    background: transparent;
    color: var(--muted);
  }
  .vol-icon {
    color: var(--muted);
    padding-left: 4px;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .slider {
    display: grid;
    grid-template-columns: 7.5rem 1fr 4rem;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .slider output {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }
  .note {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 10px 12px;
  }
</style>
