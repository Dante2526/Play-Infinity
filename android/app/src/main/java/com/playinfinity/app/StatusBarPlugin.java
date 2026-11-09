package com.playinfinity.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin de StatusBar e Controle de Janela compatível com Android 15/16 (SDK 35/36).
 * Utiliza exclusivamente WindowInsetsControllerCompat sem chamar
 * setStatusBarColor ou setSystemUiVisibility (depreciados no Android 15).
 * Expõe controle dinâmico remoto para o React da VPS gerenciar ActionBar,
 * insets de tela cheia, limpeza de cache e versão instalada.
 */
@CapacitorPlugin(name = "StatusBar")
public class StatusBarPlugin extends Plugin {
    private static volatile boolean barsHidden = false;
    private static volatile Integer customPaddingTop = null;
    private static volatile Integer customPaddingBottom = null;
    private static volatile Integer customPaddingLeft = null;
    private static volatile Integer customPaddingRight = null;

    public static boolean isBarsHidden() {
        return barsHidden;
    }

    public static Integer getCustomPaddingTop() {
        return customPaddingTop;
    }

    public static Integer getCustomPaddingBottom() {
        return customPaddingBottom;
    }

    public static Integer getCustomPaddingLeft() {
        return customPaddingLeft;
    }

    public static Integer getCustomPaddingRight() {
        return customPaddingRight;
    }

    @PluginMethod
    public void hide(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity não disponível");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                View decorView = window.getDecorView();
                WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, decorView);
                if (insetsController != null) {
                    insetsController.setSystemBarsBehavior(
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                    insetsController.hide(WindowInsetsCompat.Type.systemBars());
                }
                barsHidden = true;
                View contentView = getActivity().findViewById(android.R.id.content);
                if (contentView != null) {
                    ViewCompat.requestApplyInsets(contentView);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Erro ao ocultar barra de status: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity não disponível");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                View decorView = window.getDecorView();
                WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, decorView);
                if (insetsController != null) {
                    insetsController.show(WindowInsetsCompat.Type.systemBars());
                }
                barsHidden = false;
                View contentView = getActivity().findViewById(android.R.id.content);
                if (contentView != null) {
                    ViewCompat.requestApplyInsets(contentView);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Erro ao exibir barra de status: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void setStyle(PluginCall call) {
        // Modern no-op: tema escuro/claro respeitado nativamente pelas barras do sistema
        call.resolve();
    }

    @PluginMethod
    public void setBackgroundColor(PluginCall call) {
        // No-op seguro: evita chamar setStatusBarColor depreciado
        call.resolve();
    }

    @PluginMethod
    public void setOverlaysWebView(PluginCall call) {
        // No-op seguro: EdgeToEdge gerencia a sobreposição nativamente
        call.resolve();
    }

    /**
     * Oculta programaticamente qualquer ActionBar nativa do Android.
     */
    @PluginMethod
    public void hideActionBar(PluginCall call) {
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                if (getActivity() instanceof AppCompatActivity) {
                    ActionBar ab = ((AppCompatActivity) getActivity()).getSupportActionBar();
                    if (ab != null) ab.hide();
                }
                android.app.ActionBar nativeBar = getActivity().getActionBar();
                if (nativeBar != null) nativeBar.hide();
                call.resolve();
            } catch (Exception e) {
                call.resolve();
            }
        });
    }

    /**
     * Permite ao frontend ajustar margens/insets da janela nativa ou resetar para o padrão.
     */
    @PluginMethod
    public void setWindowPadding(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity não disponível");
            return;
        }
        boolean reset = call.getBoolean("reset", false);
        if (reset) {
            customPaddingTop = null;
            customPaddingBottom = null;
            customPaddingLeft = null;
            customPaddingRight = null;
        } else {
            if (call.getData().has("top")) customPaddingTop = call.getInt("top");
            if (call.getData().has("bottom")) customPaddingBottom = call.getInt("bottom");
            if (call.getData().has("left")) customPaddingLeft = call.getInt("left");
            if (call.getData().has("right")) customPaddingRight = call.getInt("right");
        }

        getActivity().runOnUiThread(() -> {
            try {
                View contentView = getActivity().findViewById(android.R.id.content);
                if (contentView != null) {
                    ViewCompat.requestApplyInsets(contentView);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Erro ao aplicar insets: " + e.getMessage());
            }
        });
    }

    /**
     * Limpa o cache do WebView e opcionalmente recarrega a página.
     */
    @PluginMethod
    public void clearWebViewCache(PluginCall call) {
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        boolean reload = call.getBoolean("reload", false);
        getActivity().runOnUiThread(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    WebView wv = getBridge().getWebView();
                    wv.clearCache(true);
                    if (reload) {
                        wv.reload();
                    }
                }
                call.resolve();
            } catch (Exception e) {
                call.resolve();
            }
        });
    }

    /**
     * Abre uma URL no navegador padrão do Android (usado para download direto do APK).
     */
    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || urlString.isEmpty()) {
            call.reject("URL não informada");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(urlString));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Falha ao abrir URL externa: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("visible", !barsHidden);
        ret.put("style", "DARK");
        ret.put("color", "#000000");
        ret.put("overlays", true);

        // Retorna versionCode e versionName do binário Android instalado
        try {
            android.content.pm.PackageInfo pInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long versionCode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                versionCode = pInfo.getLongVersionCode();
            } else {
                versionCode = pInfo.versionCode;
            }
            ret.put("versionCode", versionCode);
            ret.put("versionName", pInfo.versionName);
        } catch (Exception e) {
            ret.put("versionCode", 0);
            ret.put("versionName", "unknown");
        }

        call.resolve(ret);
    }
}
