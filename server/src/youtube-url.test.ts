import { describe, expect, it } from 'vitest';
import { parseYoutubeUrl } from './youtube-url';

const ID = 'dQw4w9WgXcQ';
const CANON = `https://www.youtube.com/watch?v=${ID}`;

describe('parseYoutubeUrl: accepted forms are rebuilt from the id', () => {
  const ok = [
    `https://www.youtube.com/watch?v=${ID}`,
    `http://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=abc`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=xyz&t=3`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://WWW.YouTube.COM/watch?v=${ID}`,
    `https://www.youtube.com./watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
    // video inside a playlist: only the single video is used
    `https://www.youtube.com/watch?v=${ID}&list=PL1234567890&index=3`,
  ];
  for (const input of ok) {
    it(input.trim(), () => {
      expect(parseYoutubeUrl(input)).toEqual({ ok: true, videoId: ID, url: CANON });
    });
  }
});

describe('parseYoutubeUrl: rejected', () => {
  const bad: [string, unknown, string][] = [
    ['not a string', 42, 'invalid'],
    ['empty', '', 'invalid'],
    ['garbage', 'bukan url', 'invalid'],
    ['file scheme', 'file:///etc/passwd', 'scheme'],
    ['javascript scheme', 'javascript:alert(1)', 'scheme'],
    ['ftp scheme', `ftp://youtube.com/watch?v=${ID}`, 'scheme'],
    ['other host', `https://example.com/watch?v=${ID}`, 'host'],
    ['suffix trick', `https://youtube.com.evil.com/watch?v=${ID}`, 'host'],
    ['prefix trick', `https://evilyoutube.com/watch?v=${ID}`, 'host'],
    ['subdomain not on the list', `https://studio.youtube.com/watch?v=${ID}`, 'host'],
    ['userinfo trick', `https://youtube.com@evil.com/watch?v=${ID}`, 'invalid'],
    ['credentials', `https://user:pw@www.youtube.com/watch?v=${ID}`, 'invalid'],
    ['query trick', `https://evil.com/?u=https://youtube.com/watch?v=${ID}`, 'host'],
    ['loopback', 'http://127.0.0.1/watch?v=dQw4w9WgXcQ', 'host'],
    ['loopback name', 'http://localhost:8080/', 'host'],
    ['metadata ip', 'http://169.254.169.254/latest/meta-data', 'host'],
    ['ipv6 loopback', 'http://[::1]/', 'host'],
    ['private ip', 'http://10.0.0.1/', 'host'],
    ['custom port', `https://www.youtube.com:8443/watch?v=${ID}`, 'host'],
    ['playlist page', 'https://www.youtube.com/playlist?list=PL1234567890', 'playlist'],
    ['playlist without video', 'https://www.youtube.com/watch?list=PL1234567890', 'playlist'],
    ['channel', 'https://www.youtube.com/@someone', 'no_video'],
    ['home', 'https://www.youtube.com/', 'no_video'],
    ['results page', 'https://www.youtube.com/results?search_query=x', 'no_video'],
    ['id too short', 'https://youtu.be/short', 'no_video'],
    ['id with bad chars', 'https://www.youtube.com/watch?v=abc%24%25%5E%26_', 'no_video'],
    ['id too long', `https://www.youtube.com/watch?v=${ID}AAAA`, 'no_video'],
    ['newline injection', `https://youtu.be/${ID}\n--exec=calc`, 'invalid'],
    ['space injection', `https://youtu.be/${ID} --exec calc`, 'invalid'],
    ['option-looking id', 'https://youtu.be/--exec=calc', 'no_video'],
    ['too long', `https://www.youtube.com/watch?v=${ID}&x=${'a'.repeat(400)}`, 'invalid'],
  ];
  for (const [name, input, reason] of bad) {
    it(`${name} -> ${reason}`, () => {
      const r = parseYoutubeUrl(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(reason);
    });
  }
});
