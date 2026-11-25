<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { native } from '../native';
  import { nativeP } from './native-personal';
  import { maskToken, type ServerSettings } from './server.svelte';
  import { describeError } from './youtube.svelte';
  import { saveFolder } from './save-folder.svelte';
  import { idp } from './strings';

  interface Props {
    server: ServerSettings;
  }
  let { server }: Props = $props();
  const t = idp.settings;

  let urlInput = $state(untrack(() => server.url));
  let tokenInput = $state('');
  let serverMsg = $state('');
  let serverOk = $state(false);
  let testing = $state(false);
  let serverInfo = $state('');

  // Android app: yt-dlp runs on the phone and must be updated now and then.
  let ytVersion = $state('');
  let ytMsg = $state('');
  let ytBusy = $state(false);
  let ytAuto = $state(true);
  let ytLastCheck = $state(0);
  onMount(() => {
    void saveFolder.load();
    void nativeP
      ?.ytAutoUpdate()
      .then((r) => {
        ytAuto = r.enabled;
        ytLastCheck = r.lastCheck;
      })
      .catch(() => undefined);
    // Automatic update runs in the background (app start, after a failed download).
    const sub = nativeP?.addListener('ytUpdate', (e) => {
      if (e.version) ytVersion = e.version;
      if (e.state === 'updating') ytMsg = t.ytUpdating;
      else if (e.state === 'updated') ytMsg = t.ytUpdated;
      else if (e.state === 'uptodate') ytMsg = t.ytUpToDate;
      else if (e.state === 'failed') ytMsg = t.ytFailed;
      if (e.state !== 'updating' && e.state !== 'failed') ytLastCheck = Date.now();
    });
    onDestroy(() => void sub?.then((h) => h.remove()).catch(() => undefined));
    void nativeP
      ?.ytVersion()
      .then((r) => (ytVersion = r.version))
      .catch(() => undefined);
  });
  async function setAuto(enabled: boolean) {
    ytAuto = enabled;
    try {
      await nativeP?.setYtAutoUpdate({ enabled });
    } catch {
      /* keep the shown value; the setting is re-read next time */
    }
  }

  async function updateYtdlp() {
    if (!nativeP || ytBusy) return;
    ytBusy = true;
    ytMsg = t.ytUpdating;
    try {
      const r = await nativeP.ytUpdate();
      ytVersion = r.version;
      ytMsg = r.status === 'ALREADY_UP_TO_DATE' ? t.ytUpToDate : t.ytUpdated;
    } catch {
      ytMsg = t.ytFailed;
    } finally {
      ytBusy = false;
    }
  }

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
</script>

{#if native}
  <div class="panel">
    <h3>{t.saveFolder}</h3>
    <p class="muted" id="save-folder-label">
      {saveFolder.isSet ? saveFolder.label : t.saveFolderNone}
    </p>
    <p class="muted">{t.saveFolderNote}</p>
    <div class="seg">
      <button
        type="button"
        class="primary"
        id="save-folder-pick"
        onclick={() => saveFolder.pick()}
        disabled={saveFolder.busy}
        >{saveFolder.isSet ? t.saveFolderChange : t.saveFolderPick}</button
      >
      <button
        type="button"
        id="save-folder-clear"
        onclick={() => saveFolder.clear()}
        disabled={saveFolder.busy || !saveFolder.isSet}>{t.saveFolderClear}</button
      >
    </div>
    {#if saveFolder.isSet && !saveFolder.writable}
      <p class="error" role="alert">{t.saveFolderReadOnly}</p>
    {/if}
    <label class="check">
      <input
        type="checkbox"
        id="keep-in-library"
        checked={saveFolder.keepInLibrary}
        onchange={(e) => saveFolder.setKeepInLibrary(e.currentTarget.checked)}
      />
      <span>{t.keepInLibrary}</span>
    </label>
    <p class="muted">{t.keepInLibraryNote}</p>
    {#if saveFolder.message}<p class="muted" id="save-folder-msg" role="status">
        {saveFolder.message}
      </p>{/if}
  </div>

  <div class="panel">
    <h3>{t.ytdlp}</h3>
    <p class="muted" id="yt-version">{t.ytVersion}: {ytVersion || '–'}</p>
    <p class="muted">{t.ytNote}</p>
    <label class="check">
      <input
        type="checkbox"
        id="yt-auto"
        checked={ytAuto}
        onchange={(e) => setAuto(e.currentTarget.checked)}
      />
      <span>{t.ytAuto}</span>
    </label>
    <p class="muted" id="yt-last">
      {t.ytLast}: {ytLastCheck ? new Date(ytLastCheck).toLocaleString('id-ID') : t.ytNever}
    </p>
    <button type="button" class="primary" id="yt-update" onclick={updateYtdlp} disabled={ytBusy}
      >{t.ytUpdate}</button
    >
    {#if ytMsg}<p class="muted" id="yt-msg" role="status">{ytMsg}</p>{/if}
  </div>
{:else}
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
{/if}

<style>
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
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--tap);
  }
  .check input {
    width: 22px;
    height: 22px;
  }
</style>
