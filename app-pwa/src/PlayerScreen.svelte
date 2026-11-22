<script lang="ts">
  import { id } from '@musik/ui';
  import Stepper from '@musik/ui/components/Stepper.svelte';
  import Waveform from '@musik/ui/components/Waveform.svelte';
  import { formatDuration } from '@musik/core';
  import type { Player } from './player.svelte';

  interface Props {
    player: Player;
    ongoLibrary: () => void;
  }
  let { player, ongoLibrary }: Props = $props();
  const t = id.player;
  const PRESETS = [0.5, 0.75, 1, 1.25];
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
      <button type="button" class="primary" onclick={ongoLibrary}>{t.goLibrary}</button>
    </div>
  {:else}
    <header>
      <h1 id="song-title">{player.current.title}</h1>
      <p class="muted">{player.current.fileName}</p>
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

    <div class="transport">
      <button type="button" aria-label={t.back5} onclick={() => player.skip(-5)}>⏪ 5</button>
      <button type="button" class="primary play" id="play" onclick={() => player.toggle()}>
        {player.playing ? t.pause : t.play}
      </button>
      <button type="button" aria-label={t.fwd5} onclick={() => player.skip(5)}>5 ⏩</button>
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

    <section class="panel">
      <div class="row">
        <h3>{t.minusOne}</h3>
        <div class="seg">
          <button
            type="button"
            id="mo-off"
            aria-pressed={!player.minusOne}
            onclick={() => player.setMinusOne(false)}>{t.off}</button
          >
          <button
            type="button"
            id="mo-on"
            aria-pressed={player.minusOne}
            onclick={() => player.setMinusOne(true)}>{t.on}</button
          >
        </div>
      </div>
      <p class="muted">{t.mode}</p>
      <p class="muted">{t.minusOneNote} {t.minusOneMono}</p>
    </section>

    <label class="volume">
      <span class="muted">{t.volume}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={player.volume}
        oninput={(e) => player.setVolume(Number((e.currentTarget as HTMLInputElement).value))}
      />
    </label>
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
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
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
  .time {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .transport {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    gap: 8px;
  }
  .play {
    min-height: 64px;
    font-size: 1.2rem;
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
  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 12px;
    display: grid;
    gap: 6px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .volume {
    display: grid;
    gap: 2px;
  }
</style>
