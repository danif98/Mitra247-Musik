<script lang="ts">
  import { formatDuration, type YoutubeSearchResult } from '@musik/core';
  import { id } from '@musik/ui';
  import type { Player } from './player.svelte';
  import type { ServerSettings } from './server.svelte';
  import type { YoutubeFlow } from './youtube.svelte';
  import { native } from './native';

  interface Props {
    player: Player;
    server: ServerSettings;
    flow: YoutubeFlow;
    ongoSettings: () => void;
    onplay: () => void;
  }
  let { player, server, flow, ongoSettings, onplay }: Props = $props();
  const t = id.youtube;

  const steps = $derived([
    { key: 'queued', label: t.steps.queued },
    { key: 'download', label: t.steps.download },
    { key: 'convert', label: t.steps.convert },
    { key: 'saving', label: t.steps.saving },
    { key: 'done', label: t.steps.done },
  ]);
  const order = ['queued', 'download', 'convert', 'saving', 'done'];

  async function paste() {
    try {
      flow.url = (await navigator.clipboard.readText()).trim();
    } catch {
      /* clipboard permission denied: user can paste manually */
    }
  }

  /** Pick a search result: convert it, store it in the Library, then open it in the player. */
  async function pick(r: YoutubeSearchResult) {
    if (flow.active) return;
    flow.url = `https://www.youtube.com/watch?v=${r.videoId}`;
    await flow.start(server, player);
    if (flow.phase === 'done') await playNow();
  }

  async function playNow() {
    if (flow.song) {
      await player.select(flow.song);
      onplay();
    } else if (await flow.playSaved(player)) {
      onplay();
    }
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
        disabled={flow.active}
      />
    </label>
    <button
      type="submit"
      class="primary"
      id="yt-search"
      disabled={flow.active || flow.searching || flow.query.trim() === ''}
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
          <li>
            <button
              type="button"
              class="result"
              data-video={r.videoId}
              aria-label={`${t.search.pick}: ${r.title}`}
              disabled={flow.active}
              onclick={() => pick(r)}
            >
              <img src={r.thumbnail} alt="" width="120" height="68" loading="lazy" />
              <span class="info">
                <span class="name">{r.title}</span>
                <span class="meta"
                  >{r.channel ? `${r.channel} · ` : ''}{formatDuration(r.duration)}</span
                >
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

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
      disabled={flow.active}
    />
  </label>
  <div class="row">
    <button type="button" onclick={paste} disabled={flow.active}>{t.paste}</button>
    <button
      type="button"
      class="primary"
      id="yt-save"
      onclick={() => flow.start(server, player)}
      disabled={flow.active || flow.url.trim() === ''}>{flow.active ? t.busy : t.save}</button
    >
  </div>
  <p class="muted">{t.hint}</p>

  {#if flow.phase !== 'idle'}
    <ol class="steps" id="yt-steps" aria-live="polite">
      {#each steps as step (step.key)}
        {@const idx = order.indexOf(step.key)}
        {@const cur = order.indexOf(flow.phase)}
        <li
          class:done={flow.phase !== 'error' && cur > idx}
          class:current={flow.phase === step.key}
          data-step={step.key}
        >
          {step.label}
        </li>
      {/each}
    </ol>
    {#if flow.title}
      <p id="yt-title"><strong>{flow.title}</strong></p>
    {/if}
  {/if}

  {#if flow.phase === 'error'}
    <p class="error" role="alert" id="yt-error">{flow.error}</p>
  {/if}

  {#if flow.phase === 'done'}
    {#if flow.savedName}
      <p class="muted" id="yt-saved">{t.savedTo} {flow.savedName} {t.savedIn} {flow.savedFolder}</p>
    {:else if flow.saveFailed}
      <p class="error" id="yt-save-failed">{t.saveFolderFailedNote}</p>
    {/if}
    <div class="row">
      <button type="button" class="primary" id="yt-play" onclick={playNow}>{t.playNow}</button>
      <button
        type="button"
        onclick={() => {
          flow.reset();
          flow.url = '';
        }}>{t.another}</button
      >
    </div>
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
    align-items: center;
    width: 100%;
    min-height: var(--tap);
    padding: 6px;
    text-align: left;
    border-radius: var(--radius);
    border: 1px solid var(--panel-2);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
  }
  .result:disabled {
    opacity: 0.6;
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
  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }
  .steps li {
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--muted);
  }
  .steps li.done {
    color: var(--ok);
  }
  .steps li.current {
    color: var(--fg);
    outline: 2px solid var(--accent);
  }
</style>
