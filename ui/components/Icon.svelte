<script lang="ts">
  /** Small inline SVG icon set (24x24, uses currentColor). Decorative: buttons carry the aria-label. */
  export type IconName =
    | 'play'
    | 'pause'
    | 'stop'
    | 'prev'
    | 'next'
    | 'back5'
    | 'fwd5'
    | 'reset'
    | 'mic'
    | 'micOff'
    | 'info'
    | 'volume'
    | 'folder'
    | 'save'
    | 'loopA'
    | 'loopB'
    | 'loopClear'
    | 'eq'
    | 'metronome';

  interface Props {
    name: IconName;
    size?: number;
  }
  let { name, size = 24 }: Props = $props();

  const PATHS: Record<IconName, string> = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    stop: 'M6 6h12v12H6z',
    prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
    next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
    back5:
      'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',
    fwd5: 'M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z',
    reset:
      'M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A5.99 5.99 0 0 1 12 18a6 6 0 1 1 0-12c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    mic: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
    micOff:
      'M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z',
    info: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
    volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z',
    folder:
      'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z',
    save: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
    loopA: '',
    loopB: '',
    loopClear:
      'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    eq: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
    metronome: 'M9.6 2h4.8l3.6 20H6L9.6 2zm1.4 2L8 20h8L13 4h-2z',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="currentColor"
  aria-hidden="true"
  focusable="false"
>
  <path d={PATHS[name]} />
  {#if name === 'loopA' || name === 'loopB'}
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
    <text
      x="12"
      y="16"
      font-size="11"
      font-weight="700"
      text-anchor="middle"
      font-family="system-ui, sans-serif">{name === 'loopA' ? 'A' : 'B'}</text
    >
  {/if}
  {#if name === 'metronome'}
    <path
      d="M12 17 15.5 6"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      fill="none"
    />
  {/if}
  {#if name === 'back5' || name === 'fwd5'}
    <text
      x="12"
      y="16.2"
      font-size="7.5"
      font-weight="700"
      text-anchor="middle"
      font-family="system-ui, sans-serif">5</text
    >
  {/if}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
