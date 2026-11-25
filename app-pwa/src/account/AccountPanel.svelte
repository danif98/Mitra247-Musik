<script lang="ts">
  import { id } from '@musik/ui';
  import type { Player } from '../player.svelte';
  import { account } from './account.svelte';

  interface Props {
    player: Player;
  }
  let { player }: Props = $props();
  const t = id.account;

  async function remove() {
    if (confirm(t.deleteConfirm)) await account.deleteBackup();
  }
</script>

{#if account.available}
  <div class="panel" id="account-panel">
    <h3>{t.title}</h3>
    {#if account.user}
      <div class="who">
        {#if account.user.photoUrl}
          <img
            src={account.user.photoUrl}
            alt=""
            referrerpolicy="no-referrer"
            width="44"
            height="44"
          />
        {:else}
          <span class="avatar" aria-hidden="true"
            >{(account.user.name || account.user.email).slice(0, 1).toUpperCase()}</span
          >
        {/if}
        <div>
          <strong id="account-name">{account.user.name || account.user.email}</strong>
          <div class="muted" id="account-email">{account.user.email}</div>
        </div>
      </div>
      <p class="muted" id="account-last">
        {t.last}: {account.lastSync ? new Date(account.lastSync).toLocaleString('id-ID') : t.never}
      </p>
      <div class="seg">
        <button
          type="button"
          class="primary"
          id="account-sync"
          onclick={() => account.sync(player)}
          disabled={account.busy}>{t.syncNow}</button
        >
        <button
          type="button"
          id="account-signout"
          onclick={() => account.signOut()}
          disabled={account.busy}>{t.signOut}</button
        >
      </div>
      <label class="check">
        <input
          type="checkbox"
          id="account-auto"
          checked={account.autoSync}
          onchange={(e) => account.setAuto(e.currentTarget.checked)}
        />
        <span>{t.auto}</span>
      </label>
      <button type="button" id="account-delete" onclick={remove} disabled={account.busy}
        >{t.deleteBackup}</button
      >
      <p class="muted">{t.revoke}</p>
    {:else}
      <p class="muted">{t.intro}</p>
      <button
        type="button"
        class="primary"
        id="account-signin"
        onclick={() => account.signIn(player)}
        disabled={account.busy}>{account.busy ? t.signingIn : t.signIn}</button
      >
    {/if}
    {#if account.message}
      <p
        id="account-msg"
        role={account.isError ? 'alert' : 'status'}
        class={account.isError ? 'error' : 'muted'}
      >
        {account.message}
      </p>
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
  .error {
    color: var(--danger, #ff6b6b);
    font-size: 0.9rem;
  }
  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 12px;
    display: grid;
    gap: 8px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .who img,
  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    flex: none;
  }
  .avatar {
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--bg);
    font-weight: 700;
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
