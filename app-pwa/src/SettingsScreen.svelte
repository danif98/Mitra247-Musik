<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { id } from '@musik/ui';
  import { formatBytes } from '@musik/core';
  import type { Player } from './player.svelte';
  import { maskToken, type ServerSettings } from './server.svelte';
  import { describeError } from './youtube.svelte';

  interface Props {
    player: Player;
    server: ServerSettings;
  }
  let { player, server }: Props = $props();
  const t = id.settings;

  let urlInput = $state(untrack(() => server.url));
  let tokenInput = $state('');
  let serverMsg = $state('');
  let serverOk = $state(false);
  let testing = $state(false);
  let serverInfo = $state('');

  function saveServer(): boolean {
    serverOk = false;
    if (!server.save(urlInput, tokenInput)) {
      serverMsg = t.serverBadUrl;
      return false;
    }
    tokenInput = '';
    urlInput = server.url;
    serverMsg = t.serverSaved;
    return true;
  }

  async function testServer() {
    if (!saveServer()) return;
    testing = true;
    serverMsg = t.serverTesting;
    serverInfo = '';
    try {
      const api = server.client();
      const health = await api.health();
      await api.checkAuth();
      serverOk = true;
      serverMsg = t.serverOk;
      serverInfo = `${t.serverVersion}: ${health.version} · ${t.serverYtdlp}: ${health.ytdlp ?? t.serverYtdlpNone}`;
    } catch (err) {
      serverOk = false;
      serverMsg = describeError(err);
    } finally {
      testing = false;
    }
  }

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
    <h3>{t.server}</h3>
    <label class="field">
      <span class="muted">{t.serverUrl}</span>
      <input
        id="srv-url"
        type="url"
        inputmode="url"
        autocomplete="off"
        placeholder={t.serverUrlHint}
        bind:value={urlInput}
      />
    </label>
    <label class="field">
      <span class="muted">{t.serverToken}{server.token ? ` (${maskToken(server.token)})` : ''}</span
      >
      <input
        id="srv-token"
        type="password"
        autocomplete="off"
        placeholder={server.token ? maskToken(server.token) : ''}
        bind:value={tokenInput}
      />
    </label>
    <p class="muted">{t.serverTokenHint}</p>
    <div class="seg">
      <button type="button" id="srv-save" onclick={saveServer}>{t.serverSave}</button>
      <button type="button" class="primary" id="srv-test" onclick={testServer} disabled={testing}
        >{t.serverTest}</button
      >
    </div>
    {#if serverMsg}
      <p id="srv-msg" role="status" class={serverOk ? 'ok' : 'muted'}>{serverMsg}</p>
    {/if}
    {#if serverInfo}
      <p class="muted" id="srv-info">{serverInfo}</p>
    {/if}
    {#if server.token}
      <button type="button" onclick={() => server.clearToken()}>{t.serverClearToken}</button>
    {/if}
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
    <h3>{t.diag}</h3>
    <p class="muted">{t.diagHint}</p>
    <button type="button" class="primary" id="download-log" onclick={() => player.downloadLog()}
      >{t.downloadLog}</button
    >
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
  .field {
    display: grid;
    gap: 4px;
  }
  .field input {
    min-height: var(--tap);
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--panel-2);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }
  .ok {
    color: var(--ok);
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
