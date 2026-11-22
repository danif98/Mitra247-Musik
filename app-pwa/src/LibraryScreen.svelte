<script lang="ts">
  import { id } from '@musik/ui';
  import { formatBytes, formatDuration, isSupportedAudio, matchesQuery } from '@musik/core';
  import type { SongMeta } from '@musik/core';
  import type { Player } from './player.svelte';

  interface Props {
    player: Player;
    onplay: () => void;
  }
  let { player, onplay }: Props = $props();
  const t = id.library;

  let query = $state('');
  let message = $state('');
  let busy = $state(false);

  const visible = $derived(player.songs.filter((s) => matchesQuery(s, query)));

  async function onFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const all = Array.from(input.files ?? []);
    input.value = '';
    const files = all.filter(isSupportedAudio);
    const skipped = all.length - files.length;
    if (files.length === 0) {
      message = t.unsupported;
      return;
    }
    busy = true;
    message = `${t.adding} ${files.length}…`;
    const { added, rejected } = await player.addFiles(files);
    busy = false;
    message = `${added} ${t.added}${skipped + rejected ? `, ${skipped + rejected} ${t.unsupported.toLowerCase()}` : ''}`;
  }

  async function open(song: SongMeta) {
    await player.select(song);
    onplay();
  }

  async function rename(song: SongMeta) {
    const name = prompt(t.renamePrompt, song.title);
    if (name !== null) await player.rename(song, name);
  }

  async function remove(song: SongMeta) {
    if (confirm(t.removeConfirm)) await player.remove(song);
  }
</script>

<section class="screen">
  <h1>{t.title}</h1>

  {#if !player.storageOk}
    <p class="error">{t.storageUnsupported}</p>
  {:else}
    <div class="bar">
      <label class="btn primary file">
        {t.add}
        <input
          type="file"
          id="add-files"
          accept="audio/*,.flac,.m4a,.opus"
          multiple
          onchange={onFiles}
          disabled={busy}
        />
      </label>
    </div>
    <input
      class="search"
      type="search"
      placeholder={t.search}
      aria-label={t.search}
      bind:value={query}
    />
    <p class="muted" id="lib-message" role="status">{message}</p>

    {#if player.songs.length === 0}
      <div class="empty">
        <p>{t.empty}</p>
        <p class="muted">{t.emptyHint}</p>
      </div>
    {:else if visible.length === 0}
      <p class="muted">{t.noResult}</p>
    {:else}
      <ul id="song-list">
        {#each visible as song (song.id)}
          <li class:current={player.current?.id === song.id}>
            <button type="button" class="open" onclick={() => open(song)}>
              <span class="name">{song.title}</span>
              <span class="meta">
                {formatDuration(song.duration)} · {formatBytes(song.size)} · {song.source ===
                'youtube'
                  ? t.fromYoutube
                  : t.local}
                {#if player.current?.id === song.id}· {t.now}{/if}
              </span>
            </button>
            <button type="button" aria-label="{t.rename}: {song.title}" onclick={() => rename(song)}
              >✎</button
            >
            <button type="button" aria-label="{t.remove}: {song.title}" onclick={() => remove(song)}
              >🗑</button
            >
          </li>
        {/each}
      </ul>
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
    font-size: 1.3rem;
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
  .file {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
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
  .empty {
    padding: 32px 0;
    text-align: center;
    display: grid;
    gap: 6px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: grid;
    grid-template-columns: 1fr var(--tap) var(--tap);
    gap: 6px;
    background: var(--panel);
    border-radius: var(--radius);
    padding: 4px;
  }
  li.current {
    outline: 2px solid var(--accent);
  }
  .open {
    display: grid;
    text-align: left;
    background: transparent;
    padding: 6px 10px;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .meta {
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
