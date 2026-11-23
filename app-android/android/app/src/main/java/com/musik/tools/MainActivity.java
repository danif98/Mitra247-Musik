package com.musik.tools;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins written in this app must be registered before super.onCreate().
        registerPlugin(MusikNativePlugin.class);
        super.onCreate(savedInstanceState);
        MusikNativePlugin.rememberShared(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        MusikNativePlugin.rememberShared(intent);
        MusikNativePlugin.announceShared();
    }
}
