/** App-wide player controller (Svelte 5 runes). Owns the <audio> element, engine and library. */
import {
  LibraryStore,
  MusikAudioEngine,
  clampSemitone,
  analyzeAudio,
  clampTempo,
  isSupportedAudio,
  nextIndex,
  previousAction,
  sortSongs,
  titleFromFileName,
  storageSupported,
  type RubberBandEngine,
  type SongMeta,
} from '@musik/core';
import { engineAssets } from '@musik/core/audio/assets';
import { id } from '@musik/ui';
import { DiagLog } from '../lab/diag-log';

const ENGINE_KEY = 'musik.engine';

function loadEngine(): RubberBandEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === 'R3' ? 'R3' : 'R2';
  } catch {
    return 'R2';
  }
}

export class Player {
  readonly store = new LibraryStore();
  readonly audio = new Audio();
  engine: MusikAudioEngine | null = null;
  readonly log = new DiagLog();

  songs = $state<SongMeta[]>([]);
  current = $state<SongMeta | null>(null);
  /** Playback queue (library order, or the files picked with "Buka & putar") and the current index. */
  queue = $state<SongMeta[]>([]);
  queueIndex = $state(-1);
  playing = $state(false);
  position = $state(0);
  duration = $state(0);
  tempo = $state(1);
  semitone = $state(0);
  minusOne = $state(false);
  volume = $state(1);
  engineKind = $state<RubberBandEngine>(loadEngine());
  engineState = $state<'loading' | 'ready' | 'error'>('loading');
  error = $state('');
  storageOk = $state(storageSupported());
  private currentUrl = '';
  /** Files opened without saving them to the library (id "tmp:<n>"). */
  // Intentionally not reactive: only looked up by id, never rendered.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly tempFiles = new Map<string, File>();
  private tempCounter = 0;

  get hasNext(): boolean {
    return nextIndex(this.queue.length, this.queueIndex) !== null;
  }

  /** True when the current track is a picked file that is not stored in the library. */
  get currentIsTemp(): boolean {
    return !!this.current && this.current.id.startsWith('tmp:');
  }

  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('timeupdate', () => {
      this.position = this.audio.currentTime;
      this.updatePositionState();
    });
    this.audio.addEventListener('durationchange', () => {
      if (Number.isFinite(this.audio.duration)) this.duration = this.audio.duration;
    });
    this.audio.addEventListener('play', () => (this.playing = true));
    this.audio.addEventListener('pause', () => (this.playing = false));
    this.audio.addEventListener('ended', () => void this.onEnded());
    this.audio.addEventListener('error', () => (this.error = id.player.loadError));
    for (const name of [
      'play',
      'pause',
      'waiting',
      'stalled',
      'ended',
      'seeked',
      'error',
    ] as const) {
      this.audio.addEventListener(name, () =>
        this.log.event(`media:${name}`, { time: this.audio.currentTime }),
      );
    }
    document.addEventListener('visibilitychange', () =>
      this.log.event('visibilitychange', document.visibilityState),
    );
    window.addEventListener('error', (e) => this.log.event('window:error', e.message));
    this.setupMediaSession();
  }

  async init(): Promise<void> {
    if (!window.isSecureContext) {
      this.engineState = 'error';
      this.error = id.player.insecure;
    } else {
      this.engine = new MusikAudioEngine(this.audio, {
        assets: engineAssets,
        path: 'A',
        engine: this.engineKind,
      });
      try {
        this.engine.events.stateChange = (st) => this.log.event('audiocontext:state', st);
        this.engine.events.ready = (r) => this.log.event('worklet:ready', r);
        this.engine.events.error = (m) => this.log.event('worklet:error', m);
        await this.engine.init();
        this.engineState = 'ready';
        this.log.event('engine:init', { state: this.engine.context.state });
      } catch (err) {
        this.engineState = 'error';
        this.error = `${id.player.engineError}: ${err instanceof Error ? err.message : String(err)}`;
        this.log.event('engine:error', this.error);
      }
    }
    await this.refresh();
    this.log.event('library:loaded', { songs: this.songs.length });
    setInterval(() => this.sampleLog(), 1000);
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* best effort */
    }
  }

  async refresh(): Promise<void> {
    if (!this.storageOk) return;
    try {
      this.songs = sortSongs(await this.store.list());
    } catch {
      this.error = id.library.storageError;
    }
  }

  async addFiles(files: File[]): Promise<{ added: number; rejected: number }> {
    let added = 0;
    let rejected = 0;
    for (const file of files) {
      try {
        await this.store.add(file);
        added++;
      } catch {
        rejected++;
      }
    }
    await this.refresh();
    this.log.event('library:add', { added, rejected });
    return { added, rejected };
  }

  /** Play a library song; the queue becomes the library list in its current order. */
  async select(song: SongMeta, autoplay = true): Promise<void> {
    this.queue = [...this.songs];
    const at = this.queue.findIndex((s) => s.id === song.id);
    if (at < 0) this.queue = [song];
    this.queueIndex = at < 0 ? 0 : at;
    await this.load(song, autoplay);
  }

  /**
   * Play files straight from the device (system file picker) without copying them into the
   * library. The picked files become the queue; they are gone after the app is closed.
   */
  async playFiles(files: File[]): Promise<number> {
    const picked = files.filter(isSupportedAudio);
    if (picked.length === 0) return 0;
    this.tempFiles.clear();
    const items = picked.map((file): SongMeta => {
      const tmpId = `tmp:${++this.tempCounter}`;
      this.tempFiles.set(tmpId, file);
      return {
        id: tmpId,
        title: titleFromFileName(file.name),
        fileName: file.name,
        size: file.size,
        duration: 0,
        addedAt: Date.now(),
        source: 'local',
        mime: file.type || 'audio/mpeg',
        peaks: new Float32Array(0),
      };
    });
    this.queue = items;
    this.queueIndex = 0;
    this.log.event('files:open', { count: items.length });
    await this.load(items[0]!, true);
    return items.length;
  }

  /** Store the current temporary track in the library; it then behaves like any library song. */
  async saveCurrent(): Promise<SongMeta | null> {
    const cur = this.current;
    const file = cur ? this.tempFiles.get(cur.id) : undefined;
    if (!cur || !file) return null;
    try {
      const saved = await this.store.add(file);
      this.tempFiles.delete(cur.id);
      await this.refresh();
      this.replaceItem(cur.id, saved);
      this.log.event('files:saved', { title: saved.title });
      return saved;
    } catch {
      this.error = id.library.storageError;
      return null;
    }
  }

  async next(): Promise<void> {
    const ni = nextIndex(this.queue.length, this.queueIndex);
    if (ni === null) return;
    this.queueIndex = ni;
    await this.load(this.queue[ni]!, true);
  }

  async prev(): Promise<void> {
    const action = previousAction(this.queueIndex, this.audio.currentTime);
    if (action.kind === 'restart') {
      this.seek(0);
      return;
    }
    this.queueIndex = action.index;
    await this.load(this.queue[action.index]!, true);
  }

  /** Stop = pause and return to the start. */
  stop(): void {
    this.audio.pause();
    this.seek(0);
  }

  private async onEnded(): Promise<void> {
    if (this.hasNext) await this.next();
    else this.playing = false;
  }

  private async load(song: SongMeta, autoplay: boolean): Promise<void> {
    this.error = '';
    let file: File | undefined = this.tempFiles.get(song.id);
    if (!file) {
      try {
        file = await this.store.getFile(song.id);
      } catch {
        this.error = id.player.loadError;
        return;
      }
    }
    if (this.currentUrl) URL.revokeObjectURL(this.currentUrl);
    this.currentUrl = URL.createObjectURL(file);
    this.audio.src = this.currentUrl;
    this.current = song;
    this.log.event('song', { title: song.title, size: song.size, duration: song.duration });
    this.position = 0;
    this.duration = song.duration;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: id.appName,
      });
    }
    if (song.id.startsWith('tmp:') && song.peaks.length === 0) void this.analyzeTemp(song, file);
    if (autoplay) await this.play();
  }

  /** Waveform and duration for a picked file are computed after playback has started. */
  private async analyzeTemp(song: SongMeta, file: File): Promise<void> {
    const { peaks, duration } = await analyzeAudio(file);
    this.replaceItem(song.id, { ...song, peaks, duration: duration || song.duration });
  }

  /** Swap a queue item (and `current` when it is that item) for an updated/saved version. */
  private replaceItem(oldId: string, item: SongMeta): void {
    this.queue = this.queue.map((q) => (q.id === oldId ? item : q));
    if (this.current?.id === oldId) {
      this.current = item;
      if (item.duration > 0 && !Number.isFinite(this.audio.duration)) this.duration = item.duration;
    }
  }

  async play(): Promise<void> {
    if (!this.current) return;
    try {
      await this.engine?.resume();
      await this.audio.play();
    } catch {
      this.error = id.player.loadError;
    }
  }

  pause(): void {
    this.audio.pause();
  }

  async toggle(): Promise<void> {
    if (this.audio.paused) await this.play();
    else this.pause();
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    const max = Number.isFinite(this.audio.duration) ? this.audio.duration : this.duration;
    this.audio.currentTime = Math.min(Math.max(0, seconds), max || 0);
    this.position = this.audio.currentTime;
  }

  skip(delta: number): void {
    this.seek(this.audio.currentTime + delta);
  }

  setTempo(v: number): void {
    this.tempo = clampTempo(v);
    this.engine?.setTempo(this.tempo);
    this.log.event('tempo', this.tempo);
  }

  setSemitone(v: number): void {
    this.semitone = clampSemitone(v);
    this.engine?.setSemitone(this.semitone);
    this.log.event('semitone', this.semitone);
  }

  setMinusOne(on: boolean): void {
    this.minusOne = on;
    this.engine?.setMinusOne(on);
    this.log.event('minusOne', on);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.engine) this.engine.setVolume(this.volume);
    else this.audio.volume = this.volume;
  }

  setEngineKind(kind: RubberBandEngine): void {
    this.engineKind = kind;
    try {
      localStorage.setItem(ENGINE_KEY, kind);
    } catch {
      /* ignore */
    }
    this.engine?.setEngine(kind);
    this.log.event('engine', kind);
  }

  async rename(song: SongMeta, title: string): Promise<void> {
    await this.store.rename(song.id, title);
    if (this.current?.id === song.id) this.current = { ...song, title: title.trim() || song.title };
    await this.refresh();
  }

  async remove(song: SongMeta): Promise<void> {
    if (this.current?.id === song.id) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.current = null;
      this.position = 0;
      this.duration = 0;
    }
    this.queue = this.queue.filter((q) => q.id !== song.id);
    this.queueIndex = this.current ? this.queue.findIndex((q) => q.id === this.current!.id) : -1;
    await this.store.remove(song.id);
    await this.refresh();
  }

  async clearAll(): Promise<void> {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.current = null;
    this.queue = [];
    this.queueIndex = -1;
    this.tempFiles.clear();
    await this.store.clear();
    this.songs = [];
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  }

  private sampleLog(): void {
    if (!this.engine?.context) return;
    this.log.sample({
      ...this.engine.snapshot(),
      visibility: document.visibilityState,
      mediaTime: this.audio.currentTime,
      paused: this.audio.paused,
      song: this.current?.title ?? null,
      minusOne: this.minusOne,
    });
  }

  /** Download the diagnostic log (same JSON format as the lab page) plus library/storage facts. */
  async downloadLog(): Promise<void> {
    let storage: Record<string, unknown> = {};
    try {
      const est = await navigator.storage?.estimate?.();
      storage = {
        usage: est?.usage ?? null,
        quota: est?.quota ?? null,
        persisted: (await navigator.storage?.persisted?.()) ?? null,
      };
    } catch {
      /* ignore */
    }
    this.log.download({
      app: 'musik-app-m1',
      build: __BUILD__,
      settings: {
        tempo: this.tempo,
        semitone: this.semitone,
        minusOne: this.minusOne,
        engine: this.engineKind,
        path: 'A',
      },
      library: this.songs.map((s) => ({
        title: s.title,
        size: s.size,
        duration: s.duration,
        peaks: s.peaks.length,
      })),
      storage,
    });
  }

  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => void this.play());
    ms.setActionHandler('pause', () => this.pause());
    ms.setActionHandler('previoustrack', () => void this.prev());
    ms.setActionHandler('nexttrack', () => void this.next());
    ms.setActionHandler('stop', () => this.stop());
    ms.setActionHandler('seekbackward', () => this.skip(-5));
    ms.setActionHandler('seekforward', () => this.skip(5));
    ms.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) this.seek(d.seekTime);
    });
  }

  private updatePositionState(): void {
    if (!('mediaSession' in navigator) || !Number.isFinite(this.audio.duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: this.audio.duration,
        playbackRate: this.audio.playbackRate || 1,
        position: Math.min(this.audio.currentTime, this.audio.duration),
      });
    } catch {
      /* ignore invalid state */
    }
  }
}
