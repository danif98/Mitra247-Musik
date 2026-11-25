package com.musik.tools;

import android.accounts.Account;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.Scopes;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import java.util.Arrays;
import java.util.List;

/**
 * Sign in with Google and an access token for the hidden app folder of the user's Google Drive
 * (scope drive.appdata). Used for the backup of presets and settings; nothing is sent to a server
 * of ours. The Drive requests themselves are made by the web app.
 *
 * Needs an OAuth client of type "Android" (package name + SHA-1 of the signing key) in Google Cloud;
 * see docs/GOOGLE_SSO.md. Shared by all editions.
 */
@CapacitorPlugin(name = "MusikAuth", requestCodes = { MusikAuthPlugin.REQ_AUTHORIZE })
public class MusikAuthPlugin extends Plugin {

    static final int REQ_AUTHORIZE = 7101;
    private static final String TAG = "MusikAuth";

    private static final List<Scope> SCOPES = Arrays.asList(
        new Scope("https://www.googleapis.com/auth/drive.appdata"),
        new Scope(Scopes.EMAIL),
        new Scope(Scopes.PROFILE)
    );

    /** Call waiting for the consent screen. */
    private PluginCall pending = null;

    /** Sign in (account chooser and consent when needed). Resolves with {email, name, photoUrl, accessToken}. */
    @PluginMethod
    public void signIn(PluginCall call) {
        authorize(call, call.getString("account", ""), true);
    }

    /** A fresh access token without any screen. Rejects with "needs_signin" when consent is needed. */
    @PluginMethod
    public void getAccessToken(PluginCall call) {
        authorize(call, call.getString("account", ""), false);
    }

    private void authorize(PluginCall call, String account, boolean allowScreen) {
        if (getActivity() == null) {
            call.reject("Aplikasi belum siap.", "failed");
            return;
        }
        AuthorizationRequest.Builder request = AuthorizationRequest.builder().setRequestedScopes(SCOPES);
        if (account != null && !account.isEmpty()) request.setAccount(new Account(account, "com.google"));
        Identity.getAuthorizationClient(getActivity())
            .authorize(request.build())
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolve(call, result);
                    return;
                }
                if (!allowScreen) {
                    call.reject("Perlu masuk lagi.", "needs_signin");
                    return;
                }
                PendingIntent intent = result.getPendingIntent();
                if (intent == null) {
                    call.reject("Gagal masuk.", "failed");
                    return;
                }
                try {
                    pending = call;
                    getActivity().startIntentSenderForResult(intent.getIntentSender(), REQ_AUTHORIZE, null, 0, 0, 0);
                } catch (Exception e) {
                    pending = null;
                    Log.w(TAG, "consent screen failed: " + e.getClass().getSimpleName());
                    call.reject("Gagal membuka layar masuk.", "failed");
                }
            })
            .addOnFailureListener(e -> fail(call, e));
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_AUTHORIZE) return;
        PluginCall call = pending;
        pending = null;
        if (call == null) return;
        if (resultCode != android.app.Activity.RESULT_OK || data == null) {
            call.reject("Masuk dibatalkan.", "cancelled");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data);
            resolve(call, result);
        } catch (ApiException e) {
            fail(call, e);
        }
    }

    private void resolve(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("Tidak ada izin akses.", "failed");
            return;
        }
        JSObject r = new JSObject();
        r.put("accessToken", token);
        GoogleSignInAccount account = result.toGoogleSignInAccount();
        r.put("email", account != null && account.getEmail() != null ? account.getEmail() : "");
        r.put("name", account != null && account.getDisplayName() != null ? account.getDisplayName() : "");
        Uri photo = account != null ? account.getPhotoUrl() : null;
        r.put("photoUrl", photo != null ? photo.toString() : "");
        call.resolve(r);
    }

    /** Short error code for the web app; the message itself is not passed on (it can hold account data). */
    private static void fail(PluginCall call, Exception e) {
        String code = "failed";
        if (e instanceof ApiException) {
            int status = ((ApiException) e).getStatusCode();
            Log.w(TAG, "authorize failed: status " + status);
            if (status == 16 || status == 12501 || status == 12502) code = "cancelled";
            else if (status == 10) code = "config"; // DEVELOPER_ERROR: OAuth client or SHA-1 not set up
            else if (status == 7) code = "network";
            else if (status == 17 || status == 2 || status == 1) code = "unavailable"; // no Play services
        } else {
            Log.w(TAG, "authorize failed: " + e.getClass().getSimpleName());
        }
        call.reject("Gagal masuk.", code);
    }
}
