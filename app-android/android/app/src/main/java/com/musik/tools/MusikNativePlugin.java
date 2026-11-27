package com.musik.tools;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.util.Base64;
import android.util.Log;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native features of the Android app (all editions), called from the web app:
 *  - library of all music on the phone (MediaStore),
 *  - background playback: foreground service, media notification and lock screen controls.
 * Extra features of the personal edition live in src/personal (MusikPersonalPlugin).
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

    private final ExecutorService worker = Executors.newFixedThreadPool(2);

    @Override
    public void load() {
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
    }

    // ------------------------------------------------------------------ about

    /** {versionName, versionCode, buildTime (ms since epoch), packageName} of this APK. */
    @PluginMethod
    public void appInfo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("versionName", BuildConfig.VERSION_NAME);
        r.put("versionCode", BuildConfig.VERSION_CODE);
        r.put("buildTime", BuildConfig.BUILD_TIME);
        r.put("packageName", getContext().getPackageName());
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
        // MediaStore keeps rows of files that were deleted or moved (until the next scan): drop them.
        List<JSObject> found = new ArrayList<>();
        List<Boolean> missing = new ArrayList<>();
        List<String> stalePaths = new ArrayList<>();
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
                    String data = c.getString(9);
                    boolean gone = data != null && !data.isEmpty() && !new File(data).exists();
                    found.add(s);
                    missing.add(gone);
                    if (gone) stalePaths.add(data);
                }
            }
        }
        JSArray songs = new JSArray();
        int gone = stalePaths.size();
        // If every row looks missing, file paths are probably not readable here: show them all.
        boolean trust = gone < found.size();
        for (int i = 0; i < found.size(); i++) {
            if (!trust || !missing.get(i)) songs.put(found.get(i));
        }
        if (trust && gone > 0) {
            // Ask Android to refresh its index for those paths so they disappear for good.
            try {
                MediaScannerConnection.scanFile(context, stalePaths.toArray(new String[0]), null, null);
            } catch (Exception ignored) {
                // best effort
            }
        }
        JSObject r = new JSObject();
        r.put("songs", songs);
        r.put("hidden", trust ? gone : 0);
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
        try {
            PlaybackService.update(getContext(), s);
        } catch (RuntimeException e) {
            // The notification is optional; never let it take the app down.
            Log.w("MusikNative", "setNowPlaying failed: " + e.getClass().getSimpleName());
        }
        call.resolve();
    }

    @PluginMethod
    public void clearNowPlaying(PluginCall call) {
        PlaybackService.stop(getContext());
        call.resolve();
    }

    // ------------------------------------------------------------------ save as

    /**
     * "Save as" dialog of Android (Storage Access Framework): the user picks the folder and may
     * change the proposed name. Needs no storage permission. Resolves {uri}, or rejects with code
     * "cancelled".
     */
    @PluginMethod
    public void createDocument(PluginCall call) {
        String name = call.getString("name", "audio.mp3");
        String mime = call.getString("mime", "audio/mpeg");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "createDocumentResult");
    }

    @ActivityCallback
    private void createDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("Penyimpanan dibatalkan.", "cancelled");
            return;
        }
        JSObject out = new JSObject();
        out.put("uri", data.getData().toString());
        call.resolve(out);
    }

    /** Write one base64 chunk to a document from createDocument (append = false starts the file over). */
    @PluginMethod
    public void writeDocument(PluginCall call) {
        final String uriString = call.getString("uri");
        final String data = call.getString("data", "");
        final boolean append = Boolean.TRUE.equals(call.getBoolean("append", false));
        if (uriString == null) {
            call.reject("Berkas tujuan tidak ada.", "failed");
            return;
        }
        worker.execute(() -> {
            try (OutputStream out = getContext()
                .getContentResolver()
                .openOutputStream(Uri.parse(uriString), append ? "wa" : "wt")) {
                if (out == null) {
                    call.reject("Berkas tujuan tidak bisa dibuka.", "failed");
                    return;
                }
                out.write(Base64.decode(data, Base64.DEFAULT));
                call.resolve();
            } catch (Exception e) {
                Log.w("MusikNative", "writeDocument failed: " + e.getClass().getSimpleName());
                call.reject("Berkas tidak bisa ditulis.", "failed");
            }
        });
    }

}
