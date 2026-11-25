/** Server settings (URL + token), stored only on this device. */
import { ApiClient, normalizeBaseUrl } from '@musik/core';

const URL_KEY = 'musik.server.url';
const TOKEN_KEY = 'musik.server.token';

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** "abcd…wxyz" so the token is never shown in full. */
export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export class ServerSettings {
  url = $state(read(URL_KEY));
  token = $state(read(TOKEN_KEY));

  get configured(): boolean {
    return this.url !== '' && this.token !== '';
  }

  /** Returns false when the URL is not a valid http(s) address. */
  save(url: string, token: string): boolean {
    const normalized = url.trim() === '' ? '' : normalizeBaseUrl(url);
    if (normalized === null) return false;
    this.url = normalized;
    if (token.trim() !== '') this.token = token.trim();
    write(URL_KEY, this.url);
    write(TOKEN_KEY, this.token);
    return true;
  }

  clearToken(): void {
    this.token = '';
    write(TOKEN_KEY, '');
  }

  client(): ApiClient {
    return new ApiClient({ baseUrl: this.url, token: this.token });
  }
}
