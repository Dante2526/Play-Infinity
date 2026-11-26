package com.playinfinity.app;

import android.os.Bundle;
import android.os.Build;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.drawable.Icon;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;
import android.content.res.Configuration;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.lifecycle.Lifecycle;
import android.content.pm.PackageManager;
import android.Manifest;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    public static boolean isVideoPlaying = false;
    public static final String ACTION_PIP_CONTROL = "com.playinfinity.app.PIP_CONTROL";
    public static final String EXTRA_CONTROL_TYPE = "control_type";
    public static final int CONTROL_TYPE_PLAY = 1;
    public static final int CONTROL_TYPE_PAUSE = 2;
    private static final int REQUEST_CODE_PLAY = 1001;
    private static final int REQUEST_CODE_PAUSE = 1002;
    private static final int RECORD_AUDIO_REQUEST_CODE = 101;
    private boolean pipReceiverRegistered = false;

    private final BroadcastReceiver pipControlReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !ACTION_PIP_CONTROL.equals(intent.getAction())) {
                return;
            }
            int controlType = intent.getIntExtra(EXTRA_CONTROL_TYPE, 0);
            if (controlType == CONTROL_TYPE_PAUSE) {
                isVideoPlaying = false;
                refreshPictureInPictureParams();
                try {
                    if (bridge != null) {
                        bridge.triggerWindowJSEvent("pipControlAction", "{ \"action\": \"pause\" }");
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            } else if (controlType == CONTROL_TYPE_PLAY) {
                isVideoPlaying = true;
                refreshPictureInPictureParams();
                try {
                    if (bridge != null) {
                        bridge.triggerWindowJSEvent("pipControlAction", "{ \"action\": \"play\" }");
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Assegura tema limpo sem ActionBar nativa duplicada
        setTheme(R.style.AppTheme_NoActionBar);

        // Habilita Edge-to-Edge nativo para todas as versões do Android suportadas
        EdgeToEdge.enable(this);

        registerPlugin(RokuDiscoveryPlugin.class);
        registerPlugin(PiPPlugin.class);
        registerPlugin(StatusBarPlugin.class);
        registerPlugin(OpenNotificationSettingsPlugin.class);
        super.onCreate(savedInstanceState);

        // Oculta programaticamente qualquer ActionBar nativa que possa ser inflada
        try {
            if (getSupportActionBar() != null) {
                getSupportActionBar().hide();
            }
            if (getActionBar() != null) {
                getActionBar().hide();
            }
        } catch (Exception ignored) {}

        // Ajusta insets no container de conteúdo para evitar sobreposição da UI
        // em modo normal, zerando insets durante PiP e reprodução em tela cheia
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (view, windowInsets) -> {
            if (isInPictureInPictureMode() || StatusBarPlugin.isBarsHidden()) {
                view.setPadding(0, 0, 0, 0);
            } else {
                androidx.core.graphics.Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                int top = StatusBarPlugin.getCustomPaddingTop() != null ? StatusBarPlugin.getCustomPaddingTop() : insets.top;
                int bottom = StatusBarPlugin.getCustomPaddingBottom() != null ? StatusBarPlugin.getCustomPaddingBottom() : insets.bottom;
                int left = StatusBarPlugin.getCustomPaddingLeft() != null ? StatusBarPlugin.getCustomPaddingLeft() : insets.left;
                int right = StatusBarPlugin.getCustomPaddingRight() != null ? StatusBarPlugin.getCustomPaddingRight() : insets.right;
                view.setPadding(left, top, right, bottom);
            }
            return WindowInsetsCompat.CONSUMED;
        });

        // Garante permissão de gravação de áudio para busca por voz no app
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO_REQUEST_CODE);
        }

        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebView webView = this.bridge.getWebView();

                // Cloudflare Turnstile (tela de login) exige cookies de terceiros:
                // o iframe challenges.cloudflare.com não conclui o desafio sem eles
                // e o widget fica travado em "Verificando..." para sempre. O WebView
                // do Android bloqueia cookies de terceiros por padrão — habilita aqui.
                CookieManager cookieManager = CookieManager.getInstance();
                cookieManager.setAcceptCookie(true);
                cookieManager.setAcceptThirdPartyCookies(webView, true);

                // Anti-Cache: assegura que o index.html da VPS seja sempre revalidado
                android.webkit.WebSettings webSettings = webView.getSettings();
                webSettings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);

                // Anexa a assinatura da versão nativa ao User-Agent
                try {
                    String baseUa = webSettings.getUserAgentString();
                    android.content.pm.PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                    long vc = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pInfo.getLongVersionCode() : pInfo.versionCode;
                    webSettings.setUserAgentString(baseUa + " PlayInfinityApp/" + pInfo.versionName + " (vc:" + vc + ")");
                } catch (Exception ignored) {}

                webView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        runOnUiThread(() -> {
                            request.grant(request.getResources());
                        });
                    }
                });

                // Captura downloads no WebView (ex: APK de atualização) e delega para o navegador do Android
                webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                    try {
                        android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                        i.setData(android.net.Uri.parse(url));
                        startActivity(i);
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        try {
            ContextCompat.registerReceiver(
                    this,
                    pipControlReceiver,
                    new IntentFilter(ACTION_PIP_CONTROL),
                    ContextCompat.RECEIVER_NOT_EXPORTED
            );
            pipReceiverRegistered = true;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onDestroy() {
        if (pipReceiverRegistered) {
            try {
                unregisterReceiver(pipControlReceiver);
            } catch (Exception ignored) {}
            pipReceiverRegistered = false;
        }
        super.onDestroy();
    }

    public PictureInPictureParams buildPictureInPictureParams() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return null;
        }

        int controlType = isVideoPlaying ? CONTROL_TYPE_PAUSE : CONTROL_TYPE_PLAY;
        int requestCode = isVideoPlaying ? REQUEST_CODE_PAUSE : REQUEST_CODE_PLAY;
        int iconRes = isVideoPlaying ? R.drawable.ic_pip_pause : R.drawable.ic_pip_play;
        String title = isVideoPlaying ? "Pausar" : "Reproduzir";

        Intent intent = new Intent(ACTION_PIP_CONTROL).setPackage(getPackageName());
        intent.putExtra(EXTRA_CONTROL_TYPE, controlType);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(this, requestCode, intent, flags);
        Icon icon = Icon.createWithResource(this, iconRes);
        RemoteAction playPauseAction = new RemoteAction(icon, title, title, pendingIntent);

        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9))
                .setActions(Collections.singletonList(playPauseAction));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(isVideoPlaying);
            builder.setSeamlessResizeEnabled(true);
        }

        return builder.build();
    }

    public void refreshPictureInPictureParams() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams params = buildPictureInPictureParams();
                if (params != null) {
                    setPictureInPictureParams(params);
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (isVideoPlaying && !isInPictureInPictureMode()) {
                try {
                    PictureInPictureParams params = buildPictureInPictureParams();
                    if (params != null) {
                        enterPictureInPictureMode(params);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        boolean dismissed = !isInPictureInPictureMode &&
                !getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED);

        if (isInPictureInPictureMode) {
            refreshPictureInPictureParams();
        } else if (dismissed) {
            isVideoPlaying = false;
            refreshPictureInPictureParams();
        }

        try {
            if (this.bridge != null) {
                String data = "{ \"isPiP\": " + isInPictureInPictureMode + ", \"dismissed\": " + dismissed + " }";
                this.bridge.triggerWindowJSEvent("pipModeChanged", data);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
