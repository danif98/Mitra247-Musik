/**
 * Wires the player to the Android wrapper: media notification / lock screen controls while music
 * plays in the background. Does nothing in a plain browser.
 * Must be called while a component is initialising (it uses $effect).
 */
import { untrack } from 'svelte';
import { native } from './native';
import type { Player } from './player.svelte';

export function bindNative(player: Player): void {
  const plugin = native;
  if (!plugin) return;
  let askedNotifications = false;

  // Mirror the player state into the notification. The position is read untracked: the service
  // extrapolates it from the playback speed, so it is not re-sent on every time update.
  $effect(() => {
    const song = player.current;
    if (!song) {
      void plugin.clearNowPlaying().catch(() => undefined);
      return;
    }
    const playing = player.playing;
    const state = {
      title: song.title,
      artist: song.artist ?? song.credit?.creator ?? '',
      durationMs: Math.round((player.duration || song.duration || 0) * 1000),
      positionMs: Math.round(untrack(() => player.position) * 1000),
      playing,
      speed: player.tempo,
      hasPrev: player.hasPrev,
      hasNext: player.hasNext,
    };
    if (playing && !askedNotifications) {
      askedNotifications = true;
      void plugin.requestNotificationPermission().catch(() => undefined);
    }
    void plugin.setNowPlaying(state).catch(() => undefined);
  });

  $effect(() => {
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    handles.push(
      plugin.addListener('mediaAction', (e) => {
        switch (e.action) {
          case 'play':
            void player.play();
            break;
          case 'pause':
            player.pause();
            break;
          case 'next':
            void player.next();
            break;
          case 'prev':
            void player.prev();
            break;
          case 'seek':
            if (typeof e.positionMs === 'number') player.seek(e.positionMs / 1000);
            break;
          case 'stop':
            player.pause();
            void plugin.clearNowPlaying().catch(() => undefined);
            break;
        }
      }),
    );
    return () => {
      for (const h of handles) void h.then((x) => x.remove()).catch(() => undefined);
    };
  });
}
