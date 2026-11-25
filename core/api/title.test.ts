import { describe, expect, it } from 'vitest';
import { cleanChannelName, simplifyTitle } from './title';

describe('simplifyTitle', () => {
  it('turns "Artist - Song (Official Video)" into "Song - Artist"', () => {
    expect(simplifyTitle('Sheila On 7 - Dan (Official Music Video)')).toBe('Dan - Sheila On 7');
    expect(simplifyTitle('Coldplay - Yellow [Official Lyric Video] HD')).toBe('Yellow - Coldplay');
  });

  it('uses the channel as artist when the title has no artist part', () => {
    expect(simplifyTitle('Pamer Bojo (Official Audio)', 'Denny Caknan - Topic')).toBe(
      'Pamer Bojo - Denny Caknan',
    );
    expect(simplifyTitle('Hello', 'AdeleVEVO')).toBe('Hello - Adele');
  });

  it('keeps the song when no artist is known', () => {
    expect(simplifyTitle('Lagu Tanpa Artis')).toBe('Lagu Tanpa Artis');
  });

  it('keeps brackets that are part of the song name', () => {
    expect(simplifyTitle('Band - Song (Acoustic Version)')).toBe('Song (Acoustic Version) - Band');
  });

  it('does not repeat an artist already at the end', () => {
    expect(simplifyTitle('Yellow - Coldplay', 'Coldplay')).toBe('Yellow - Coldplay');
  });

  it('never returns an empty string', () => {
    expect(simplifyTitle('(Official Video)')).toBe('(Official Video)');
    expect(simplifyTitle('   ')).toBe('');
  });
});

describe('cleanChannelName', () => {
  it('strips Topic, VEVO and Official', () => {
    expect(cleanChannelName('Artis - Topic')).toBe('Artis');
    expect(cleanChannelName('ArtisVEVO')).toBe('Artis');
    expect(cleanChannelName('Artis Official')).toBe('Artis');
    expect(cleanChannelName(null)).toBe('');
  });
});
