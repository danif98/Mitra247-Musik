<script lang="ts">
  import { formatChangelogDate, inlineSegments, parseChangelog } from '@musik/core';
  import changelogSource from '../../CHANGELOG.md?raw';

  const entries = parseChangelog(changelogSource);
</script>

<div class="log" id="changelog">
  {#each entries as entry, i (entry.version + entry.date)}
    <details open={i === 0} data-version={entry.version}>
      <summary>
        <strong>{entry.version}</strong>
        {#if entry.date}<span class="date">{formatChangelogDate(entry.date)}</span>{/if}
      </summary>
      <ul>
        {#each entry.items as item, j (j)}
          <li>
            {#each inlineSegments(item) as seg, k (k)}
              {#if seg.kind === 'code'}<code>{seg.text}</code>{:else if seg.kind === 'bold'}<strong
                  >{seg.text}</strong
                >{:else}{seg.text}{/if}
            {/each}
          </li>
        {/each}
      </ul>
    </details>
  {/each}
</div>

<style>
  .log {
    display: grid;
    gap: 6px;
  }
  details {
    background: var(--panel-2);
    border-radius: var(--radius);
    padding: 8px 12px;
  }
  summary {
    cursor: pointer;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .date {
    color: var(--muted);
    font-size: 0.85rem;
  }
  ul {
    margin: 8px 0 4px;
    padding-left: 18px;
    display: grid;
    gap: 6px;
    font-size: 0.88rem;
    line-height: 1.4;
  }
  code {
    font-size: 0.82rem;
    background: var(--panel);
    border-radius: 4px;
    padding: 0 4px;
    overflow-wrap: anywhere;
  }
</style>
