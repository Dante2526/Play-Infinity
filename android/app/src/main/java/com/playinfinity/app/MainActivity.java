package com.playinfinity.app;

import android.os.Bundle;
import android.os.Build;
import android.app.PictureInPictureParams;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;
import android.content.res.Configuration;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.content.pm.PackageManager;
import android.Manifest;

public class MainActivity extends BridgeActivity {
    public static boolean isVideoPlaying = false;
    private static final int RECORD_AUDIO_REQUEST_CODE = 101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Habilita Edge-to-Edge nativo para todas as versões do Android suportadas
        EdgeToEdge.enable(this);

        registerPlugin(RokuDiscoveryPlugin.class);
        registerPlugin(PiPPlugin.class);
        registerPlugin(StatusBarPlugin.class);
        super.onCreate(savedInstanceState);

        // Ajusta insets no container de conteúdo para evitar sobreposição da UI
        // em modo normal, zerando insets durante PiP e reprodução em tela cheia
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (view, windowInsets) -> {
            if (isInPictureInPictureMode() || StatusBarPlugin.isBarsHidden()) {
                view.setPadding(0, 0, 0, 0);
            } else {
                androidx.core.graphics.Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
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
                webView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        runOnUiThread(() -> {
                            request.grant(request.getResources());
                        });
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (isVideoPlaying) {
                try {
                    PictureInPictureParams params = new PictureInPictureParams.Builder()
                            .setAspectRatio(new Rational(16, 9))
                            .build();
                    enterPictureInPictureMode(params);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        try {
            if (this.bridge != null) {
                String data = "{ \"isPiP\": " + isInPictureInPictureMode + " }";
                this.bridge.triggerWindowJSEvent("pipModeChanged", data);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
