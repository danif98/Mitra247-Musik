<script lang="ts">
  interface Props {
    peaks: Float32Array;
    position: number;
    duration: number;
    label: string;
    loopA?: number | null;
    loopB?: number | null;
    onseek: (seconds: number) => void;
  }
  let { peaks, position, duration, label, loopA = null, loopB = null, onseek }: Props = $props();

  let canvas: HTMLCanvasElement;
  let width = $state(300);
  const HEIGHT = 72;

  function draw() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);
    const css = getComputedStyle(canvas);
    const played = css.getPropertyValue('--accent').trim() || '#4cc2ff';
    const rest = css.getPropertyValue('--muted').trim() || '#9aa3b5';
    const progress = duration > 0 ? Math.min(1, position / duration) : 0;
    const x = (t: number) => (duration > 0 ? Math.min(1, Math.max(0, t / duration)) * width : 0);
    if (loopA !== null && loopB !== null && loopB > loopA) {
      ctx.fillStyle = 'rgba(76, 194, 255, 0.18)';
      ctx.fillRect(x(loopA), 0, x(loopB) - x(loopA), HEIGHT);
    }
    const bars = Math.floor(width / 3);
    for (let i = 0; i < bars; i++) {
      const p = peaks.length ? (peaks[Math.floor((i / bars) * peaks.length)] ?? 0) : 0.08;
      const h = Math.max(2, p * (HEIGHT - 6));
      ctx.fillStyle = i / bars <= progress ? played : rest;
      ctx.fillRect(i * 3, (HEIGHT - h) / 2, 2, h);
    }
    ctx.fillStyle = played;
    for (const t of [loopA, loopB]) {
      if (t !== null) ctx.fillRect(Math.round(x(t)) - 1, 0, 2, HEIGHT);
    }
  }

  $effect(() => {
    // Redraw whenever inputs change.
    void [peaks, position, duration, width, loopA, loopB];
    draw();
  });

  function seekFrom(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onseek(ratio * duration);
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') onseek(position - 5);
    else if (e.key === 'ArrowRight') onseek(position + 5);
  }
</script>

<div
  class="wave"
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax={Math.round(duration)}
  aria-valuenow={Math.round(position)}
  bind:clientWidth={width}
  onpointerdown={seekFrom}
  onkeydown={onkey}
>
  <canvas bind:this={canvas} style="width:{width}px;height:{HEIGHT}px"></canvas>
</div>

<style>
  .wave {
    width: 100%;
    height: 72px;
    touch-action: none;
    cursor: pointer;
    border-radius: var(--radius);
    background: var(--panel);
    overflow: hidden;
  }
  canvas {
    display: block;
  }
</style>
