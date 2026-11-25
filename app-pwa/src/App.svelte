<script lang="ts">
  import { onMount } from 'svelte';
  import { id } from '@musik/ui';
  import { Player } from './player.svelte';
  import PlayerScreen from './PlayerScreen.svelte';
  import LibraryScreen from './LibraryScreen.svelte';
  import SettingsScreen from './SettingsScreen.svelte';
  import SearchScreen from './SearchScreen.svelte';
  import {
    PERSONAL,
    PERSONAL_TAB,
    PERSONAL_TAB_LABEL,
    ServerSettings,
    YoutubeFlow,
    YoutubeScreen,
    bindSharedLinks,
    sharedUrlFromLocation,
  } from '@personal';
  import { SearchFlow } from './search.svelte';
  import { DeviceMusic } from './device.svelte';
  import { bindNative } from './native-bridge.svelte';
  import { Equalizer, MinusOne } from '@musik/core';

  type Tab = 'play' | 'library' | 'search' | typeof PERSONAL_TAB | 'settings';
  const player = new Player();
  const server = new ServerSettings();
  const flow = new YoutubeFlow();
  const searchFlow = new SearchFlow();
  const device = new DeviceMusic();
  let tab = $state<Tab>('library');

  // Android app: notification controls.
  bindNative(player);
  // Personal edition: links shared to the Android app from other apps.
  bindSharedLinks((url) => {
    flow.url = url;
    tab = PERSONAL_TAB;
  });

  onMount(() => {
    // Test hook (Playwright): /?test
    if (new URLSearchParams(location.search).has('test')) {
      (window as unknown as { __musik: unknown }).__musik = {
        player,
        server,
        flow,
        searchFlow,
        // classes exposed so e2e can render them offline and measure the DSP
        MinusOne,
        Equalizer,
      };
    }
    // Personal edition, Share Target / extension: ?url=...&text=... carries a link.
    const params = new URLSearchParams(location.search);
    const shared = sharedUrlFromLocation(params);
    if (shared) {
      flow.url = shared;
      tab = PERSONAL_TAB;
      const keep = params.has('test') ? '?test' : '';
      history.replaceState(null, '', location.pathname + keep);
    }
    void player
      .init()
      .then(() => player.restoreLast())
      .then((restored) => {
        // The last queue and song come back on the Play screen (paused).
        if (!shared && (restored || player.songs.length > 0)) tab = 'play';
      });
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'play', label: id.nav.play },
    { key: 'library', label: id.nav.library },
    { key: 'search', label: id.nav.search },
    ...(PERSONAL ? [{ key: PERSONAL_TAB, label: PERSONAL_TAB_LABEL }] : []),
    { key: 'settings', label: id.nav.settings },
  ];
</script>

<main>
  {#if tab === 'play'}
    <PlayerScreen {player} ongoLibrary={() => (tab = 'library')} />
  {:else if tab === 'library'}
    <LibraryScreen {player} {device} onplay={() => (tab = 'play')} />
  {:else if tab === 'search'}
    <SearchScreen {player} flow={searchFlow} onplay={() => (tab = 'play')} />
  {:else if PERSONAL && tab === PERSONAL_TAB}
    <YoutubeScreen
      {player}
      {server}
      {flow}
      ongoSettings={() => (tab = 'settings')}
      onplay={() => (tab = 'play')}
    />
  {:else}
    <SettingsScreen {player} {server} />
  {/if}
</main>

<nav aria-label="Navigasi" style:--tabs={tabs.length}>
  {#each tabs as item (item.key)}
    <button
      type="button"
      id="tab-{item.key}"
      aria-current={tab === item.key ? 'page' : undefined}
      aria-pressed={tab === item.key}
      onclick={() => (tab = item.key)}>{item.label}</button
    >
  {/each}
</nav>

<style>
  main {
    max-width: 560px;
    margin: 0 auto;
    padding: 12px 12px 96px;
  }
  nav {
    position: fixed;
    inset: auto 0 0 0;
    display: grid;
    grid-template-columns: repeat(var(--tabs, 5), 1fr);
    gap: 4px;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: var(--panel);
    border-top: 1px solid var(--panel-2);
  }
  nav button {
    min-height: 52px;
    background: transparent;
  }
  nav button[aria-current='page'] {
    color: var(--accent);
    font-weight: 700;
    outline: none;
    background: var(--panel-2);
  }
</style>
