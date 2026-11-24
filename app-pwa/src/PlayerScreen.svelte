<script lang="ts">
  import { id } from '@musik/ui';
  import Icon from '@musik/ui/components/Icon.svelte';
  import Stepper from '@musik/ui/components/Stepper.svelte';
  import Waveform from '@musik/ui/components/Waveform.svelte';
  import { EQ_BAND_LABELS, formatDuration, isSupportedAudio } from '@musik/core';
  import { onMount, tick } from 'svelte';
  import type { Player } from './player.svelte';

  interface Props {
    player: Player;
    ongoLibrary: () => void;
  }
  let { player, ongoLibrary }: Props = $props();
  const t = id.player;
  const PRESETS = [0.5, 0.75, 1, 1.25];
  const TAB_KEY = 'musik.playtab';

  let infoOpen = $state(false);
  let panel = $state<'eq' | 'metro' | null>(null);
  let tab = $state<'queue' | 'practice'>('queue');
  let listEl = $state<HTMLElement | null>(null);
  /** Practice mode: a compact screen that fits a phone without scrolling. */
  const practice = $derived(tab === 'practice');
  // In practice mode the current song repeats by default; the usual setting comes back after.
  $effect(() => {
    if (practice) player.enterPractice();
    else player.leavePractice();
  });

  const MODES = [
    { key: 'basic', label: t.moBasic, hint: t.moHintBasic },
    { key: 'bass', label: t.moBass, hint: t.moHintBass },
    { key: 'focus', label: t.moFocus, hint: t.moHintFocus },
  ] as const;
  const hint = $derived(MODES.find((m) => m.key === player.moParams.mode)?.hint ?? '');
  const toggle = (name: 'eq' | 'metro') => (panel = panel === name ? null : name);

  onMount(() => {
    try {
      if (localStorage.getItem(TAB_KEY) === 'practice') tab = 'practice';
    } catch {
      /* default tab */
    }
  });

  function setTab(next: 'queue' | 'practice') {
    tab = next;
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* the choice only lasts for this session */
    }
  }

  /** A calm gradient per song, from the title: the "cover" when there is no artwork. */
  function hueOf(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
    return h;
  }

  const hue = $derived(hueOf(player.current?.title ?? ''));
  const subtitle = $derived(
    player.current?.artist ??
      player.current?.credit?.creator ??
      (player.currentIsTemp ? t.temp : ''),
  );
  const repeatLabel = $derived(
    player.repeat === 'one' ? t.repeatOne : player.repeat === 'all' ? t.repeatAll : t.repeatOff,
  );

  // Keep the playing song in view inside the queue list (the list scrolls, the page does not).
  $effect(() => {
    void player.queueIndex;
    if (tab !== 'queue' || !listEl) return;
    const el = listEl;
    void tick().then(() => {
      const row = el.querySelector<HTMLElement>('[aria-current="true"]');
      if (row) el.scrollTop = row.offsetTop - el.clientHeight / 2 + row.clientHeight / 2;
    });
  });

  async function onOpenFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter(isSupportedAudio);
    input.value = '';
    if (files.length) await player.playFiles(files);
  }
</script>

<section class="screen" class:practice>
  {#if player.error}
    <p class="error" role="alert" id="player-error">{player.error}</p>
  {:else if player.engineState === 'loading'}
    <p class="muted">{t.engineLoading}</p>
  {/if}

  {#if !player.current}
    <div class="empty">
      <div class="cover big" style="--h: 210" aria-hidden="true">
        <Icon name="music" size={56} />
      </div>
      <p>{t.empty}</p>
      <div class="row2">
        <button type="button" class="primary" onclick={ongoLibrary}>{t.goLibrary}</button>
        <label class="btn file">
          <Icon name="folder" size={20} />
          {t.openPlay}
          <input
            type="file"
            id="open-play-empty"
            accept="audio/*,.flac,.m4a,.opus"
            multiple
            onchange={onOpenFiles}
          />
        </label>
      </div>
    </div>
  {:else}
    <article class="now" class:compact={practice} aria-label={t.nowPlaying}>
      <div class="cover" style="--h: {hue}" class:spin={player.playing} aria-hidden="true">
        <Icon name="music" size={34} />
      </div>
      <div class="meta">
        <p class="kicker">
          <span id="queue-source">{player.queueLabel || t.nowPlaying}</span>
          {#if player.queue.length > 1}<span aria-hidden="true">·</span>
            <span id="queue-pos">{player.queueIndex + 1} / {player.queue.length}</span>{/if}
        </p>
        <h1 id="song-title">{player.current.title}</h1>
        {#if subtitle}<p class="artist">{subtitle}</p>{/if}
        <div class="badges" class:hidden={practice}>
          <button type="button" class="badge" onclick={() => setTab('practice')}
            >{player.tempo.toFixed(2)}×</button
          >
          <button type="button" class="badge" onclick={() => setTab('practice')}
            >{t.key} {player.semitone > 0 ? `+${player.semitone}` : player.semitone}</button
          >
          {#if player.loopA !== null || player.loopB !== null}
            <span class="badge on">A-B</span>
          {/if}
          {#if player.minusOne}<span class="badge on">{t.minusOne}</span>{/if}
        </div>
      </div>
    </article>
    {#if player.currentIsTemp && !practice}
      <p class="muted savebar">
        <span>{t.temp}</span>
        <button type="button" class="link" id="save-temp" onclick={() => player.saveCurrent()}>
          <Icon name="save" size={16} />{t.saveTemp}
        </button>
      </p>
    {/if}
    {#if player.countingIn}<p class="muted" id="counting">{t.counting}</p>{/if}

    <div class="seek">
      <Waveform
        peaks={player.current.peaks}
        position={player.position}
        duration={player.duration}
        label={t.seek}
        height={practice ? 48 : 72}
        loopA={player.loopA}
        loopB={player.loopB}
        onseek={(s) => player.seek(s)}
      />
      <p class="time">
        <span id="pos"
          >{formatDuration(player.position) === '–'
            ? '0:00'
            : formatDuration(player.position)}</span
        >
        <span>{formatDuration(player.duration)}</span>
      </p>
    </div>

    <div class="deck" class:practice role="group" aria-label="Kontrol putar">
      <div class="main">
        {#if practice}
          <button
            type="button"
            class="round soft"
            aria-label={t.back5}
            onclick={() => player.skip(-5)}><Icon name="back5" size={22} /></button
          >
        {:else}
          <button
            type="button"
            class="round soft"
            id="mode-shuffle"
            aria-pressed={player.shuffle}
            aria-label={t.shuffle}
            title={t.shuffle}
            onclick={() => player.toggleShuffle()}
          >
            <Icon name="shuffle" size={22} />
          </button>
        {/if}
        <button
          type="button"
          class="round"
          id="prev"
          aria-label={t.prev}
          onclick={() => player.prev()}><Icon name="prev" size={practice ? 22 : 26} /></button
        >
        <button
          type="button"
          class="round big primary play"
          id="play"
          aria-label={player.playing ? t.pause : t.play}
          onclick={() => player.toggle()}
        >
          <Icon name={player.playing ? 'pause' : 'play'} size={practice ? 26 : 34} />
        </button>
        <button
          type="button"
          class="round"
          id="next"
          aria-label={t.next}
          disabled={!player.hasNext}
          onclick={() => player.next()}><Icon name="next" size={practice ? 22 : 26} /></button
        >
        {#if practice}
          <button
            type="button"
            class="round soft"
            aria-label={t.fwd5}
            onclick={() => player.skip(5)}><Icon name="fwd5" size={22} /></button
          >
        {/if}
        <button
          type="button"
          class="round soft"
          id="mode-repeat"
          aria-pressed={player.repeat !== 'off'}
          aria-label={repeatLabel}
          title={repeatLabel}
          onclick={() => player.cycleRepeat()}
        >
          <Icon name={player.repeat === 'one' ? 'repeatOne' : 'repeat'} size={22} />
        </button>
      </div>
      {#if !practice}
        <div class="sub">
          <button type="button" aria-label={t.back5} onclick={() => player.skip(-5)}
            ><Icon name="back5" size={20} /><span>5s</span></button
          >
          <button type="button" id="stop" aria-label={t.stop} onclick={() => player.stop()}
            ><Icon name="stop" size={20} /><span>{t.stop}</span></button
          >
          <button type="button" aria-label={t.fwd5} onclick={() => player.skip(5)}
            ><Icon name="fwd5" size={20} /><span>5s</span></button
          >
          <button
            type="button"
            id="mode-autonext"
            aria-pressed={player.autoNext}
            aria-label={t.autoNext}
            title={t.autoNext}
            onclick={() => player.toggleAutoNext()}
          >
            <Icon name="autoNext" size={20} /><span>{t.autoNextShort}</span>
          </button>
        </div>
        <p class="muted modehint" id="mode-hint" aria-live="polite">{repeatLabel}</p>
      {/if}
    </div>

    <div class="tabs" role="tablist" aria-label={t.sections}>
      <button
        type="button"
        role="tab"
        id="ptab-queue"
        aria-selected={tab === 'queue'}
        onclick={() => setTab('queue')}
      >
        <Icon name="list" size={20} />{t.queue}
        {#if player.queue.length > 0}<span class="count">{player.queue.length}</span>{/if}
      </button>
      <button
        type="button"
        role="tab"
        id="ptab-practice"
        aria-selected={tab === 'practice'}
        onclick={() => setTab('practice')}
      >
        <Icon name="eq" size={20} />{t.practice}
      </button>
    </div>

    {#if tab === 'queue'}
      <section class="card" id="queue-panel" aria-label={t.queue}>
        {#if player.queue.length === 0}
          <p class="muted">{t.queueEmpty}</p>
        {:else}
          <ul class="queue" id="queue-list" bind:this={listEl}>
            {#each player.queue as item, i (item.id)}
              {@const current = i === player.queueIndex}
              <li>
                <button
                  type="button"
                  class="row"
                  class:current
                  data-index={i}
                  aria-current={current ? 'true' : undefined}
                  onclick={() => player.playAt(i)}
                >
                  <span class="idx" aria-hidden="true">
                    {#if current && player.playing}
                      <span class="bars"><i></i><i></i><i></i></span>
                    {:else if current}
                      <Icon name="play" size={18} />
                    {:else}
                      {i + 1}
                    {/if}
                  </span>
                  <span class="txt">
                    <span class="name">{item.title}</span>
                    <span class="sub2"
                      >{item.artist ??
                        item.credit?.creator ??
                        ''}{#if item.artist ?? item.credit?.creator}
                        ·
                      {/if}{formatDuration(item.duration)}</span
                    >
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
      <section class="card">
        <div class="grid inset">
          <Stepper
            compact
            label={t.tempo}
            value={player.tempo}
            min={0.25}
            max={2}
            step={0.05}
            format={(v) => `${v.toFixed(2)}×`}
            resetTo={1}
            resetLabel={t.reset}
            onchange={(v) => player.setTempo(v)}
          />
          <Stepper
            compact
            label={t.key}
            value={player.semitone}
            min={-12}
            max={12}
            step={1}
            format={(v) => (v > 0 ? `+${v}` : String(v))}
            resetTo={0}
            resetLabel={t.reset}
            onchange={(v) => player.setSemitone(v)}
          />
        </div>

        <div class="chips" role="group" aria-label={t.presets}>
          {#each PRESETS as p (p)}
            <button
              type="button"
              class="chip"
              aria-pressed={Math.abs(player.tempo - p) < 0.001}
              onclick={() => player.setTempo(p)}>{p}×</button
            >
          {/each}
        </div>
      </section>

      <section class="card">
        <div class="tools" role="group" aria-label="Alat latihan">
          <button
            type="button"
            id="loop-a"
            class:on={player.loopA !== null}
            aria-label={t.loopA}
            title={t.loopA}
            onclick={() => player.setLoopA()}
          >
            <Icon name="loopA" />
          </button>
          <button
            type="button"
            id="loop-b"
            class:on={player.loopB !== null}
            aria-label={t.loopB}
            title={t.loopB}
            onclick={() => player.setLoopB()}
          >
            <Icon name="loopB" />
          </button>
          <button
            type="button"
            id="loop-clear"
            aria-label={t.loopClear}
            title={t.loopClear}
            disabled={player.loopA === null && player.loopB === null}
            onclick={() => player.clearLoop()}
          >
            <Icon name="loopClear" />
          </button>
          <button
            type="button"
            id="eq-toggle"
            class:on={panel === 'eq'}
            aria-pressed={panel === 'eq'}
            aria-label={t.eqToggle}
            title={t.eqToggle}
            onclick={() => toggle('eq')}
          >
            <Icon name="eq" />
          </button>
          <button
            type="button"
            id="metro-toggle"
            class:on={panel === 'metro' || player.metroOn}
            aria-pressed={panel === 'metro'}
            aria-label={t.metroToggle}
            title={t.metroToggle}
            onclick={() => toggle('metro')}
          >
            <Icon name="metronome" />
          </button>
        </div>

        {#if panel === 'eq'}
          <section class="panel" id="eq-panel" aria-label={t.eqToggle}>
            <div class="eq">
              {#each EQ_BAND_LABELS as band, i (band)}
                <div class="band">
                  <span class="gain">{(player.eq[i] ?? 0) > 0 ? '+' : ''}{player.eq[i] ?? 0}</span>
                  <input
                    type="range"
                    class="vslider"
                    min="-12"
                    max="12"
                    step="1"
                    value={player.eq[i] ?? 0}
                    aria-label="{t.eqBand} {band}"
                    oninput={(e) =>
                      player.setEqBand(i, Number((e.currentTarget as HTMLInputElement).value))}
                  />
                  <span class="hz">{band}</span>
                </div>
              {/each}
              <button
                type="button"
                id="eq-reset"
                class="ghost eqreset"
                aria-label={t.eqReset}
                title={t.eqReset}
                onclick={() => player.resetEq()}
              >
                <Icon name="reset" size={20} />
              </button>
            </div>
          </section>
        {/if}

        {#if panel === 'metro'}
          <section class="panel" id="metro-panel" aria-label={t.metroPanel}>
            <div class="mrow">
              <button
                type="button"
                id="metro-on"
                class:on={player.metroOn}
                aria-pressed={player.metroOn}
                aria-label={t.metroOn}
                title={t.metroOn}
                onclick={() => player.toggleMetronome()}
              >
                <Icon name="metronome" />
              </button>
              <button
                type="button"
                id="count-in"
                class:on={player.countIn}
                aria-pressed={player.countIn}
                aria-label={t.countIn}
                title={t.countIn}
                onclick={() => player.setCountIn(!player.countIn)}>1 2 3 4</button
              >
            </div>
            <div class="grid inset">
              <Stepper
                compact
                label={t.bpm}
                value={player.bpm}
                min={30}
                max={240}
                step={1}
                format={(v) => String(v)}
                resetTo={100}
                resetLabel={t.reset}
                onchange={(v) => player.setBpm(v)}
              />
              <Stepper
                compact
                label={t.beats}
                value={player.beatsPerBar}
                min={1}
                max={12}
                step={1}
                format={(v) => String(v)}
                resetTo={4}
                resetLabel={t.reset}
                onchange={(v) => player.setBeatsPerBar(v)}
              />
            </div>
          </section>
        {/if}
        <div class="bottom">
          <span class="vol-icon" aria-hidden="true"><Icon name="volume" /></span>
          <input
            type="range"
            aria-label={t.volume}
            min="0"
            max="1"
            step="0.01"
            value={player.volume}
            oninput={(e) => player.setVolume(Number((e.currentTarget as HTMLInputElement).value))}
          />
          <button
            type="button"
            id="mo"
            class:on={player.minusOne}
            aria-pressed={player.minusOne}
            aria-label={t.minusOneToggle}
            title={t.minusOneToggle}
            onclick={() => player.setMinusOne(!player.minusOne)}
          >
            <Icon name={player.minusOne ? 'micOff' : 'mic'} />
          </button>
          <button
            type="button"
            id="mo-info"
            class="ghost"
            aria-expanded={infoOpen}
            aria-label={t.minusOneInfo}
            onclick={() => (infoOpen = !infoOpen)}
          >
            <Icon name="info" size={20} />
          </button>
        </div>
        {#if player.minusOne}
          <section class="panel" id="mo-panel" aria-label={t.moModes}>
            <div class="modes" role="group" aria-label={t.moModes}>
              {#each MODES as m (m.key)}
                <button
                  type="button"
                  id="mo-mode-{m.key}"
                  aria-pressed={player.moParams.mode === m.key}
                  onclick={() => player.setMinusOneParams({ mode: m.key })}>{m.label}</button
                >
              {/each}
            </div>
            <p class="muted" id="mo-hint">{hint}</p>
            <label class="slider">
              <span>{t.moStrength}</span>
              <input
                type="range"
                id="mo-strength"
                min="0"
                max="100"
                step="5"
                value={Math.round(player.moParams.strength * 100)}
                oninput={(e) =>
                  player.setMinusOneParams({
                    strength: Number((e.currentTarget as HTMLInputElement).value) / 100,
                  })}
              />
              <output>{Math.round(player.moParams.strength * 100)}%</output>
            </label>
            {#if player.moParams.mode === 'bass'}
              <label class="slider">
                <span>{t.moCutoff}</span>
                <input
                  type="range"
                  id="mo-cutoff"
                  min="80"
                  max="300"
                  step="10"
                  value={player.moParams.cutoff}
                  oninput={(e) =>
                    player.setMinusOneParams({
                      cutoff: Number((e.currentTarget as HTMLInputElement).value),
                    })}
                />
                <output>{player.moParams.cutoff} Hz</output>
              </label>
            {/if}
            {#if player.moParams.mode === 'focus'}
              <label class="slider">
                <span>{t.moWidth}</span>
                <input
                  type="range"
                  id="mo-width"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(player.moParams.width * 100)}
                  oninput={(e) =>
                    player.setMinusOneParams({
                      width: Number((e.currentTarget as HTMLInputElement).value) / 100,
                    })}
                />
                <output>{Math.round(player.moParams.width * 100)}%</output>
              </label>
            {/if}
          </section>
        {/if}
        {#if infoOpen}
          <p class="muted note" id="mo-note">{t.minusOneNotes}</p>
        {/if}
      </section>
    {/if}
  {/if}
</section>

<style>
  .screen {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
  p {
    margin: 0;
  }
  h1 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .error {
    color: var(--bad);
  }

  /* empty state */
  .empty {
    display: grid;
    gap: 14px;
    justify-items: center;
    padding: 32px 0;
    text-align: center;
  }
  .row2 {
    display: grid;
    gap: 8px;
    justify-items: stretch;
    width: 100%;
  }
  .file {
    position: relative;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  /* now playing card */
  .now {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 14px;
    align-items: center;
    padding: 14px;
    border-radius: 18px;
    background:
      radial-gradient(120% 140% at 0% 0%, hsl(var(--h, 210) 55% 24% / 0.55), transparent 60%),
      var(--panel);
    border: 1px solid color-mix(in srgb, var(--fg) 6%, transparent);
  }
  .cover {
    --h: 210;
    width: 92px;
    height: 92px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    color: hsl(var(--h) 80% 92%);
    background: linear-gradient(135deg, hsl(var(--h) 62% 42%), hsl(calc(var(--h) + 40) 65% 24%));
    box-shadow: 0 8px 24px hsl(var(--h) 60% 20% / 0.55);
  }
  .cover.big {
    width: 128px;
    height: 128px;
    border-radius: 24px;
  }
  .meta {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .kicker {
    font-size: 0.74rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    gap: 6px;
  }
  .kicker span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .artist {
    color: var(--muted);
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .badge {
    min-height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 0.78rem;
    line-height: 26px;
    background: color-mix(in srgb, var(--fg) 9%, transparent);
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
  .badge.on {
    background: var(--accent);
    color: #06121a;
  }
  .savebar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: -4px;
  }
  .link {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    min-height: 32px;
    padding: 0 8px;
    background: transparent;
    color: var(--accent);
    font-size: 0.9rem;
  }

  /* seek */
  .seek {
    display: grid;
    gap: 4px;
  }
  .time {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
  }

  /* transport */
  .deck {
    display: grid;
    gap: 10px;
  }
  .main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .round {
    width: 52px;
    height: 52px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
  }
  .round.big {
    width: 72px;
    height: 72px;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 38%, transparent);
  }
  .round.soft {
    width: 44px;
    height: 44px;
    background: transparent;
    color: var(--muted);
  }
  .round.soft[aria-pressed='true'] {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }
  .round:disabled {
    opacity: 0.35;
  }
  .sub {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .sub button {
    min-height: 40px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.78rem;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--fg) 10%, transparent);
    color: var(--muted);
  }
  .sub button[aria-pressed='true'] {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--accent);
  }
  .sub span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .modehint {
    text-align: center;
    font-size: 0.78rem;
    margin-top: -4px;
  }

  /* tabs */
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
    background: var(--panel);
  }
  .tabs button {
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: transparent;
    color: var(--muted);
    border-radius: 10px;
  }
  .tabs button[aria-selected='true'] {
    background: var(--panel-2);
    color: var(--fg);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--fg) 8%, transparent) inset;
  }
  .count {
    font-size: 0.74rem;
    padding: 0 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg) 12%, transparent);
    font-variant-numeric: tabular-nums;
  }

  /* cards */
  .card {
    background: var(--panel);
    border-radius: 16px;
    padding: 12px 10px;
    display: grid;
    gap: 12px;
  }

  /* queue */
  .queue {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    max-height: min(46vh, 420px);
    overflow-y: auto;
    overscroll-behavior: contain;
    position: relative;
  }
  .queue li {
    content-visibility: auto;
    contain-intrinsic-size: auto 56px;
  }
  .row {
    width: 100%;
    min-height: 56px;
    padding: 6px 8px;
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 10px;
    align-items: center;
    text-align: left;
    background: transparent;
    border-radius: 12px;
    color: var(--fg);
  }
  .row.current {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .idx {
    text-align: center;
    color: var(--muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    display: grid;
    place-items: center;
  }
  .row.current .idx {
    color: var(--accent);
  }
  .txt {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row.current .name {
    color: var(--accent);
    font-weight: 600;
  }
  .sub2 {
    color: var(--muted);
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 16px;
  }
  .bars i {
    width: 3px;
    height: 100%;
    border-radius: 1px;
    background: var(--accent);
    transform-origin: bottom;
    animation: bar 0.9s ease-in-out infinite;
  }
  .bars i:nth-child(2) {
    animation-delay: -0.3s;
  }
  .bars i:nth-child(3) {
    animation-delay: -0.6s;
  }
  @keyframes bar {
    0%,
    100% {
      transform: scaleY(0.25);
    }
    50% {
      transform: scaleY(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bars i {
      animation: none;
      transform: scaleY(0.7);
    }
  }

  /* practice */
  .tools {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .tools button,
  .mrow button {
    padding: 0;
    min-width: 0;
    display: grid;
    place-items: center;
    min-height: 52px;
  }
  .tools button.on,
  .mrow button.on {
    background: var(--accent);
    color: #06121a;
  }
  .tools button:disabled {
    opacity: 0.35;
  }
  .panel {
    background: var(--panel-2);
    border-radius: var(--radius);
    padding: 12px;
    display: grid;
    gap: 10px;
  }
  .eq {
    display: grid;
    grid-template-columns: repeat(5, 1fr) var(--tap);
    gap: 4px;
    align-items: end;
  }
  .band {
    display: grid;
    justify-items: center;
    gap: 2px;
  }
  .gain,
  .hz {
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .vslider {
    writing-mode: vertical-lr;
    direction: rtl;
    width: 44px;
    height: 130px;
    min-height: 0;
  }
  .eqreset {
    padding: 0;
    display: grid;
    place-items: center;
  }
  .mrow {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
  }
  .mrow button {
    letter-spacing: 0.08em;
  }
  /* steppers sit one shade lighter than the card they are in */
  .inset {
    --panel: var(--panel-2);
  }
  .grid {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr 1fr;
  }
  .chips {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .bottom {
    display: grid;
    grid-template-columns: auto 1fr var(--tap) var(--tap);
    align-items: center;
    gap: 6px;
  }
  .bottom button {
    padding: 0;
    display: grid;
    place-items: center;
  }
  .bottom button.on {
    background: var(--accent);
    color: #06121a;
  }
  .ghost {
    background: transparent;
    color: var(--muted);
  }
  .vol-icon {
    color: var(--muted);
    padding-left: 4px;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .slider {
    display: grid;
    grid-template-columns: 7.5rem 1fr 4rem;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .slider output {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }
  .note {
    background: var(--panel-2);
    border-radius: var(--radius);
    padding: 10px 12px;
  }

  /* practice mode: everything fits a phone screen without scrolling */
  .screen.practice {
    gap: 10px;
  }
  .now.compact {
    grid-template-columns: 52px 1fr;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 14px;
  }
  .now.compact .cover {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    box-shadow: none;
  }
  .now.compact .cover :global(svg) {
    width: 24px;
    height: 24px;
  }
  .now.compact h1 {
    font-size: 1rem;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }
  .now.compact .kicker {
    font-size: 0.68rem;
  }
  .badges.hidden {
    display: none;
  }
  .screen.practice .seek {
    gap: 0;
  }
  .deck.practice .main {
    gap: 4px;
  }
  .deck.practice .round {
    width: 44px;
    height: 44px;
  }
  .deck.practice .round.big {
    width: 54px;
    height: 54px;
    box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .deck.practice .round.soft {
    width: 40px;
    height: 40px;
  }
  .screen.practice .tabs button {
    min-height: 36px;
  }
  .screen.practice .card {
    padding: 10px 8px;
    gap: 10px;
  }
  .screen.practice .tools button,
  .screen.practice .mrow button {
    min-height: 44px;
  }
  .screen.practice .chips button {
    min-height: 38px;
  }
  .card .bottom {
    padding-top: 6px;
    border-top: 1px solid color-mix(in srgb, var(--fg) 8%, transparent);
  }
</style>
