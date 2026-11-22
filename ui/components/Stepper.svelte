<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    resetTo: number;
    onchange: (v: number) => void;
    resetLabel: string;
  }
  let { label, value, min, max, step, format, resetTo, onchange, resetLabel }: Props = $props();

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  function pressStart() {
    pressTimer = setTimeout(() => {
      set(resetTo);
      pressTimer = null;
    }, 600);
  }
  function pressEnd() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  function set(v: number) {
    const clamped = Math.min(max, Math.max(min, Math.round(v / step) * step));
    onchange(Math.round(clamped * 1e6) / 1e6);
  }
</script>

<section class="stepper">
  <h3>{label}</h3>
  <div class="row">
    <button type="button" aria-label="{label} −" onclick={() => set(value - step)}>−</button>
    <output
      class="value"
      aria-live="polite"
      onpointerdown={pressStart}
      onpointerup={pressEnd}
      onpointerleave={pressEnd}
      onpointercancel={pressEnd}>{format(value)}</output
    >
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
  <button type="button" class="reset" onclick={() => set(resetTo)}>{resetLabel}</button>
</section>

<style>
  .stepper {
    background: var(--panel);
    border-radius: var(--radius);
    padding: 12px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 0.9rem;
    color: var(--muted);
    font-weight: 500;
  }
  .row {
    display: grid;
    grid-template-columns: var(--tap) 1fr var(--tap);
    gap: 8px;
    align-items: center;
  }
  .value {
    text-align: center;
    font-size: 2rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .reset {
    width: 100%;
    margin-top: 4px;
    background: transparent;
    color: var(--muted);
  }
</style>
