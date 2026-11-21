/** Collects diagnostic samples and events on the phone, exportable as JSON. */

export interface LogEvent {
  t: number;
  iso: string;
  kind: string;
  detail?: unknown;
}

export interface LogSample {
  t: number;
  data: unknown;
}

const MAX_SAMPLES = 3600;
const MAX_EVENTS = 2000;

export class DiagLog {
  readonly startedAt = Date.now();
  readonly events: LogEvent[] = [];
  readonly samples: LogSample[] = [];

  event(kind: string, detail?: unknown): void {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({
      t: Math.round(performance.now()),
      iso: new Date().toISOString(),
      kind,
      detail,
    });
  }

  sample(data: unknown): void {
    if (this.samples.length >= MAX_SAMPLES) this.samples.shift();
    this.samples.push({ t: Math.round(performance.now()), data });
  }

  clear(): void {
    this.events.length = 0;
    this.samples.length = 0;
  }

  toJSON(extra: Record<string, unknown> = {}): string {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return JSON.stringify(
      {
        app: 'musik-lab-m0',
        exportedAt: new Date().toISOString(),
        startedAt: new Date(this.startedAt).toISOString(),
        device: {
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
          deviceMemory: nav.deviceMemory ?? null,
          screen: `${screen.width}x${screen.height}@${window.devicePixelRatio}`,
          standalone: window.matchMedia('(display-mode: standalone)').matches,
          secureContext: window.isSecureContext,
        },
        ...extra,
        events: this.events,
        samples: this.samples,
      },
      null,
      2,
    );
  }

  download(extra: Record<string, unknown> = {}): void {
    const blob = new Blob([this.toJSON(extra)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `musik-lab-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
