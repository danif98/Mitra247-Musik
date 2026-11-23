<script lang="ts">
  import { formatBytes, formatDuration, type SearchHit, type SourceTrack } from '@musik/core';
  import { ALL_SOURCES } from '@musik/core';
  import { id } from '@musik/ui';
  import type { Player } from './player.svelte';
  import { keyOf, type SearchFlow } from './search.svelte';

  interface Props {
    player: Player;
    flow: SearchFlow;
    onplay: () => void;
  }
  let { player, flow, onplay }: Props = $props();
  const t = id.search;

  async function play(key: string) {
    const song = flow.downloads[key]?.song;
    if (song) {
      await player.select(song);
      onplay();
    }
  }

  function percent(received: number, total: number | null): number | null {
    return total ? Math.min(100, Math.round((received / total) * 100)) : null;
  }
</script>

{#snippet row(item: SearchHit | SourceTrack)}
  {@const key = keyOf(item)}
  {@const dl = flow.downloads[key]}
  <li data-key={key}>
    <div class="info">
      <span class="name">{item.title}</span>
      <span class="meta">
        {#if item.creator}{item.creator} ·
        {/if}{#if item.durationSec}{formatDuration(item.durationSec)} ·
        {/if}{#if item.size}{formatBytes(item.size)} ·
        {/if}
        <a href={item.license.url} target="_blank" rel="noopener noreferrer">{item.license.label}</a
        >
        {#if !item.license.commercial}· {t.noCommercial}{/if}
        {#if !item.license.derivatives}· {t.noDerivatives}{/if}
      </span>
      <a class="meta" href={item.pageUrl} target="_blank" rel="noopener noreferrer">{t.openPage}</a>
    </div>
    <div class="act">
      {#if item.downloadUrl === null}
        <button type="button" onclick={() => flow.expand(item)} class="expand">
          {flow.expanded[key] ? t.hideTracks : t.showTracks}
        </button>
      {:else if dl?.phase === 'done'}
        <button type="button" class="primary" onclick={() => play(key)}>{t.play}</button>
      {:else if dl?.phase === 'downloading' || dl?.phase === 'saving'}
        <span class="progress" aria-live="polite">
          {#if dl.phase === 'saving'}{t.saving}{:else}{t.downloading}
            {percent(dl.received, dl.total) ?? formatBytes(dl.received)}{percent(
              dl.received,
              dl.total,
            ) !== null
              ? '%'
              : ''}{/if}
        </span>
      {:else}
        <button type="button" class="dl" onclick={() => flow.download(item as SourceTrack, player)}
          >{t.download}</button
        >
      {/if}
    </div>
    {#if dl?.phase === 'done'}
      <p class="ok" role="status">{t.saved}</p>
    {:else if dl?.phase === 'error'}
      <p class="error" role="alert">{dl.error}</p>
    {/if}
    {#if item.downloadUrl === null && flow.expanded[key]}
      {@const ex = flow.expanded[key]}
      {#if ex.loading}
        <p class="muted">{t.loadingTracks}</p>
      {:else if ex.error}
        <p class="error" role="alert">{ex.error}</p>
      {:else if ex.tracks.length === 0}
        <p class="muted">{t.noTracks}</p>
      {:else}
        <ul class="tracks">
          {#each ex.tracks as track (track.id)}
            {@render row(track)}
          {/each}
        </ul>
      {/if}
    {/if}
  </li>
{/snippet}

<section class="screen">
  <h1>{t.title}</h1>
  <p class="muted">{t.intro}</p>

  <form
    class="search"
    onsubmit={(e) => {
      e.preventDefault();
      void flow.search();
    }}
  >
    <input
      id="search-q"
      type="search"
      enterkeyhint="search"
      autocomplete="off"
      placeholder={t.placeholder}
      bind:value={flow.query}
    />
    <button
      type="submit"
      class="primary"
      id="search-go"
      disabled={flow.status === 'searching' || flow.query.trim() === ''}
      >{flow.status === 'searching' ? t.searching : t.submit}</button
    >
  </form>

  <div class="chips" role="group" aria-label="Sumber">
    {#each ALL_SOURCES as source (source)}
      <button
        type="button"
        class="chip"
        aria-pressed={flow.sources.includes(source)}
        onclick={() => flow.toggleSource(source)}>{t.sources[source]}</button
      >
    {/each}
  </div>

  {#each flow.groups as group (group.source)}
    <section class="group" data-source={group.source}>
      <h2>{t.sources[group.source]}</h2>
      {#if group.error}
        <p class="error">{t.sources[group.source]} {t.sourceFailed}: {group.error}</p>
      {:else if group.hits.length === 0}
        <p class="muted">{t.noResult}</p>
      {/if}
      {#if group.hits.length > 0}
        <ul class="results">
          {#each group.hits as hit (keyOf(hit))}
            {@render row(hit)}
          {/each}
        </ul>
      {/if}
      {#if group.hasMore}
        <button type="button" onclick={() => flow.more(group.source)} disabled={group.loadingMore}
          >{group.loadingMore ? t.searching : t.more}</button
        >
      {/if}
    </section>
  {/each}

  <p class="muted">{t.licenseHint}</p>
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
  h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--muted);
  }
  p {
    margin: 0;
  }
  .muted,
  .meta {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .error {
    color: var(--bad);
  }
  .ok {
    color: var(--ok);
    font-size: 0.9rem;
  }
  .search {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }
  input {
    min-height: var(--tap);
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--panel-2);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    min-width: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip[aria-pressed='true'] {
    background: var(--panel-2);
    color: var(--accent);
    font-weight: 700;
  }
  .group {
    display: grid;
    gap: 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 10px;
    align-items: center;
  }
  li > :global(p),
  li > :global(ul) {
    grid-column: 1 / -1;
  }
  .tracks {
    margin-top: 4px;
  }
  .tracks li {
    background: var(--panel-2);
  }
  .info {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .meta {
    overflow-wrap: anywhere;
  }
  a {
    color: var(--accent);
  }
  .progress {
    color: var(--muted);
    font-size: 0.9rem;
    white-space: nowrap;
  }
</style>
