/** Shared types of the legal music sources (Internet Archive, Openverse, Wikimedia Commons). */

export type SourceId = 'archive' | 'openverse' | 'commons';

export const SOURCE_NAMES: Record<SourceId, string> = {
  archive: 'Internet Archive',
  openverse: 'Openverse',
  commons: 'Wikimedia Commons',
};

export interface License {
  /** Short code such as "CC BY-SA 4.0", "CC0" or "Domain publik". */
  label: string;
  /** Link to the license text. */
  url: string;
  /** False for NC (non-commercial) licenses. */
  commercial: boolean;
  /** False for ND (no derivatives) licenses. */
  derivatives: boolean;
}

/** One search result. `downloadUrl` is null for albums (Internet Archive items): expand them first. */
export interface SearchHit {
  source: SourceId;
  id: string;
  title: string;
  creator: string;
  license: License;
  /** Page of the work on the source site (for attribution and as a fallback link). */
  pageUrl: string;
  durationSec: number | null;
  size: number | null;
  downloadUrl: string | null;
  mime: string | null;
}

/** A downloadable file (always has a direct URL). */
export interface SourceTrack extends SearchHit {
  downloadUrl: string;
}

export interface SearchPage {
  source: SourceId;
  hits: SearchHit[];
  hasMore: boolean;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type SourceErrorCode =
  | 'network' // offline, CORS or TLS problem
  | 'http' // non-2xx answer
  | 'bad_response' // JSON of an unexpected shape
  | 'bad_url' // not https
  | 'not_audio' // the server answered with something that is not audio
  | 'too_large'
  | 'aborted';

export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

/** Credit stored with a downloaded song (shown in the library and kept for attribution). */
export interface SongCredit {
  source: SourceId;
  creator: string;
  license: string;
  licenseUrl: string;
  pageUrl: string;
}

export function creditOf(hit: SearchHit): SongCredit {
  return {
    source: hit.source,
    creator: hit.creator,
    license: hit.license.label,
    licenseUrl: hit.license.url,
    pageUrl: hit.pageUrl,
  };
}

/** Attribution line: "Title" by Creator, license (link), source. */
export function attributionLine(title: string, credit: SongCredit): string {
  const by = credit.creator ? ` oleh ${credit.creator}` : '';
  return `"${title}"${by} — ${credit.license} (${credit.licenseUrl}) — ${SOURCE_NAMES[credit.source]}: ${credit.pageUrl}`;
}
