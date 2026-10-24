package com.playinfinity.app;

import android.view.View;
import android.view.Window;
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
 * Plugin de StatusBar compatível com Android 15/16 (SDK 35/36).
 * Utiliza exclusivamente WindowInsetsControllerCompat sem chamar
 * setStatusBarColor ou setSystemUiVisibility (depreciados no Android 15).
 */
@CapacitorPlugin(name = "StatusBar")
public class StatusBarPlugin extends Plugin {
    private static volatile boolean barsHidden = false;

    public static boolean isBarsHidden() {
        return barsHidden;
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

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("visible", !barsHidden);
        ret.put("style", "DARK");
        ret.put("color", "#000000");
        ret.put("overlays", true);
        call.resolve(ret);
    }
}
