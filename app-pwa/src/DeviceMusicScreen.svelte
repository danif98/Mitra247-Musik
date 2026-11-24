<script lang="ts">
  import { onMount } from 'svelte';
  import { formatBytes, formatDuration } from '@musik/core';
  import { id } from '@musik/ui';
  import type { DeviceMusic } from './device.svelte';
  import type { NativeSong } from './native';
  import type { Player } from './player.svelte';

  interface Props {
    player: Player;
    device: DeviceMusic;
    onplay: () => void;
  }
  let { player, device, onplay }: Props = $props();
  const t = id.device;

  // Read the list again every time this view opens: files come and go outside the app.
  onMount(() => {
    void device.load();
  });

  async function open(song: NativeSong) {
    if (await device.play(song, player)) onplay();
  }
</script>

{#snippet songRow(song: NativeSong)}
  <button
    type="button"
    class="item"
    data-id={song.id}
    disabled={device.opening !== ''}
    onclick={() => open(song)}
  >
    <span class="name">{song.title}</span>
    <span class="meta">
      {#if song.artist}{song.artist} ·
      {/if}{formatDuration(song.durationMs / 1000)} · {formatBytes(
        song.size,
      )}{#if device.opening === song.id}
        · {t.opening}{/if}
    </span>
  </button>
{/snippet}

<div class="wrap">
  <div class="modes" role="group" aria-label={t.tab}>
    <button
      type="button"
      id="device-mode-folders"
      aria-pressed={device.mode === 'folders'}
      onclick={() => (device.mode = 'folders')}>{t.modeFolders}</button
    >
    <button
      type="button"
      id="device-mode-all"
      aria-pressed={device.mode === 'all'}
      onclick={() => (device.mode = 'all')}>{t.modeAll}</button
    >
  </div>

  <button
    type="button"
    id="device-refresh"
    class="refresh"
    onclick={() => device.load()}
    disabled={device.loading}
  >
    ↻ {device.loading ? t.loading : t.refresh}
  </button>

  {#if device.mode === 'all'}
    <input
      class="search"
      type="search"
      placeholder={t.search}
      aria-label={t.search}
      bind:value={device.query}
    />
  {/if}
  <p class="muted" role="status" id="device-message">
    {#if device.loading}{t.loading}{:else if device.hidden > 0}{device.hidden}
      {t.hidden}{:else if device.loaded && device.mode === 'all'}{device.visible.length}
      {t.songs}{/if}
  </p>
  {#if device.error}
    <p class="error" role="alert" id="device-error">{device.error}</p>
    <button type="button" class="primary" onclick={() => device.load()} disabled={device.loading}
      >{t.retry}</button
    >
  {/if}

  {#if device.loaded && device.songs.length === 0}
    <p class="muted">{t.empty}</p>
  {:else if device.loaded && device.mode === 'all'}
    {#if device.visible.length === 0}
      <p class="muted">{t.noResult}</p>
    {:else}
      <ul class="list" id="device-list">
        {#each device.visible as song (song.id)}
          <li>{@render songRow(song)}</li>
        {/each}
      </ul>
    {/if}
  {:else if device.loaded}
    {@const listing = device.listing}
    <nav class="crumbs" aria-label={t.storages} id="device-crumbs">
      <button type="button" class="crumb" onclick={() => (device.volume = null)}
        >{t.storages}</button
      >
      {#if device.volume !== null}
        <span aria-hidden="true">›</span>
        <button type="button" class="crumb" onclick={() => device.openVolume(device.volume!)}
          >{device.volumeLabel(device.volume)}</button
        >
        {#each device.crumbs as crumb (crumb.path)}
          <span aria-hidden="true">›</span>
          <button type="button" class="crumb" onclick={() => device.openFolder(crumb.path)}
            >{crumb.name}</button
          >
        {/each}
      {/if}
    </nav>

    <ul class="list" id="device-folders">
      {#if device.volume !== null}
        <li>
          <button type="button" class="item up" id="device-up" onclick={() => device.up()}>
            <span class="name">↰ {t.up}</span>
          </button>
        </li>
      {/if}
      {#each listing.volumes as v (v.volume)}
        <li>
          <button
            type="button"
            class="item folder"
            data-volume={v.volume}
            onclick={() => device.openVolume(v.volume)}
          >
            <span class="name"
              >{v.volume === 'external_primary' ? '📱' : '💾'} {device.volumeLabel(v.volume)}</span
            >
            <span class="meta">{v.count} {t.songs}</span>
          </button>
        </li>
      {/each}
      {#each listing.folders as f (f.path)}
        <li>
          <button
            type="button"
            class="item folder"
            data-folder={f.path}
            onclick={() => device.openFolder(f.path)}
          >
            <span class="name">📁 {f.name}</span>
            <span class="meta">{f.count} {t.songs}</span>
          </button>
        </li>
      {/each}
      {#each listing.songs as song (song.id)}
        <li>{@render songRow(song)}</li>
      {/each}
    </ul>
    {#if device.volume !== null && listing.folders.length === 0 && listing.songs.length === 0}
      <p class="muted">{t.emptyFolder}</p>
    {/if}
    <p class="muted">{t.folderHint}</p>
  {/if}
</div>

<style>
  .wrap {
    display: grid;
    gap: 12px;
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
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .refresh {
    min-height: 40px;
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    color: var(--muted);
  }
  .crumb {
    min-height: 36px;
    padding: 0 8px;
    background: transparent;
    border: none;
    color: var(--accent);
    font: inherit;
  }
  .folder .name {
    font-weight: 600;
  }
  .search {
    min-height: var(--tap);
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--panel-2);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }
  .item {
    display: grid;
    gap: 2px;
    width: 100%;
    min-height: var(--tap);
    padding: 8px 12px;
    text-align: left;
    border-radius: var(--radius);
    border: 1px solid var(--panel-2);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
