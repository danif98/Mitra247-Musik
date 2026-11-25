package com.musik.tools;

import android.content.Intent;
import com.getcapacitor.Plugin;
import java.util.Collections;
import java.util.List;

/** Hooks that differ per edition. This is the personal edition: it has extra features. */
final class EditionHooks {

    private EditionHooks() {}

    static List<Class<? extends Plugin>> extraPlugins() {
        return Collections.singletonList(MusikPersonalPlugin.class);
    }

    static void onCreateIntent(Intent intent) {
        MusikPersonalPlugin.rememberShared(intent);
    }

    static void onNewIntent(Intent intent) {
        MusikPersonalPlugin.rememberShared(intent);
        MusikPersonalPlugin.announceShared();
    }
}
