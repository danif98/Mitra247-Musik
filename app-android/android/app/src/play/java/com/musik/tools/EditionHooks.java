package com.musik.tools;

import android.content.Intent;
import com.getcapacitor.Plugin;
import java.util.Collections;
import java.util.List;

/** Hooks that differ per edition. This is the Google Play edition: no extra features. */
final class EditionHooks {

    private EditionHooks() {}

    static List<Class<? extends Plugin>> extraPlugins() {
        return Collections.emptyList();
    }

    static void onCreateIntent(Intent intent) {}

    static void onNewIntent(Intent intent) {}
}
