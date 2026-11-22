<script lang="ts">
  import { onMount } from 'svelte';
  import { id } from '@musik/ui';
  import { Player } from './player.svelte';
  import PlayerScreen from './PlayerScreen.svelte';
  import LibraryScreen from './LibraryScreen.svelte';
  import SettingsScreen from './SettingsScreen.svelte';

  type Tab = 'play' | 'library' | 'settings';
  const player = new Player();
  let tab = $state<Tab>('library');

  onMount(() => {
    // Test hook (Playwright): /?test
    if (new URLSearchParams(location.search).has('test')) {
      (window as unknown as { __musik: unknown }).__musik = { player };
    }
    void player.init().then(() => {
      if (player.songs.length > 0) tab = 'play';
    });
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'play', label: id.nav.play },
    { key: 'library', label: id.nav.library },
    { key: 'settings', label: id.nav.settings },
  ];
</script>

<main>
  {#if tab === 'play'}
    <PlayerScreen {player} ongoLibrary={() => (tab = 'library')} />
  {:else if tab === 'library'}
    <LibraryScreen {player} onplay={() => (tab = 'play')} />
  {:else}
    <SettingsScreen {player} />
  {/if}
</main>

<nav aria-label="Navigasi">
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
    grid-template-columns: repeat(3, 1fr);
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
