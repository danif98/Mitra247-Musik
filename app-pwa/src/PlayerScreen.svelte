<script lang="ts">
  import { id } from '@musik/ui';
  import Icon from '@musik/ui/components/Icon.svelte';
  import Stepper from '@musik/ui/components/Stepper.svelte';
  import Waveform from '@musik/ui/components/Waveform.svelte';
  import { formatDuration, isSupportedAudio } from '@musik/core';
  import type { Player } from './player.svelte';

  interface Props {
    player: Player;
    ongoLibrary: () => void;
  }
  let { player, ongoLibrary }: Props = $props();
  const t = id.player;
  const PRESETS = [0.5, 0.75, 1, 1.25];

  let infoOpen = $state(false);

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
    </header>

    <Waveform
      peaks={player.current.peaks}
      position={player.position}
      duration={player.duration}
      label={t.seek}
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
  .note {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 10px 12px;
  }
</style>
