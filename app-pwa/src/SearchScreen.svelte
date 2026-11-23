<script lang="ts">
  import {
    ALL_SOURCES,
    SEARCH_MODES,
    SORT_KEYS,
    formatBytes,
    formatDuration,
    type SearchHit,
    type SourceTrack,
  } from '@musik/core';
  import { id } from '@musik/ui';
  import Icon from '@musik/ui/components/Icon.svelte';
  import type { Player } from './player.svelte';
  import { keyOf, type SearchFlow } from './search.svelte';

  interface Props {
    player: Player;
    flow: SearchFlow;
    onplay: () => void;
  }
  let { player, flow, onplay }: Props = $props();
  const t = id.search;

  const items = $derived(flow.items);
  const failed = $derived(flow.groups.filter((g) => g.error));
  const more = $derived(flow.groups.filter((g) => g.hasMore));

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
  {@const open = flow.expanded[key]}
  <li data-key={key} data-source={item.source}>
    <div class="info">
      <span class="name">{item.title}</span>
      <span class="meta">
        {#if item.creator}<span class="artist">{item.creator}</span> ·
        {/if}{#if item.year}{item.year}
          ·
        {/if}{#if item.durationSec}{formatDuration(item.durationSec)} ·
        {/if}{#if item.size}{formatBytes(item.size)} ·
        {/if}
        <a href={item.license.url} target="_blank" rel="noopener noreferrer">{item.license.label}</a
        >
        {#if !item.license.commercial}· {t.noCommercial}{/if}
        {#if !item.license.derivatives}· {t.noDerivatives}{/if}
      </span>
      <span class="meta">
        <span class="tag">{t.sources[item.source]}</span> ·
        <a href={item.pageUrl} target="_blank" rel="noopener noreferrer">{t.openPage}</a>
      </span>
    </div>
    <div class="act">
      {#if item.downloadUrl === null}
        <button
          type="button"
          class="icon expand"
          aria-label="{open ? t.hideTracks : t.showTracks}: {item.title}"
          title={open ? t.hideTracks : t.showTracks}
          aria-expanded={open ? 'true' : 'false'}
          onclick={() => flow.expand(item)}
        >
          <Icon name={open ? 'loopClear' : 'list'} />
        </button>
      {:else if dl?.phase === 'done'}
        <button
          type="button"
          class="icon primary"
          aria-label="{t.play}: {item.title}"
          title={t.play}
          onclick={() => play(key)}
        >
          <Icon name="play" />
        </button>
      {:else if dl?.phase === 'downloading' || dl?.phase === 'saving'}
        <span class="progress" aria-live="polite">
          {#if dl.phase === 'saving'}{t.saving}{:else}{percent(dl.received, dl.total) !== null
              ? `${percent(dl.received, dl.total)}%`
              : formatBytes(dl.received)}{/if}
        </span>
      {:else}
        <button
          type="button"
          class="icon dl"
          aria-label="{t.download}: {item.title}"
          title={t.download}
          onclick={() => flow.download(item as SourceTrack, player)}
        >
          <Icon name="save" />
        </button>
      {/if}
    </div>
    {#if dl?.phase === 'done'}
      <p class="ok" role="status">{t.saved}</p>
    {:else if dl?.phase === 'error'}
      <p class="error" role="alert">{dl.error}</p>
    {/if}
    {#if item.downloadUrl === null && open}
      {#if open.loading}
        <p class="muted">{t.loadingTracks}</p>
      {:else if open.error}
        <p class="error" role="alert">{open.error}</p>
      {:else if open.tracks.length === 0}
        <p class="muted">{t.noTracks}</p>
      {:else}
        <ul class="tracks">
          {#each open.tracks as track (track.id)}
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
      placeholder={t.placeholders[flow.mode]}
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

  <div class="chips" role="group" aria-label={t.modeLabel}>
    {#each SEARCH_MODES as mode (mode)}
      <button
        type="button"
        class="chip mode"
        data-mode={mode}
        aria-pressed={flow.mode === mode}
        onclick={() => flow.setMode(mode)}>{t.modes[mode]}</button
      >
    {/each}
  </div>

  <div class="chips" role="group" aria-label="Sumber">
    {#each ALL_SOURCES as source (source)}
      <button
        type="button"
        class="chip source"
        aria-pressed={flow.sources.includes(source)}
        onclick={() => flow.toggleSource(source)}>{t.sources[source]}</button
      >
    {/each}
  </div>

  <div class="sort">
    <label class="muted" for="search-sort">{t.sortLabel}</label>
    <select
      id="search-sort"
      value={flow.sortKey}
      onchange={(e) => flow.setSort(e.currentTarget.value as (typeof SORT_KEYS)[number])}
    >
      {#each SORT_KEYS as key (key)}
        <option value={key}>{t.sorts[key]}</option>
      {/each}
    </select>
    <button
      type="button"
      class="icon"
      id="search-dir"
      aria-label={flow.sortDir === 'asc' ? t.dirAsc : t.dirDesc}
      title={flow.sortDir === 'asc' ? t.dirAsc : t.dirDesc}
      disabled={flow.sortKey === 'relevance'}
      onclick={() => flow.toggleDir()}
    >
      <Icon name={flow.sortDir === 'asc' ? 'sortUp' : 'sortDown'} />
    </button>
  </div>

  {#each failed as group (group.source)}
    <p class="error" data-source={group.source}>
      {t.sources[group.source]}
      {t.sourceFailed}: {group.error}
    </p>
  {/each}

  {#if flow.status === 'done' && items.length === 0 && failed.length < flow.groups.length}
    <p class="muted">{t.noResult}</p>
  {/if}

  {#if items.length > 0}
    <ul class="results" id="search-results">
      {#each items as item (keyOf(item))}
        {@render row(item)}
      {/each}
    </ul>
  {/if}

  {#if more.length > 0}
    <div class="chips">
      {#each more as group (group.source)}
        <button
          type="button"
          class="more"
          data-source={group.source}
          onclick={() => flow.more(group.source)}
          disabled={group.loadingMore}
          >{group.loadingMore ? t.searching : `${t.more}: ${t.sources[group.source]}`}</button
        >
      {/each}
    </div>
  {/if}

  {#if items.length > 0}<p class="muted">{t.sortHint}</p>{/if}
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
  input,
  select {
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
  .sort {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
  }
  button.icon {
    min-width: var(--tap);
    min-height: var(--tap);
    padding: 0;
    display: inline-grid;
    place-items: center;
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
  .artist {
    color: var(--fg);
  }
  .tag {
    border: 1px solid var(--panel-2);
    border-radius: 999px;
    padding: 0 6px;
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
