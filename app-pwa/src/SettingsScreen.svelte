<script lang="ts">
  import { onMount } from 'svelte';
  import { id } from '@musik/ui';
  import { formatBuildTime, formatBytes } from '@musik/core';
  import type { Player } from './player.svelte';
  import { PersonalSettings, type ServerSettings } from '@personal';
  import { native, type AppInfo } from './native';
  import ChangelogList from './ChangelogList.svelte';
  import AccountPanel from './account/AccountPanel.svelte';
  import { account } from './account/account.svelte';

  interface Props {
    player: Player;
    server: ServerSettings;
  }
  let { player, server }: Props = $props();
  const t = id.settings;

  // About: the APK reports its own version and build time; a browser uses the web build's.
  let appInfo = $state<AppInfo | null>(null);
  const aboutVersion = $derived(appInfo?.versionName ?? __APP_VERSION__);
  const aboutBuilt = $derived(formatBuildTime(appInfo?.buildTime ?? __BUILT_AT__));
  let showLog = $state(false);
  onMount(() => {
    void native
      ?.appInfo()
      .then((r) => (appInfo = r))
      .catch(() => undefined);
  });

  let usage = $state('');
  let persisted = $state<boolean | null>(null);
  let persistDenied = $state(false);

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
    persistDenied = false;
    const granted = (await navigator.storage?.persist?.()) ?? false;
    await refresh();
    persistDenied = !granted;
  }

  async function clearAll() {
    if (!confirm(t.clearConfirm)) return;
    await player.clearAll();
    account.forgetLocal();
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
    <h3>{t.normalize}</h3>
    <div class="seg">
      <button
        type="button"
        id="set-norm-on"
        aria-pressed={player.normalize}
        onclick={() => player.setNormalize(true)}>{t.normalizeOn}</button
      >
      <button
        type="button"
        id="set-norm-off"
        aria-pressed={!player.normalize}
        onclick={() => player.setNormalize(false)}>{t.normalizeOff}</button
      >
    </div>
    <p class="muted">{t.normalizeNote}</p>
  </div>

  <AccountPanel {player} />

  <PersonalSettings {server} />

  <div class="panel">
    <h3>{t.storage}</h3>
    <p>{t.used}: <span id="usage">{usage}</span></p>
    <p class="muted">{persisted ? t.persisted : t.notPersisted}</p>
    {#if persisted === false}
      <button type="button" onclick={requestPersist}>{t.requestPersist}</button>
      {#if persistDenied}
        <p class="muted" role="status">{t.persistDenied}</p>
      {/if}
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
    <dl class="about">
      <dt>{t.appName}</dt>
      <dd>{id.appName}</dd>
      <dt>{t.version}</dt>
      <dd id="about-version">{aboutVersion}</dd>
      <dt>{t.builtAt}</dt>
      <dd id="about-built">{aboutBuilt}</dd>
      <dt>{t.platform}</dt>
      <dd id="about-platform">{native ? t.platformApk : t.platformWeb}</dd>
      <dt>{t.build}</dt>
      <dd class="muted">{__BUILD__}</dd>
    </dl>
    <button
      type="button"
      id="changelog-toggle"
      aria-expanded={showLog}
      onclick={() => (showLog = !showLog)}>{showLog ? t.hideChangelog : t.showChangelog}</button
    >
    {#if showLog}<ChangelogList />{/if}
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
  .about {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    margin: 0;
  }
  .about dt {
    color: var(--muted);
  }
  .about dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  a.btn {
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    color: var(--fg);
  }
</style>
