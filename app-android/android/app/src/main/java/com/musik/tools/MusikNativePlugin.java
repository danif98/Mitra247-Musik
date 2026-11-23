package com.musik.tools;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.os.Build;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.util.Log;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Native features of the Android app, called from the web app:
 *  - library of all music on the phone (MediaStore),
 *  - background playback: foreground service, media notification and lock screen controls,
 *  - YouTube search and MP3 download on the phone itself (yt-dlp + ffmpeg via youtubedl-android),
 *  - links shared to the app from the YouTube app.
 */
@CapacitorPlugin(
    name = "MusikNative",
    permissions = {
        @Permission(alias = "audio33", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "audioLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class MusikNativePlugin extends Plugin {

    private static final int SEARCH_RESULTS = 10;
    private static final int MAX_QUERY = 100;
    private static final int MAX_DURATION_SEC = 20 * 60;
    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{11}$");

    private static String sharedText = null;
    private static MusikNativePlugin current = null;

    private final ExecutorService worker = Executors.newFixedThreadPool(2);
    private final Object initLock = new Object();
    private boolean ytReady = false;
    private final Set<String> running = new HashSet<>();

    @Override
    public void load() {
        current = this;
        PlaybackService.setListener((action, positionMs) -> {
            JSObject data = new JSObject();
            data.put("action", action);
            if (positionMs >= 0) data.put("positionMs", positionMs);
            notifyListeners("mediaAction", data, true);
        });
    }

    @Override
    protected void handleOnDestroy() {
        PlaybackService.setListener(null);
        PlaybackService.stop(getContext());
        worker.shutdownNow();
        if (current == this) current = null;
    }

    // ------------------------------------------------------------------ shared links

    /** Remember a link shared to the app (YouTube "Share" -> Musik Tools). */
    static void rememberShared(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text != null && !text.isEmpty()) sharedText = text;
    }

    static void announceShared() {
        MusikNativePlugin p = current;
        if (p == null || sharedText == null) return;
        JSObject data = new JSObject();
        data.put("text", sharedText);
        p.notifyListeners("sharedText", data, true);
    }

    @PluginMethod
    public void getSharedText(PluginCall call) {
        JSObject r = new JSObject();
        r.put("text", sharedText == null ? "" : sharedText);
        sharedText = null;
        call.resolve(r);
    }

    // ------------------------------------------------------------------ permissions

    private String audioAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio33" : "audioLegacy";
    }

    @PluginMethod
    public void audioPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState(audioAlias()) == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void requestAudioPermission(PluginCall call) {
        if (getPermissionState(audioAlias()) == PermissionState.GRANTED) {
            audioPermission(call);
            return;
        }
        requestPermissionForAlias(audioAlias(), call, "audioPermissionResult");
    }

    @PermissionCallback
    private void audioPermissionResult(PluginCall call) {
        audioPermission(call);
    }

    /** Needed on Android 13+ to show the playback notification; playback works without it. */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(r);
    }

    // ------------------------------------------------------------------ music on the phone

    @PluginMethod
    public void listAudio(PluginCall call) {
        if (getPermissionState(audioAlias()) != PermissionState.GRANTED) {
            call.reject("Izin membaca musik belum diberikan.", "permission");
            return;
        }
        worker.execute(() -> {
            try {
                call.resolve(queryAudio(getContext()));
            } catch (Exception e) {
                call.reject("Gagal membaca daftar musik.", "failed");
            }
        });
    }

    private static JSObject queryAudio(Context context) throws Exception {
        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.YEAR,
            MediaStore.Audio.Media.MIME_TYPE,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.DATA
        };
        // RELATIVE_PATH / VOLUME_NAME exist from Android 10; older versions use the file path.
        if (Build.VERSION.SDK_INT >= 29) {
            String[] more = { MediaStore.MediaColumns.RELATIVE_PATH, MediaStore.MediaColumns.VOLUME_NAME };
            String[] all = new String[projection.length + more.length];
            System.arraycopy(projection, 0, all, 0, projection.length);
            System.arraycopy(more, 0, all, projection.length, more.length);
            projection = all;
        }
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0 AND " + MediaStore.Audio.Media.DURATION + " > 0";
        JSArray songs = new JSArray();
        try (
            Cursor c = context.getContentResolver().query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC"
            )
        ) {
            if (c != null) {
                while (c.moveToNext()) {
                    long id = c.getLong(0);
                    String artist = c.getString(2);
                    JSObject s = new JSObject();
                    s.put("id", String.valueOf(id));
                    s.put("uri", ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id).toString());
                    s.put("title", firstNonEmpty(c.getString(1), c.getString(8), "Tanpa judul"));
                    s.put("artist", artist == null || artist.equals("<unknown>") ? "" : artist);
                    String album = c.getString(3);
                    s.put("album", album == null || album.equals("<unknown>") ? "" : album);
                    s.put("durationMs", c.getLong(4));
                    s.put("size", c.getLong(5));
                    s.put("year", c.getInt(6));
                    s.put("mime", c.getString(7) == null ? "" : c.getString(7));
                    s.put("name", c.getString(8) == null ? "" : c.getString(8));
                    String[] place = placeOf(c, Build.VERSION.SDK_INT >= 29);
                    s.put("volume", place[0]);
                    s.put("folder", place[1]);
                    songs.put(s);
                }
            }
        }
        JSObject r = new JSObject();
        r.put("songs", songs);
        r.put("volumes", storageVolumes(context));
        return r;
    }

    /** {volume id, folder below the volume root} of the current cursor row. */
    private static String[] placeOf(Cursor c, boolean modern) {
        if (modern) {
            String volume = c.getString(10 + 1);
            String rel = c.getString(10);
            return new String[] { volume == null ? "external_primary" : volume, trimSlashes(rel) };
        }
        // Android 9 and older: split "/storage/<id>/<folder>/<file>" or "/storage/emulated/0/...".
        String data = c.getString(9);
        if (data == null) return new String[] { "external_primary", "" };
        String[] parts = data.split("/");
        String volume = "external_primary";
        int start = 0;
        if (parts.length > 3 && parts[1].equals("storage")) {
            if (parts[2].equals("emulated")) start = 4;
            else {
                volume = parts[2].toLowerCase();
                start = 3;
            }
        }
        StringBuilder folder = new StringBuilder();
        for (int i = start; i < parts.length - 1; i++) {
            if (parts[i].isEmpty()) continue;
            if (folder.length() > 0) folder.append('/');
            folder.append(parts[i]);
        }
        return new String[] { volume, folder.toString() };
    }

    private static String trimSlashes(String path) {
        if (path == null) return "";
        int a = 0;
        int b = path.length();
        while (a < b && path.charAt(a) == '/') a++;
        while (b > a && path.charAt(b - 1) == '/') b--;
        return path.substring(a, b);
    }

    /** Storages (internal, SD card, USB) with a readable name; ids match MediaStore volume names. */
    private static JSArray storageVolumes(Context context) {
        JSArray out = new JSArray();
        try {
            StorageManager sm = (StorageManager) context.getSystemService(Context.STORAGE_SERVICE);
            List<StorageVolume> list = sm.getStorageVolumes();
            for (StorageVolume v : list) {
                String id;
                if (v.isPrimary()) id = "external_primary";
                else if (Build.VERSION.SDK_INT >= 30 && v.getMediaStoreVolumeName() != null) id = v.getMediaStoreVolumeName();
                else if (v.getUuid() != null) id = v.getUuid().toLowerCase();
                else continue;
                JSObject o = new JSObject();
                o.put("id", id);
                o.put("label", v.isPrimary() ? "Penyimpanan internal" : v.getDescription(context));
                o.put("removable", v.isRemovable());
                out.put(o);
            }
        } catch (Exception ignored) {
            // names are optional: the app falls back to the volume id
        }
        return out;
    }

    private static String firstNonEmpty(String... values) {
        for (String v : values) if (v != null && !v.trim().isEmpty()) return v.trim();
        return "";
    }

    // ------------------------------------------------------------------ background playback

    @PluginMethod
    public void setNowPlaying(PluginCall call) {
        PlaybackService.State s = new PlaybackService.State();
        s.title = call.getString("title", "");
        s.artist = call.getString("artist", "");
        s.durationMs = call.getLong("durationMs", 0L);
        s.positionMs = call.getLong("positionMs", 0L);
        s.playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        Float speed = call.getFloat("speed", 1f);
        s.speed = speed == null || speed <= 0f ? 1f : speed;
        s.hasPrev = Boolean.TRUE.equals(call.getBoolean("hasPrev", false));
        s.hasNext = Boolean.TRUE.equals(call.getBoolean("hasNext", false));
        PlaybackService.update(getContext(), s);
        call.resolve();
    }

    @PluginMethod
    public void clearNowPlaying(PluginCall call) {
        PlaybackService.stop(getContext());
        call.resolve();
    }

    // ------------------------------------------------------------------ yt-dlp on the phone

    private void ensureYoutubeDl() throws Exception {
        synchronized (initLock) {
            if (ytReady) return;
            YoutubeDL.getInstance().init(getContext().getApplicationContext());
            FFmpeg.getInstance().init(getContext().getApplicationContext());
            ytReady = true;
        }
    }

    @PluginMethod
    public void ytVersion(PluginCall call) {
        worker.execute(() -> {
            try {
                ensureYoutubeDl();
                JSObject r = new JSObject();
                r.put("version", String.valueOf(YoutubeDL.getInstance().version(getContext())));
                call.resolve(r);
            } catch (Exception e) {
                call.reject("yt-dlp belum siap.", "unavailable");
            }
        });
    }

    /** Download the newest yt-dlp (YouTube changes often; old versions stop working). */
    @PluginMethod
    public void ytUpdate(PluginCall call) {
        worker.execute(() -> {
            try {
                ensureYoutubeDl();
                YoutubeDL.UpdateStatus status = YoutubeDL.getInstance().updateYoutubeDL(
                    getContext().getApplicationContext(),
                    YoutubeDL.UpdateChannel._STABLE
                );
                JSObject r = new JSObject();
                r.put("status", String.valueOf(status));
                r.put("version", String.valueOf(YoutubeDL.getInstance().version(getContext())));
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Gagal memperbarui yt-dlp. Periksa koneksi internet.", "network");
            }
        });
    }

    @PluginMethod
    public void ytSearch(PluginCall call) {
        String query = cleanQuery(call.getString("query"));
        if (query == null) {
            call.reject("Kata kunci kosong.", "invalid_query");
            return;
        }
        worker.execute(() -> {
            try {
                ensureYoutubeDl();
                YoutubeDLRequest req = new YoutubeDLRequest("ytsearch" + SEARCH_RESULTS + ":" + query);
                req.addOption("--flat-playlist");
                req.addOption("--dump-json");
                req.addOption("--no-warnings");
                req.addOption("--ignore-config");
                YoutubeDLResponse resp = YoutubeDL.getInstance().execute(req, "search-" + System.nanoTime(), null);
                JSObject r = new JSObject();
                r.put("results", parseSearch(resp.getOut()));
                call.resolve(r);
            } catch (Exception e) {
                logFailure("ytSearch", String.valueOf(e.getMessage()));
                call.reject("Pencarian gagal.", classify(String.valueOf(e.getMessage())));
            }
        });
    }

    static String cleanQuery(String input) {
        if (input == null) return null;
        String q = input.replaceAll("[\\u0000-\\u001f\\u007f]+", " ").replaceAll("\\s+", " ").trim();
        if (q.isEmpty()) return null;
        return q.length() > MAX_QUERY ? q.substring(0, MAX_QUERY) : q;
    }

    /** Same filtering as the server: valid id, known length, not live, within the length limit. */
    static JSArray parseSearch(String output) {
        JSArray results = new JSArray();
        Set<String> seen = new HashSet<>();
        for (String line : output.split("\\r?\\n")) {
            if (!line.startsWith("{")) continue;
            try {
                JSONObject e = new JSONObject(line);
                String id = e.optString("id", "");
                String title = e.optString("title", "").trim();
                double duration = e.isNull("duration") ? 0 : e.optDouble("duration", 0);
                if (!VIDEO_ID.matcher(id).matches() || title.isEmpty()) continue;
                if (duration <= 0 || duration > MAX_DURATION_SEC || !seen.add(id)) continue;
                String channel = e.optString("channel", e.optString("uploader", ""));
                JSObject item = new JSObject();
                item.put("videoId", id);
                item.put("title", title.length() > 200 ? title.substring(0, 200) : title);
                item.put("channel", channel.isEmpty() || channel.equals("null") ? JSONObject.NULL : channel);
                item.put("duration", Math.round(duration));
                item.put("thumbnail", "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg");
                results.put(item);
            } catch (Exception ignored) {
                // not a JSON line: skip
            }
        }
        return results;
    }

    @PluginMethod
    public void ytDownload(PluginCall call) {
        String videoId = call.getString("videoId", "");
        if (!VIDEO_ID.matcher(videoId).matches()) {
            call.reject("ID video tidak valid.", "invalid_url");
            return;
        }
        synchronized (running) {
            if (!running.add(videoId)) {
                call.reject("Video ini sedang diproses.", "busy");
                return;
            }
        }
        worker.execute(() -> {
            try {
                ensureYoutubeDl();
                File dir = new File(getContext().getCacheDir(), "ytdl/" + videoId);
                deleteRecursively(dir);
                if (!dir.mkdirs()) throw new IllegalStateException("cache");

                YoutubeDLRequest req = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + videoId);
                req.addOption("--ignore-config");
                req.addOption("--no-playlist");
                req.addOption("--no-warnings");
                req.addOption("--newline");
                req.addOption("--restrict-filenames");
                req.addOption("--no-mtime");
                req.addOption("-f", "ba");
                req.addOption("-x");
                req.addOption("--audio-format", "mp3");
                req.addOption("--audio-quality", "2");
                req.addOption("--match-filters", "duration<=" + MAX_DURATION_SEC);
                req.addOption("--max-filesize", "100M");
                req.addOption("--write-info-json");
                req.addOption("-o", new File(dir, "%(id)s.%(ext)s").getAbsolutePath());

                final boolean[] converting = { false };
                YoutubeDL.getInstance().execute(req, videoId, (progress, eta, line) -> {
                    JSObject p = new JSObject();
                    p.put("videoId", videoId);
                    p.put("percent", Math.max(0, Math.min(100, Math.round(progress))));
                    // Once conversion started it never goes back to "download" (later yt-dlp lines
                    // such as "Deleting original file" would otherwise flip the stage).
                    if (line != null && line.contains("[ExtractAudio]")) converting[0] = true;
                    p.put("stage", converting[0] ? "convert" : "download");
                    notifyListeners("ytProgress", p);
                    return kotlin.Unit.INSTANCE;
                });

                File mp3 = new File(dir, videoId + ".mp3");
                if (!mp3.isFile() || mp3.length() == 0) {
                    // yt-dlp exits 0 without a file when --match-filters rejects the video.
                    call.reject("Video terlalu panjang (batas 20 menit).", "too_long");
                    return;
                }
                String title = videoId;
                long duration = 0;
                File info = new File(dir, videoId + ".info.json");
                if (info.isFile()) {
                    try {
                        JSONObject j = new JSONObject(new String(Files.readAllBytes(info.toPath()), StandardCharsets.UTF_8));
                        title = firstNonEmpty(j.optString("title", ""), videoId);
                        duration = Math.round(j.optDouble("duration", 0));
                    } catch (Exception ignored) {
                        // keep the id as title
                    }
                }
                JSObject r = new JSObject();
                r.put("videoId", videoId);
                r.put("path", mp3.getAbsolutePath());
                r.put("title", title);
                r.put("duration", duration);
                r.put("size", mp3.length());
                call.resolve(r);
            } catch (Exception e) {
                String detail = String.valueOf(e.getMessage());
                logFailure("ytDownload", detail);
                call.reject("Unduhan gagal.", classify(detail));
            } finally {
                synchronized (running) {
                    running.remove(videoId);
                }
            }
        });
    }

    @PluginMethod
    public void ytCancel(PluginCall call) {
        String videoId = call.getString("videoId", "");
        try {
            YoutubeDL.getInstance().destroyProcessById(videoId);
        } catch (Exception ignored) {
            // nothing running
        }
        call.resolve();
    }

    /** Delete the temporary MP3 once the web app has stored it in its own library. */
    @PluginMethod
    public void ytCleanup(PluginCall call) {
        String videoId = call.getString("videoId", "");
        if (VIDEO_ID.matcher(videoId).matches()) {
            deleteRecursively(new File(getContext().getCacheDir(), "ytdl/" + videoId));
        }
        call.resolve();
    }

    /** Error code (same names as the server jobs) from yt-dlp's message; never the message itself. */
    static String classify(String detail) {
        String d = detail.toLowerCase();
        if (d.contains("sign in to confirm") || d.contains("not a bot") || d.contains("http error 429")) return "blocked";
        if (d.contains("private video") || d.contains("unavailable") || d.contains("members-only") || d.contains("age")) return "unavailable";
        if (d.contains("unable to resolve host") || d.contains("network is unreachable") || d.contains("timed out")) return "network";
        return "failed";
    }

    /** Last lines of yt-dlp's message for adb logcat; URLs and paths are removed. */
    private static void logFailure(String what, String detail) {
        String[] lines = detail.split("\r?\n");
        StringBuilder sb = new StringBuilder();
        for (int i = Math.max(0, lines.length - 6); i < lines.length; i++) {
            sb.append(lines[i].replaceAll("https?://\\S+", "<url>").replaceAll("/data/\\S+", "<path>")).append(" | ");
        }
        Log.w("MusikNative", what + " failed: " + sb);
    }

    private static void deleteRecursively(File f) {
        if (!f.exists()) return;
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteRecursively(c);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
