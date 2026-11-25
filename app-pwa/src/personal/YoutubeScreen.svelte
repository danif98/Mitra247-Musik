<script lang="ts">
  import { formatDuration } from '@musik/core';
  import { id } from '@musik/ui';
  import { idp } from './strings';
  import type { Player } from '../player.svelte';
  import type { ServerSettings } from './server.svelte';
  import type { FoundVideo, QueueItem, YoutubeFlow } from './youtube.svelte';
  import { native } from '../native';

  interface Props {
    player: Player;
    server: ServerSettings;
    flow: YoutubeFlow;
    ongoSettings: () => void;
    onplay: () => void;
  }
  let { player, server, flow, ongoSettings, onplay }: Props = $props();
  const t = idp.youtube;

  const stepLabel: Record<string, string> = {
    queued: t.steps.queued,
    download: t.steps.download,
    convert: t.steps.convert,
    saving: t.steps.saving,
    done: t.steps.done,
  };

  async function paste() {
    try {
      flow.url = (await navigator.clipboard.readText()).trim();
    } catch {
      /* clipboard permission denied: user can paste manually */
    }
  }

  function convert(r: FoundVideo) {
    flow.enqueue(r.videoId, r.label, server, player);
  }

  async function playItem(item: QueueItem) {
    if (await flow.play(item, player)) onplay();
  }

  /** Loads the next page when the end of the list comes near the screen (infinite scroll). */
  function nearEnd(node: HTMLElement) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void flow.loadMore(server);
      },
      { rootMargin: '500px' },
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  const previewSrc = $derived(
    flow.previewId
      ? `https://www.youtube-nocookie.com/embed/${flow.previewId}?autoplay=1&playsinline=1&rel=0`
      : '',
  );
  const previewItem = $derived(flow.previewId ? flow.itemFor(flow.previewId) : undefined);
  const previewQueued = $derived(previewItem !== undefined && previewItem.status !== 'error');
  const finished = $derived(flow.queue.some((q) => q.status === 'done' || q.status === 'error'));

  function convertPreview() {
    const r = flow.results.find((x) => x.videoId === flow.previewId);
    if (r) convert(r);
    else flow.enqueue(flow.previewId, flow.previewTitle, server, player);
  }
</script>

<section class="screen">
  <h1>{t.title}</h1>

  {#if !native && !server.configured}
    <div class="panel">
      <p id="need-server">{t.needServer}</p>
      <button type="button" class="primary" onclick={ongoSettings}>{t.goSettings}</button>
    </div>
  {/if}

  {#if flow.previewId}
    <div class="preview" id="yt-preview">
      <div class="preview-head">
        <strong class="name">{flow.previewTitle}</strong>
        <button type="button" id="yt-preview-close" onclick={() => flow.closePreview()}
          >{t.preview.close}</button
        >
      </div>
      <iframe
        title={t.preview.title}
        src={previewSrc}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
      <p class="muted">{t.preview.note}</p>
      <div class="row">
        <a
          class="btn"
          href={`https://www.youtube.com/watch?v=${flow.previewId}`}
          target="_blank"
          rel="noopener noreferrer">{t.preview.open}</a
        >
        <button
          type="button"
          class="primary"
          id="yt-preview-convert"
          disabled={previewQueued}
          onclick={convertPreview}>{previewQueued ? t.search.queued : t.preview.convert}</button
        >
      </div>
    </div>
  {/if}

  <form
    class="field"
    onsubmit={(e) => {
      e.preventDefault();
      void flow.search(server);
    }}
  >
    <label class="field">
      <span class="muted">{t.search.label}</span>
      <input
        id="yt-query"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        maxlength="100"
        placeholder={t.search.placeholder}
        bind:value={flow.query}
      />
    </label>
    <button
      type="submit"
      class="primary"
      id="yt-search"
      disabled={flow.searching || flow.query.trim() === ''}
      >{flow.searching ? t.search.searching : t.search.button}</button
    >
  </form>

  {#if flow.searchError}
    <p class="error" role="alert" id="yt-search-error">{flow.searchError}</p>
  {/if}

  {#if flow.searched && !flow.searching}
    {#if flow.results.length === 0}
      <p class="muted" id="yt-empty">{t.search.empty}</p>
    {:else}
      <p class="muted">{t.search.pickHint}</p>
      <ul class="results" id="yt-results">
        {#each flow.results as r (r.videoId)}
          {@const item = flow.itemFor(r.videoId)}
          <li data-video={r.videoId}>
            <div class="result">
              <img src={r.thumbnail} alt="" width="120" height="68" loading="lazy" />
              <span class="info">
                <span class="name">{r.label}</span>
                <span class="meta"
                  >{r.channel ? `${r.channel} · ` : ''}{formatDuration(r.duration)}</span
                >
                <span class="actions">
                  <button
                    type="button"
                    class="preview-btn"
                    aria-label={`${t.search.preview}: ${r.label}`}
                    aria-pressed={flow.previewId === r.videoId}
                    onclick={() => flow.openPreview(r, player)}>▶ {id.player.play}</button
                  >
                  <button
                    type="button"
                    class="convert-btn"
                    aria-label={`${t.search.convert}: ${r.label}`}
                    disabled={item !== undefined && item.status !== 'error'}
                    onclick={() => convert(r)}
                    >{item && item.status === 'done'
                      ? t.search.converted
                      : item && item.status !== 'error'
                        ? t.search.queued
                        : t.search.convert}</button
                  >
                </span>
              </span>
            </div>
          </li>
        {/each}
      </ul>
      {#if flow.hasMore}
        {#key flow.results.length}
          <div class="sentinel" use:nearEnd></div>
        {/key}
        <button
          type="button"
          id="yt-more"
          disabled={flow.loadingMore}
          onclick={() => flow.loadMore(server)}
          >{flow.loadingMore ? t.search.loadingMore : t.search.more}</button
        >
      {:else}
        <p class="muted center" id="yt-end">{t.search.end}</p>
      {/if}
    {/if}
  {/if}

  <section class="queue" aria-label={t.queue.title}>
    <h2>{t.queue.title}</h2>
    <p class="muted">{t.queue.hint}</p>
    {#if flow.queue.length === 0}
      <p class="muted" id="yt-queue-empty">{t.queue.empty}</p>
    {:else}
      <ol class="queue-list" id="yt-queue">
        {#each flow.queue as item (item.videoId)}
          <li data-video={item.videoId} data-status={item.status}>
            <span class="name">{item.title}</span>
            <span
              class="state"
              class:ok={item.status === 'done'}
              class:bad={item.status === 'error'}
              aria-live="polite"
            >
              {#if item.status === 'waiting'}
                {t.queue.waiting}
              {:else if item.status === 'error'}
                {item.error}
              {:else}
                {stepLabel[item.phase] ?? ''}
              {/if}
            </span>
            {#if item.status === 'done' && item.savedName}
              <span class="muted">{t.savedTo} {item.savedName} {t.savedIn} {item.savedFolder}</span>
            {:else if item.status === 'done' && item.saveFailed}
              <span class="error">{t.saveFolderFailedNote}</span>
            {/if}
            <span class="actions">
              {#if item.status === 'done'}
                <button type="button" class="primary yt-play" onclick={() => playItem(item)}
                  >{t.queue.play}</button
                >
              {:else if item.status === 'error'}
                <button
                  type="button"
                  onclick={() => flow.enqueue(item.videoId, item.title, server, player)}
                  >{t.queue.retry}</button
                >
              {/if}
              {#if item.status !== 'running'}
                <button
                  type="button"
                  aria-label={`${t.queue.remove}: ${item.title}`}
                  onclick={() => flow.remove(item.videoId)}>✕</button
                >
              {/if}
            </span>
          </li>
        {/each}
      </ol>
      {#if flow.waitSec > 0}
        <p class="muted" id="yt-pause" aria-live="polite">
          {t.queue.pauseNext}: {flow.waitSec}
          {t.queue.seconds}
        </p>
      {/if}
      {#if finished}
        <button type="button" onclick={() => flow.clearFinished()}>{t.queue.clearDone}</button>
      {/if}
    {/if}
  </section>

  <p class="muted sep">{t.search.or}</p>

  <label class="field">
    <span class="muted">{t.urlLabel}</span>
    <input
      id="yt-url"
      type="url"
      inputmode="url"
      autocomplete="off"
      placeholder={t.placeholder}
      bind:value={flow.url}
    />
  </label>
  <div class="row">
    <button type="button" onclick={paste}>{t.paste}</button>
    <button
      type="button"
      class="primary"
      id="yt-save"
      onclick={() => flow.addUrl(server, player)}
      disabled={flow.url.trim() === ''}>{t.save}</button
    >
  </div>
  {#if flow.urlError}
    <p class="error" role="alert" id="yt-error">{flow.urlError}</p>
  {/if}
  <p class="muted">{t.hint}</p>
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
    font-size: 1.1rem;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .center {
    text-align: center;
  }
  .error {
    color: var(--bad);
  }
  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 12px;
    display: grid;
    gap: 8px;
  }
  .field {
    display: grid;
    gap: 4px;
  }
  input {
    min-height: var(--tap);
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--panel-2);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
  }
  .sep {
    text-align: center;
  }
  .results {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }
  .result {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 10px;
    align-items: start;
    padding: 6px;
    border-radius: var(--radius);
    border: 1px solid var(--panel-2);
    background: var(--panel);
    color: var(--fg);
  }
  .result img {
    width: 120px;
    height: 68px;
    object-fit: cover;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .info {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .meta {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .actions button {
    min-height: 36px;
    padding: 0 12px;
  }
  .sentinel {
    height: 1px;
  }
  .preview {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    gap: 8px;
    padding: 10px;
    border-radius: var(--radius);
    background: var(--panel);
    outline: 2px solid var(--accent);
  }
  .preview-head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
  }
  .preview iframe {
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 6px;
    background: #000;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap);
    border-radius: var(--radius);
    border: 1px solid var(--panel-2);
    color: var(--fg);
    text-decoration: none;
  }
  .queue {
    display: grid;
    gap: 8px;
  }
  .queue-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }
  .queue-list li {
    display: grid;
    gap: 2px;
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--panel);
  }
  .state {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .state.ok {
    color: var(--ok);
  }
  .state.bad {
    color: var(--bad);
  }
</style>
