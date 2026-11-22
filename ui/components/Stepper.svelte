<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    resetTo: number;
    onchange: (v: number) => void;
    /** Accessible name of the reset icon button. */
    resetLabel: string;
  }
  let { label, value, min, max, step, format, resetTo, onchange, resetLabel }: Props = $props();

  function set(v: number) {
    const clamped = Math.min(max, Math.max(min, Math.round(v / step) * step));
    onchange(Math.round(clamped * 1e6) / 1e6);
  }
</script>

<section class="stepper">
  <div class="head">
    <h3>{label}</h3>
    <button
      type="button"
      class="reset"
      aria-label="{label}: {resetLabel}"
      title={resetLabel}
      disabled={value === resetTo}
      onclick={() => set(resetTo)}
    >
      <Icon name="reset" size={20} />
    </button>
  </div>
  <div class="row">
    <button type="button" aria-label="{label} −" onclick={() => set(value - step)}>−</button>
    <output class="value" aria-live="polite">{format(value)}</output>
    <button type="button" aria-label="{label} +" onclick={() => set(value + step)}>+</button>
  </div>
  <input
    type="range"
    aria-label={label}
    {min}
    {max}
    {step}
    {value}
    oninput={(e) => set(Number((e.currentTarget as HTMLInputElement).value))}
  />
</section>

<style>
  .stepper {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 8px 12px 4px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--tap);
    margin-top: -4px;
  }
  h3 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
    font-weight: 500;
  }
  .reset {
    padding: 0;
    background: transparent;
    color: var(--muted);
    display: grid;
    place-items: center;
  }
  .reset:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .row {
    display: grid;
    grid-template-columns: var(--tap) 1fr var(--tap);
    gap: 8px;
    align-items: center;
    margin-top: -6px;
  }
  .value {
    text-align: center;
    font-size: 2rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
