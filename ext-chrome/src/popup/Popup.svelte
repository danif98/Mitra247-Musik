<script lang="ts">
  import { onMount } from 'svelte';
  import { id } from '@musik/ui';
  import Stepper from '@musik/ui/components/Stepper.svelte';
  import type { ExtRequest, ExtResponse, ExtStatus } from '../messages';

  const t = id.ext;
  let status = $state<ExtStatus | null>(null);
  let message = $state(t.loading);
  let tabId: number | null = null;

  /** Active tab; the `?target=<substring>` override exists for automated tests only. */
  async function findTab(): Promise<chrome.tabs.Tab | undefined> {
    const target = new URLSearchParams(location.search).get('target');
    if (target) {
      const all = await chrome.tabs.query({});
      return all.find((tab) => tab.url?.startsWith('http') && tab.url.includes(target));
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function send(req: ExtRequest): Promise<ExtResponse | undefined> {
    if (tabId === null) return undefined;
    return chrome.tabs.sendMessage(tabId, req, { frameId: 0 });
  }

  async function refresh(req: ExtRequest) {
    try {
      const res = (await send(req)) as ExtStatus | undefined;
      if (res) {
        status = res;
        message = res.hasMedia ? '' : t.noMedia;
      }
    } catch {
      message = t.noAccess;
    }
  }

  onMount(async () => {
    const tab = await findTab();
    if (!tab?.id) {
      message = t.noAccess;
      return;
    }
    tabId = tab.id;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {
      message = t.noAccess; // chrome:// pages, Web Store, PDF viewer, ...
      return;
    }
    await refresh({ type: 'status' });
  });

  const set = (patch: { tempo?: number; semitone?: number; minusOne?: boolean }) => {
    // Optimistic update so fast consecutive clicks build on each other.
    if (status) status = { ...status, ...patch };
    return refresh({ type: 'set', ...patch });
  };
</script>

<main>
  <h1>{id.appName}</h1>
  {#if message}
    <p class="muted" id="message" role="status">{message}</p>
  {/if}

  {#if status?.hasMedia}
    <p class="muted title">{status.title}</p>
    {#if status.error}
      <p class="warn" id="warning" role="alert">
        {status.pitchAvailable ? status.error : t.degraded}
      </p>
    {/if}
    <Stepper
      label={id.player.tempo}
      value={status.tempo}
      min={0.25}
      max={2}
      step={0.05}
      format={(v) => `${v.toFixed(2)}×`}
      resetTo={1}
      resetLabel={id.player.reset}
      onchange={(v) => set({ tempo: v })}
    />
    {#if status.pitchAvailable || !status.ready}
      <Stepper
        label={id.player.key}
        value={status.semitone}
        min={-12}
        max={12}
        step={1}
        format={(v) => (v > 0 ? `+${v}` : String(v))}
        resetTo={0}
        resetLabel={id.player.reset}
        onchange={(v) => set({ semitone: v })}
      />
    {/if}
    <section class="panel">
      <div class="row">
        <h3>{id.player.minusOne}</h3>
        <div class="seg">
          <button
            type="button"
            id="mo-off"
            aria-pressed={!status.minusOne}
            onclick={() => set({ minusOne: false })}>{id.player.off}</button
          >
          <button
            type="button"
            id="mo-on"
            aria-pressed={status.minusOne}
            onclick={() => set({ minusOne: true })}>{id.player.on}</button
          >
        </div>
      </div>
      <p class="muted">{id.player.minusOneNote}</p>
    </section>
    <p class="muted">{t.shortcuts}</p>
  {/if}
</main>

<style>
  main {
    width: 340px;
    padding: 12px;
    display: grid;
    gap: 10px;
  }
  h1 {
    margin: 0;
    font-size: 1.1rem;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .warn {
    color: var(--warn);
    font-size: 0.85rem;
  }
  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 10px;
    display: grid;
    gap: 6px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
</style>
