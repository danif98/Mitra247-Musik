package com.musik.tools;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Foreground service that keeps the app process (and the WebView that plays the audio) alive while
 * music is playing with the screen off, and shows the media notification / lock screen controls.
 * The audio itself is produced by the web app; this service only mirrors its state.
 */
public class PlaybackService extends Service {

    /** What the web app reports about the current song. */
    public static final class State {
        public String title = "";
        public String artist = "";
        public long durationMs = 0;
        public long positionMs = 0;
        public boolean playing = false;
        public float speed = 1f;
        public boolean hasPrev = false;
        public boolean hasNext = false;
    }

    /** Receives button presses from the notification, lock screen and headset. */
    public interface ActionListener {
        void onAction(String action, long positionMs);
    }

    private static final String CHANNEL_ID = "playback";
    private static final int NOTIFICATION_ID = 4101;
    private static final String ACTION_CMD = "com.musik.tools.CMD";
    private static final String EXTRA_CMD = "cmd";
    private static final long WAKE_LOCK_MAX_MS = 6L * 60 * 60 * 1000;

    private static PlaybackService instance;
    private static ActionListener listener;

    private MediaSessionCompat session;
    private PowerManager.WakeLock wakeLock;
    private State state = new State();
    private boolean foreground = false;

    public static void setListener(ActionListener l) {
        listener = l;
    }

    /** Update the notification; starts the service the first time something plays. */
    public static void update(Context context, State s) {
        PlaybackService running = instance;
        if (running != null) {
            running.apply(s);
            return;
        }
        if (!s.playing) return;
        Intent intent = new Intent(context, PlaybackService.class);
        PENDING = s;
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (RuntimeException e) {
            // Android refuses to start a foreground service from the background: nothing to do.
            PENDING = null;
        }
    }

    public static void stop(Context context) {
        PENDING = null;
        PlaybackService running = instance;
        if (running != null) running.shutdown();
    }

    private static State PENDING = null;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        session = new MediaSessionCompat(this, "Musik");
        session.setCallback(
            new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    emit("play", -1);
                }

                @Override
                public void onPause() {
                    emit("pause", -1);
                }

                @Override
                public void onSkipToNext() {
                    emit("next", -1);
                }

                @Override
                public void onSkipToPrevious() {
                    emit("prev", -1);
                }

                @Override
                public void onStop() {
                    emit("stop", -1);
                }

                @Override
                public void onSeekTo(long pos) {
                    emit("seek", pos);
                }
            }
        );
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_CMD.equals(intent.getAction())) {
            emit(intent.getStringExtra(EXTRA_CMD), -1);
            return START_NOT_STICKY;
        }
        State s = PENDING;
        PENDING = null;
        if (s != null) apply(s);
        else if (!foreground) shutdown();
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        instance = null;
        releaseWakeLock();
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        super.onDestroy();
    }

    /** Swiping the app away from recents stops playback and the service. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        emit("stop", -1);
        shutdown();
        super.onTaskRemoved(rootIntent);
    }

    private void emit(String action, long positionMs) {
        ActionListener l = listener;
        if (l != null && action != null) l.onAction(action, positionMs);
    }

    private void apply(State s) {
        state = s;
        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, s.title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, s.artist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, s.durationMs);
        session.setMetadata(meta.build());

        long actions =
            PlaybackStateCompat.ACTION_PLAY |
            PlaybackStateCompat.ACTION_PAUSE |
            PlaybackStateCompat.ACTION_PLAY_PAUSE |
            PlaybackStateCompat.ACTION_SEEK_TO |
            PlaybackStateCompat.ACTION_STOP;
        if (s.hasNext) actions |= PlaybackStateCompat.ACTION_SKIP_TO_NEXT;
        if (s.hasPrev) actions |= PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
        session.setPlaybackState(
            new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(
                    s.playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                    s.positionMs,
                    s.playing ? s.speed : 0f
                )
                .build()
        );

        Notification n = buildNotification(s);
        if (!foreground) {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            foreground = true;
        } else {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(NOTIFICATION_ID, n);
        }
        if (s.playing) acquireWakeLock();
        else {
            releaseWakeLock();
            // Paused: the notification may be swiped away, but the service stays so Play still works.
            stopForeground(false);
            foreground = false;
        }
    }

    private Notification buildNotification(State s) {
        Intent open = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(s.title.isEmpty() ? "Musik Tools" : s.title)
            .setContentText(s.artist)
            .setContentIntent(content)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(s.playing);
        int compact = 0;
        int index = 0;
        if (s.hasPrev) {
            b.addAction(android.R.drawable.ic_media_previous, "Sebelumnya", command("prev", 1));
            index++;
        }
        b.addAction(
            s.playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            s.playing ? "Jeda" : "Putar",
            command(s.playing ? "pause" : "play", 2)
        );
        compact = index;
        if (s.hasNext) b.addAction(android.R.drawable.ic_media_next, "Berikutnya", command("next", 3));
        b.setStyle(
            new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(compact)
        );
        return b.build();
    }

    private PendingIntent command(String cmd, int code) {
        Intent i = new Intent(this, PlaybackService.class).setAction(ACTION_CMD).putExtra(EXTRA_CMD, cmd);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Pemutaran", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Kontrol pemutaran musik");
        ch.setShowBadge(false);
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "musik:playback");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) wakeLock.acquire(WAKE_LOCK_MAX_MS);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    private void shutdown() {
        releaseWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        foreground = false;
        stopSelf();
    }
}
