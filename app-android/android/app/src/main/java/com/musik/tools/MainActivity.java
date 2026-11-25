package com.musik.tools;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins written in this app must be registered before super.onCreate().
        registerPlugin(MusikNativePlugin.class);
        for (Class<? extends Plugin> plugin : EditionHooks.extraPlugins()) registerPlugin(plugin);
        super.onCreate(savedInstanceState);
        EditionHooks.onCreateIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        EditionHooks.onNewIntent(intent);
    }
}
