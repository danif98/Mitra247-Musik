<script lang="ts">
  import { onMount } from 'svelte';
  import { id } from '@musik/ui';
  import { formatBytes } from '@musik/core';
  import type { Player } from './player.svelte';

  interface Props {
    player: Player;
  }
  let { player }: Props = $props();
  const t = id.settings;

  let usage = $state('');
  let persisted = $state<boolean | null>(null);

  async function refresh() {
    try {
      const est = await navigator.storage?.estimate?.();
      usage = est ? `${formatBytes(est.usage ?? 0)} / ${formatBytes(est.quota ?? 0)}` : '–';
      persisted = (await navigator.storage?.persisted?.()) ?? null;
    } catch {
      usage = '–';
    }
  }
  onMount(refresh);

  async function requestPersist() {
    await navigator.storage?.persist?.();
    await refresh();
  }

  async function clearAll() {
    if (!confirm(t.clearConfirm)) return;
    await player.clearAll();
    await refresh();
  }
</script>

<section class="screen">
  <h1>{t.title}</h1>

  <div class="panel">
    <h3>{t.engine}</h3>
    <div class="seg">
      <button
        type="button"
        id="set-r2"
        aria-pressed={player.engineKind === 'R2'}
        onclick={() => player.setEngineKind('R2')}>{t.engineR2}</button
      >
      <button
        type="button"
        id="set-r3"
        aria-pressed={player.engineKind === 'R3'}
        onclick={() => player.setEngineKind('R3')}>{t.engineR3}</button
      >
    </div>
    <p class="muted">{t.engineNote}</p>
  </div>

  <div class="panel">
    <h3>{t.storage}</h3>
    <p>{t.used}: <span id="usage">{usage}</span></p>
    <p class="muted">{persisted ? t.persisted : t.notPersisted}</p>
    {#if persisted === false}
      <button type="button" onclick={requestPersist}>{t.requestPersist}</button>
    {/if}
    <button type="button" id="clear-data" onclick={clearAll}>{t.clearData}</button>
  </div>

  <div class="panel">
    <h3>{t.about}</h3>
    <p class="muted">{t.build}: {__BUILD__}</p>
    <a class="btn" href="./lab/">{t.lab}</a>
  </div>
</section>

<style>
  .screen {
    display: grid;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 1rem;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 12px;
    display: grid;
    gap: 8px;
  }
  .seg {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr 1fr;
  }
  a.btn {
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    color: var(--fg);
  }
</style>
