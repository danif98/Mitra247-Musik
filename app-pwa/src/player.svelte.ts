/** App-wide player controller (Svelte 5 runes). Owns the <audio> element, engine and library. */
import {
  LibraryStore,
  MusikAudioEngine,
  clampSemitone,
  analyzeAudio,
  clampTempo,
  isSupportedAudio,
  DEFAULT_MINUS_ONE,
  EQ_BANDS,
  clampMinusOneParams,
  type MinusOneParams,
  NO_LOOP,
  clampBpm,
  clampEqGain,
  defaultPreset,
  BACKUP_VERSION,
  SETTING_KEYS,
  songSignature,
  type BackupData,
  loopJumpTarget,
  setA,
  setB,
  type LoopRange,
  type Preset,
  advance,
  hasNextTrack,
  hasPreviousTrack,
  nextRepeat,
  previous as previousTrack,
  reshuffle,
  sanitizePlayMode,
  sequentialOrder,
  shuffleOrder,
  type PlayMode,
  limitTracks,
  parseLastPosition,
  parseLastQueue,
  serializeLastQueue,
  type LastTrack,
  type RepeatMode,
  sortSongs,
  titleFromFileName,
  storageSupported,
  type RubberBandEngine,
  type SongMeta,
} from '@musik/core';
import { engineAssets } from '@musik/core/audio/assets';
import { id } from '@musik/ui';
import { native, readNativeFile } from './native';
import { DiagLog } from '../lab/diag-log';

const ENGINE_KEY = 'musik.engine';
const METRO_KEY = 'musik.metronome';

interface MetroSettings {
  bpm: number;
  beatsPerBar: number;
  countIn: boolean;
}

function loadMetro(): MetroSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(METRO_KEY) ?? '{}') as Partial<MetroSettings>;
    return {
      bpm: clampBpm(typeof raw.bpm === 'number' ? raw.bpm : 100),
      beatsPerBar: Math.min(12, Math.max(1, Math.round(raw.beatsPerBar ?? 4))),
      countIn: raw.countIn === true,
    };
  } catch {
    return { bpm: 100, beatsPerBar: 4, countIn: false };
  }
}

const MODE_KEY = 'musik.playmode';
const LAST_KEY = 'musik.last';
const LASTPOS_KEY = 'musik.lastpos';

function loadPlayMode(): PlayMode {
  try {
    return sanitizePlayMode(JSON.parse(localStorage.getItem(MODE_KEY) ?? '{}'));
  } catch {
    return sanitizePlayMode(null);
  }
}

function loadEngine(): RubberBandEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === 'R3' ? 'R3' : 'R2';
  } catch {
    return 'R2';
  }
}

/** A track for playLazy: metadata is known up front, the file is read when it is played. */
export interface LazyTrack {
  /** content:// URI: lets the queue be remembered and restored (music on the phone). */
  uri?: string;
  artist?: string;
  title: string;
  fileName: string;
  size: number;
  /** Seconds. */
  duration: number;
  mime: string;
  open: () => Promise<File>;
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
  /** Where the queue came from, shown above the list ("Library", "Musik di HP · Music/Pop"). */
  queueLabel = $state('');
  /** Auto next, repeat and shuffle (kept on this device). */
  autoNext = $state(loadPlayMode().autoNext);
  repeat = $state<RepeatMode>(loadPlayMode().repeat);
  shuffle = $state(loadPlayMode().shuffle);
  playing = $state(false);
  position = $state(0);
  duration = $state(0);
  tempo = $state(1);
  semitone = $state(0);
  minusOne = $state(false);
  moParams = $state<MinusOneParams>({ ...DEFAULT_MINUS_ONE });
  volume = $state(1);
  loopA = $state<number | null>(null);
  loopB = $state<number | null>(null);
  eq = $state<number[]>(new Array<number>(EQ_BANDS).fill(0));
  metroOn = $state(false);
  bpm = $state(loadMetro().bpm);
  beatsPerBar = $state(loadMetro().beatsPerBar);
  countIn = $state(loadMetro().countIn);
  countingIn = $state(false);
  engineKind = $state<RubberBandEngine>(loadEngine());
  engineState = $state<'loading' | 'ready' | 'error'>('loading');
  error = $state('');
  storageOk = $state(storageSupported());
  private currentUrl = '';
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private presetTimer: ReturnType<typeof setTimeout> | null = null;
  private applyingPreset = false;
  private countToken = 0;
  /** Files opened without saving them to the library (id "tmp:<n>"). */
  // Intentionally not reactive: only looked up by id, never rendered.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly tempFiles = new Map<string, File>();
  private tempCounter = 0;
  /** Phone tracks of the current queue (for remembering it), by temporary id. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly lazyInfo = new Map<string, LastTrack>();
  private lastSavedPosition = -100;
  /** Temporary tracks whose file is read only when the track is played (see playLazy). */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly tempLoaders = new Map<string, () => Promise<File>>();

  get hasNext(): boolean {
    return hasNextTrack(this.playOrder(), this.queueIndex, this.playMode);
  }

  get hasPrev(): boolean {
    return hasPreviousTrack(this.playOrder(), this.queueIndex, this.playMode);
  }

  get playMode(): PlayMode {
    return { autoNext: this.autoNext, repeat: this.repeat, shuffle: this.shuffle };
  }

  /** Random play order for the current queue; rebuilt when the queue changes or shuffle is toggled. */
  private shuffled: number[] | null = null;

  /** Play order: a permutation of the queue indices (sequential when shuffle is off). */
  private playOrder(): number[] {
    const n = this.queue.length;
    if (!this.shuffle) return sequentialOrder(n);
    if (!this.shuffled || this.shuffled.length !== n) {
      this.shuffled = shuffleOrder(n, this.queueIndex);
    }
    return this.shuffled;
  }

  toggleAutoNext(): void {
    this.autoNext = !this.autoNext;
    this.saveMode();
  }

  /** Set the repeat mode; `persist: false` is a temporary override (practice mode). */
  setRepeat(mode: RepeatMode, persist = true): void {
    this.repeat = mode;
    if (persist) this.saveMode();
  }

  /** The repeat mode to bring back when practice mode ends (null = no override active). */
  private repeatBackup: RepeatMode | null = null;

  /** Practice mode: the current song repeats by default. The usual setting is kept aside. */
  enterPractice(): void {
    if (this.repeatBackup !== null) return;
    this.repeatBackup = this.repeat;
    this.setRepeat('one', false);
  }

  leavePractice(): void {
    if (this.repeatBackup === null) return;
    this.setRepeat(this.repeatBackup, false);
    this.repeatBackup = null;
  }

  cycleRepeat(): void {
    this.repeatBackup = null; // a choice made by the user wins over the practice default
    this.repeat = nextRepeat(this.repeat);
    this.saveMode();
  }

  toggleShuffle(): void {
    this.shuffle = !this.shuffle;
    this.shuffled = null; // a new order starts with the playing track
    this.saveMode();
  }

  private saveMode(): void {
    try {
      localStorage.setItem(MODE_KEY, JSON.stringify(this.playMode));
    } catch {
      /* storage unavailable: the setting only lasts for this session */
    }
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
      this.savePosition(false);
    });
    this.audio.addEventListener('durationchange', () => {
      if (Number.isFinite(this.audio.duration)) this.duration = this.audio.duration;
    });
    this.audio.addEventListener('play', () => {
      this.playing = true;
      this.startLoopWatch();
    });
    this.audio.addEventListener('pause', () => {
      this.playing = false;
      this.stopLoopWatch();
      this.savePosition(true);
    });
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
    this.shuffled = null;
    this.queueLabel = id.player.sourceLibrary;
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
    this.tempLoaders.clear();
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
    this.shuffled = null;
    this.queueLabel = id.player.sourceFiles;
    this.queue = items;
    this.queueIndex = 0;
    this.log.event('files:open', { count: items.length });
    await this.load(items[0]!, true);
    return items.length;
  }

  /**
   * Play a list of tracks whose files are read on demand (music on the phone). The whole list is
   * the queue, so next/previous work, but only the playing track is kept in memory.
   */
  async playLazy(entries: LazyTrack[], start: number, label = ''): Promise<boolean> {
    if (entries.length === 0) return false;
    const at = Math.min(Math.max(start, 0), entries.length - 1);
    this.tempFiles.clear();
    this.tempLoaders.clear();
    this.lazyInfo.clear();
    const items = entries.map((entry): SongMeta => {
      const tmpId = `tmp:${++this.tempCounter}`;
      this.tempLoaders.set(tmpId, entry.open);
      if (entry.uri) {
        this.lazyInfo.set(tmpId, {
          uri: entry.uri,
          title: entry.title,
          artist: entry.artist ?? '',
          fileName: entry.fileName,
          size: entry.size,
          duration: entry.duration,
          mime: entry.mime,
        });
      }
      return {
        id: tmpId,
        title: entry.title,
        fileName: entry.fileName,
        size: entry.size,
        duration: entry.duration,
        addedAt: Date.now(),
        source: 'local',
        mime: entry.mime || 'audio/mpeg',
        peaks: new Float32Array(0),
        ...(entry.artist ? { artist: entry.artist } : {}),
      };
    });
    this.shuffled = null;
    this.queueLabel = label || id.player.sourceDevice;
    this.queue = items;
    this.queueIndex = at;
    this.log.event('files:open', { count: items.length });
    await this.load(items[at]!, true);
    return true;
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
      this.schedulePresetSave();
      this.log.event('files:saved', { title: saved.title });
      return saved;
    } catch {
      this.error = id.library.storageError;
      return null;
    }
  }

  /** Jump to a track of the queue (tap in the list). */
  async playAt(index: number): Promise<void> {
    const song = this.queue[index];
    if (!song) return;
    this.queueIndex = index;
    await this.load(song, true);
  }

  // ---- last played: the queue and position are kept so the Play screen shows them again ----

  private positionKey(song: SongMeta): string {
    return this.lazyInfo.get(song.id)?.uri ?? song.id;
  }

  /** Remember the queue (library ids, or the phone tracks) and which one is playing. */
  private saveLast(): void {
    const cur = this.current;
    if (!cur) return;
    try {
      let json: string | null = null;
      if (!cur.id.startsWith('tmp:')) {
        json = serializeLastQueue({
          v: 1,
          source: 'library',
          label: this.queueLabel,
          index: Math.max(0, this.queueIndex),
          ids: this.queue.filter((x) => !x.id.startsWith('tmp:')).map((x) => x.id),
        });
      } else {
        const infos = this.queue.map((x) => this.lazyInfo.get(x.id));
        // Files opened with the file picker cannot be opened again later: not remembered.
        if (infos.length > 0 && infos.every((x): x is LastTrack => x !== undefined)) {
          const lim = limitTracks(infos, Math.max(0, this.queueIndex));
          json = serializeLastQueue({
            v: 1,
            source: 'device',
            label: this.queueLabel,
            index: lim.index,
            tracks: lim.tracks,
          });
        }
      }
      if (json) localStorage.setItem(LAST_KEY, json);
      this.lastSavedPosition = -100;
      this.savePosition(true);
    } catch {
      /* storage full or unavailable: the Play screen just starts empty next time */
    }
  }

  private savePosition(force: boolean): void {
    const cur = this.current;
    if (!cur) return;
    const at = this.audio.currentTime;
    if (!force && Math.abs(at - this.lastSavedPosition) < 5) return;
    this.lastSavedPosition = at;
    try {
      localStorage.setItem(
        LASTPOS_KEY,
        JSON.stringify({ key: this.positionKey(cur), position: Math.floor(at) }),
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * Bring back the last queue and song, paused, where it stopped. Returns false when there is
   * nothing to restore (first run, songs deleted, or a phone list outside the Android app).
   */
  async restoreLast(): Promise<boolean> {
    if (this.current) return false;
    let last;
    let pos;
    try {
      last = parseLastQueue(localStorage.getItem(LAST_KEY));
      pos = parseLastPosition(localStorage.getItem(LASTPOS_KEY));
    } catch {
      return false;
    }
    if (!last) return false;

    let items: SongMeta[] = [];
    let at = 0;
    if (last.source === 'library') {
      const byId: Record<string, SongMeta> = {};
      for (const x of this.songs) byId[x.id] = x;
      const wanted = last.ids ?? [];
      items = wanted.map((i) => byId[i]).filter((x): x is SongMeta => x !== undefined);
      const playingId = wanted[last.index];
      at = Math.max(
        0,
        items.findIndex((x) => x.id === playingId),
      );
      this.lazyInfo.clear();
      this.tempLoaders.clear();
    } else {
      if (!native) return false;
      this.tempFiles.clear();
      this.tempLoaders.clear();
      this.lazyInfo.clear();
      items = (last.tracks ?? []).map((t): SongMeta => {
        const tmpId = `tmp:${++this.tempCounter}`;
        this.lazyInfo.set(tmpId, t);
        this.tempLoaders.set(tmpId, () =>
          readNativeFile(t.uri, t.fileName || `${t.title}.mp3`, t.mime),
        );
        return {
          id: tmpId,
          title: t.title,
          fileName: t.fileName,
          size: t.size,
          duration: t.duration,
          addedAt: Date.now(),
          source: 'local',
          mime: t.mime,
          peaks: new Float32Array(0),
          ...(t.artist ? { artist: t.artist } : {}),
        };
      });
      at = Math.min(last.index, items.length - 1);
    }
    if (items.length === 0) return false;

    this.shuffled = null;
    this.queueLabel = last.label;
    this.queue = items;
    this.queueIndex = at;
    const song = items[at]!;
    await this.load(song, false);
    if ((this.current as SongMeta | null)?.id !== song.id) {
      // The file is gone: start empty instead of showing a broken player.
      this.error = '';
      this.queue = [];
      this.queueIndex = -1;
      return false;
    }
    if (pos && pos.key === this.positionKey(song) && pos.position > 1) {
      const limit = (this.duration || song.duration || 0) - 2;
      if (limit <= 0 || pos.position < limit) {
        this.seek(pos.position);
        this.position = pos.position;
      }
    }
    return true;
  }

  async next(): Promise<void> {
    const step = advance(this.playOrder(), this.queueIndex, 'manual', this.playMode);
    if (step.kind === 'track') await this.goTo(step.index, step.wrapped);
  }

  async prev(): Promise<void> {
    const action = previousTrack(
      this.playOrder(),
      this.queueIndex,
      this.audio.currentTime,
      this.playMode,
    );
    if (action.kind === 'restart') {
      this.seek(0);
      return;
    }
    await this.goTo(action.index, false);
  }

  /** Switch to a queue index; a new round with shuffle gets a fresh random order. */
  private async goTo(index: number, wrapped: boolean): Promise<void> {
    let at = index;
    if (wrapped && this.shuffle) {
      this.shuffled = reshuffle(this.queue.length, this.queueIndex);
      at = this.shuffled[0] ?? index;
    }
    const song = this.queue[at];
    if (!song) return;
    this.queueIndex = at;
    await this.load(song, true);
  }

  /** Stop = pause and return to the start. */
  stop(): void {
    this.cancelCountIn();
    this.audio.pause();
    this.seek(0);
  }

  private async onEnded(): Promise<void> {
    const step = advance(this.playOrder(), this.queueIndex, 'ended', this.playMode);
    if (step.kind === 'restart') {
      this.seek(0);
      await this.play();
    } else if (step.kind === 'track') {
      await this.goTo(step.index, step.wrapped);
    } else {
      this.playing = false;
    }
  }

  private async load(song: SongMeta, autoplay: boolean): Promise<void> {
    this.error = '';
    await this.flushPreset(); // save the previous song's settings before they are replaced
    let file: File | undefined = this.tempFiles.get(song.id);
    const opener = this.tempLoaders.get(song.id);
    if (!file && opener) {
      try {
        file = await opener();
      } catch {
        this.error = id.player.loadError;
        return;
      }
      // Keep only the playing lazy track in memory.
      for (const key of [...this.tempFiles.keys()]) {
        if (this.tempLoaders.has(key)) this.tempFiles.delete(key);
      }
      this.tempFiles.set(song.id, file);
    }
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
    this.saveLast();
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
    await this.applyPresetFor(song);
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
      if (this.countIn && this.engine && this.audio.paused) {
        const token = ++this.countToken;
        const m = this.engine.metronome;
        m.setBpm(this.bpm);
        m.beatsPerBar = this.beatsPerBar;
        const wasRunning = this.metroOn;
        m.stop();
        this.countingIn = true;
        const { downbeat, done } = m.countIn(this.beatsPerBar);
        await done;
        if (token !== this.countToken) return; // cancelled by pause/stop
        this.countingIn = false;
        if (wasRunning) m.start({ startAt: downbeat }); // keep ticking in time with the song
      }
      await this.audio.play();
    } catch {
      this.countingIn = false;
      this.error = id.player.loadError;
    }
  }

  private cancelCountIn(): void {
    if (!this.countingIn) return;
    this.countToken++;
    this.countingIn = false;
    this.engine?.metronome.stop();
    if (this.metroOn) this.engine?.metronome.start();
  }

  pause(): void {
    this.cancelCountIn();
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
    this.schedulePresetSave();
  }

  setSemitone(v: number): void {
    this.semitone = clampSemitone(v);
    this.engine?.setSemitone(this.semitone);
    this.log.event('semitone', this.semitone);
    this.schedulePresetSave();
  }

  /** Minus One mode and manual controls (strength, bass cutoff, vocal band width). */
  setMinusOneParams(patch: Partial<MinusOneParams>): void {
    this.moParams = clampMinusOneParams({ ...this.moParams, ...patch });
    this.engine?.setMinusOneParams(this.moParams);
    this.log.event('minusOne:params', this.moParams);
    this.schedulePresetSave();
  }

  setMinusOne(on: boolean): void {
    this.minusOne = on;
    this.engine?.setMinusOne(on);
    this.log.event('minusOne', on);
    this.schedulePresetSave();
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

  // --- loop A-B ---------------------------------------------------------------------------

  get loop(): LoopRange {
    return { a: this.loopA, b: this.loopB };
  }

  private setLoop(l: LoopRange): void {
    this.loopA = l.a;
    this.loopB = l.b;
    this.log.event('loop', l);
    this.schedulePresetSave();
  }

  setLoopA(): void {
    this.setLoop(setA(this.loop, this.audio.currentTime));
  }

  setLoopB(): void {
    this.setLoop(setB(this.loop, this.audio.currentTime));
  }

  clearLoop(): void {
    this.setLoop(NO_LOOP);
  }

  private startLoopWatch(): void {
    if (this.loopTimer) return;
    this.loopTimer = setInterval(() => {
      const target = loopJumpTarget(this.loop, this.audio.currentTime);
      if (target !== null) this.audio.currentTime = target;
    }, 25);
  }

  private stopLoopWatch(): void {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
  }

  // --- equalizer --------------------------------------------------------------------------

  setEqBand(band: number, db: number): void {
    const next = [...this.eq];
    next[band] = clampEqGain(Math.round(db));
    this.eq = next;
    this.engine?.setEq(next);
    this.schedulePresetSave();
  }

  resetEq(): void {
    this.eq = new Array<number>(EQ_BANDS).fill(0);
    this.engine?.setEq(this.eq);
    this.log.event('eq:reset');
    this.schedulePresetSave();
  }

  // --- metronome --------------------------------------------------------------------------

  private saveMetro(): void {
    try {
      localStorage.setItem(
        METRO_KEY,
        JSON.stringify({ bpm: this.bpm, beatsPerBar: this.beatsPerBar, countIn: this.countIn }),
      );
    } catch {
      /* ignore */
    }
  }

  toggleMetronome(): void {
    const m = this.engine?.metronome;
    if (!m) return;
    this.metroOn = !this.metroOn;
    this.log.event('metronome', this.metroOn);
    if (this.metroOn) {
      void this.engine?.resume();
      m.setBpm(this.bpm);
      m.beatsPerBar = this.beatsPerBar;
      m.start();
    } else {
      m.stop();
    }
  }

  setBpm(v: number): void {
    this.bpm = clampBpm(v);
    this.engine?.metronome.setBpm(this.bpm);
    this.saveMetro();
  }

  setBeatsPerBar(v: number): void {
    this.beatsPerBar = Math.min(12, Math.max(1, Math.round(v)));
    if (this.engine) this.engine.metronome.beatsPerBar = this.beatsPerBar;
    this.saveMetro();
  }

  setCountIn(on: boolean): void {
    this.countIn = on;
    this.saveMetro();
  }

  // --- per-song preset --------------------------------------------------------------------

  private snapshot(): Preset {
    return {
      tempo: this.tempo,
      semitone: this.semitone,
      minusOne: this.minusOne,
      loopA: this.loopA,
      loopB: this.loopB,
      eq: [...this.eq],
      mo: { ...this.moParams },
    };
  }

  /** Settings of a library song are saved automatically a moment after every change. */
  private schedulePresetSave(): void {
    if (this.applyingPreset || !this.current || this.currentIsTemp) return;
    if (this.presetTimer) clearTimeout(this.presetTimer);
    const song = this.current;
    this.presetTimer = setTimeout(() => {
      this.presetTimer = null;
      void this.writePreset(song, this.snapshot());
    }, 600);
  }

  private async writePreset(song: SongMeta, preset: Preset): Promise<void> {
    try {
      // A reset is stored too (not deleted): its time lets the backup tell "reset" from "never set".
      await this.store.setPreset(song.id, preset, songSignature(song));
      this.log.event('preset:saved', { songId: song.id.slice(0, 8) });
    } catch {
      /* best effort: presets are a convenience */
    }
  }

  private async flushPreset(): Promise<void> {
    if (!this.presetTimer || !this.current) return;
    clearTimeout(this.presetTimer);
    this.presetTimer = null;
    if (!this.currentIsTemp) await this.writePreset(this.current, this.snapshot());
  }

  /** Practice data for the Google Drive backup: presets and a few settings, never the songs. */
  async exportBackup(): Promise<BackupData> {
    await this.flushPreset();
    const settings: Record<string, string> = {};
    for (const key of SETTING_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) settings[key] = value;
    }
    return {
      v: BACKUP_VERSION,
      updatedAt: Date.now(),
      settings,
      presets: await this.store.listPresets(),
    };
  }

  /**
   * Takes over what the backup has that is newer than this device. Settings are only filled in
   * where this device has none (and apply after the app is restarted).
   */
  async importBackup(data: BackupData): Promise<{ presets: number; settings: number }> {
    const presets = await this.store.importPresets(data.presets);
    let settings = 0;
    for (const key of SETTING_KEYS) {
      const value = data.settings[key];
      if (value !== undefined && localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
        settings++;
      }
    }
    if (presets > 0 && this.current && !this.currentIsTemp) await this.applyPresetFor(this.current);
    return { presets, settings };
  }

  /** Saved preset of the song, or defaults (also for temporary files, which never save one). */
  private async applyPresetFor(song: SongMeta): Promise<void> {
    let preset = defaultPreset();
    if (!song.id.startsWith('tmp:')) {
      try {
        preset = (await this.store.getPreset(song.id, songSignature(song))) ?? preset;
      } catch {
        /* use defaults */
      }
    }
    this.applyingPreset = true;
    try {
      this.setTempo(preset.tempo);
      this.setSemitone(preset.semitone);
      this.setMinusOne(preset.minusOne);
      this.loopA = preset.loopA;
      this.loopB = preset.loopB;
      this.eq = [...preset.eq];
      this.engine?.setEq(this.eq);
      this.moParams = { ...preset.mo };
      this.engine?.setMinusOneParams(this.moParams);
    } finally {
      this.applyingPreset = false;
    }
    this.log.event('preset:applied', { song: song.title });
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
    this.tempLoaders.clear();
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
