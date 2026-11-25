/**
 * Shortens a YouTube video title to "Song - Artist".
 *
 * Most music uploads are named "Artist - Song (Official Video) [HD]". The result puts the song
 * first, as the user asked. Without an "Artist - Song" split the channel name is used as artist
 * (minus " - Topic", "VEVO", "Official"). It is a best guess, never an error: when nothing can be
 * cleaned the original title comes back.
 */

/** Bracketed or trailing noise words that are not part of the song name. */
const NOISE =
  /\b(official|lyrics?|lirik|video|music video|mv|audio|hd|hq|4k|1080p|live|remaster(ed)?|karaoke|cover|visuali[sz]er|clip|full album|with lyrics?|explicit)\b/i;

const SEPARATOR = /\s+[-–—|:]\s+|\s*[–—|]\s*/;

function stripNoiseBrackets(text: string): string {
  return text.replace(/[([{【「『]([^)\]}】」』]*)[)\]}】」』]/g, (whole, inner: string) =>
    NOISE.test(inner) || /^\s*(ft|feat|featuring)\b/i.test(inner) ? ' ' : whole,
  );
}

function stripTrailingNoise(text: string): string {
  let t = text;
  for (let i = 0; i < 4; i++) {
    const next = t.replace(
      new RegExp(
        `\\s*[-–—|:/]?\\s*(official( music| lyric| audio)? (video|audio|lyrics?)|official|lyrics?|lirik|video clip|music video|audio|hd|hq|4k)\\s*$`,
        'i',
      ),
      '',
    );
    if (next === t) break;
    t = next;
  }
  return t;
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—|:,.]+|[\s\-–—|:,.]+$/g, '')
    .trim();
}

/** "Artist - Topic", "ArtistVEVO", "Artist Official" -> "Artist". */
export function cleanChannelName(channel: string | null | undefined): string {
  if (!channel) return '';
  return tidy(
    channel
      .replace(/\s+-\s+topic$/i, '')
      .replace(/vevo$/i, '')
      .replace(/\s+(official|music|channel|records?)$/i, ''),
  );
}

export function simplifyTitle(rawTitle: string, channel?: string | null): string {
  const original = tidy(rawTitle);
  if (original === '') return rawTitle.trim();
  const t = tidy(stripTrailingNoise(stripNoiseBrackets(original)));
  if (t === '') return original;

  const parts = t
    .split(SEPARATOR)
    .map(tidy)
    .filter((p) => p !== '');
  let song: string;
  let artist: string;
  if (parts.length >= 2) {
    // "Artist - Song": the part after the first separator is the song.
    artist = parts[0]!;
    song = tidy(stripTrailingNoise(parts.slice(1).join(' - ')));
    if (song === '') return t;
    // "Song - Artist" upload: the channel name matches the last part, so the order is already right.
    const ch = cleanChannelName(channel).toLowerCase();
    if (ch !== '' && parts.length === 2 && song.toLowerCase() === ch) {
      song = artist;
      artist = parts[1]!;
    }
  } else {
    song = t;
    artist = cleanChannelName(channel);
  }
  // A song title that already ends with the artist name needs no repeat.
  if (artist === '' || song.toLowerCase().endsWith(artist.toLowerCase())) return song;
  // Remove a "ft. X" tail from the artist part to keep the name short.
  artist = tidy(artist.replace(/\s+(ft|feat|featuring)\.?\s+.*$/i, ''));
  return `${song} - ${artist}`;
}
