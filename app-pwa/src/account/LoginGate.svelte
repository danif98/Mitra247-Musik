<script lang="ts">
  import { id } from '@musik/ui';
  import type { Player } from '../player.svelte';
  import { account } from './account.svelte';

  let { player }: { player: Player } = $props();
  const t = id.account.gate;
</script>

<main id="gate">
  <h1>{id.appName}</h1>
  <h2>{t.title}</h2>
  <p class="muted">{t.intro}</p>
  <button
    type="button"
    class="primary"
    id="gate-signin"
    onclick={() => account.signIn(player)}
    disabled={account.busy}>{account.busy ? id.account.signingIn : id.account.signIn}</button
  >
  {#if account.expired}
    <p id="gate-expired" role="alert" class="error">{t.expired}</p>
  {/if}
  {#if account.message}
    <p
      id="gate-msg"
      role={account.isError ? 'alert' : 'status'}
      class={account.isError ? 'error' : 'muted'}
    >
      {account.message}
    </p>
  {/if}
  <p class="muted small">{t.hint}</p>
</main>

<style>
  main {
    max-width: 560px;
    min-height: 100dvh;
    margin: 0 auto;
    padding: calc(24px + var(--sat)) 20px calc(24px + var(--sab));
    display: grid;
    align-content: center;
    gap: 14px;
  }
  h1 {
    margin: 0;
    font-size: 1.6rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 0.85rem;
  }
  .error {
    color: var(--danger, #ff6b6b);
  }
</style>
