package com.playinfinity.app;

import android.app.Activity;
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
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

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
     * Abre uma URL externa no Android (ex.: página da Google Play Store ou navegador padrão).
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

    private long getInstalledVersionCode() {
        try {
            android.content.pm.PackageInfo pInfo = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return pInfo.getLongVersionCode();
            }
            return pInfo.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private String getInstalledVersionName() {
        try {
            android.content.pm.PackageInfo pInfo = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            return pInfo.versionName != null ? pInfo.versionName : "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }

    /**
     * Consulta diretamente a Google Play Store instalada no aparelho (Play In-App Updates API)
     * para detectar automaticamente se existe uma versão mais recente publicada do que a instalada.
     */
    @PluginMethod
    public void checkPlayStoreUpdate(PluginCall call) {
        if (getContext() == null) {
            JSObject ret = new JSObject();
            ret.put("supported", false);
            ret.put("updateAvailable", false);
            ret.put("availableVersionCode", 0);
            ret.put("installedVersionCode", 0);
            ret.put("installedVersionName", "unknown");
            ret.put("error", "context_unavailable");
            call.resolve(ret);
            return;
        }

        final long installedVersionCode = getInstalledVersionCode();
        final String installedVersionName = getInstalledVersionName();

        try {
            AppUpdateManager appUpdateManager = AppUpdateManagerFactory.create(getContext().getApplicationContext());
            appUpdateManager
                .getAppUpdateInfo()
                .addOnSuccessListener(appUpdateInfo -> {
                    int availability = appUpdateInfo.updateAvailability();
                    int installStatus = appUpdateInfo.installStatus();
                    boolean downloaded = installStatus == InstallStatus.DOWNLOADED;
                    boolean statusHasUpdate = availability == UpdateAvailability.UPDATE_AVAILABLE;
                    int availableVersionCode = (statusHasUpdate || downloaded) ? appUpdateInfo.availableVersionCode() : 0;
                    boolean isNewer =
                        (statusHasUpdate && installedVersionCode > 0 && availableVersionCode > installedVersionCode) ||
                        downloaded;
                    boolean immediateAllowed =
                        statusHasUpdate &&
                        appUpdateInfo.isUpdateTypeAllowed(AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE));
                    boolean flexibleAllowed =
                        statusHasUpdate &&
                        appUpdateInfo.isUpdateTypeAllowed(AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE));

                    JSObject ret = new JSObject();
                    ret.put("supported", true);
                    ret.put("updateAvailable", isNewer);
                    ret.put("availableVersionCode", availableVersionCode);
                    ret.put("installedVersionCode", installedVersionCode);
                    ret.put("installedVersionName", installedVersionName);
                    ret.put("immediateAllowed", immediateAllowed);
                    ret.put("flexibleAllowed", flexibleAllowed);
                    ret.put("downloaded", downloaded);
                    ret.put("updateAvailability", availability);
                    ret.put("installStatus", installStatus);
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> {
                    JSObject ret = new JSObject();
                    ret.put("supported", false);
                    ret.put("updateAvailable", false);
                    ret.put("availableVersionCode", 0);
                    ret.put("installedVersionCode", installedVersionCode);
                    ret.put("installedVersionName", installedVersionName);
                    ret.put("error", e != null && e.getMessage() != null ? e.getMessage() : "play_store_unavailable");
                    call.resolve(ret);
                });
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("supported", false);
            ret.put("updateAvailable", false);
            ret.put("availableVersionCode", 0);
            ret.put("installedVersionCode", installedVersionCode);
            ret.put("installedVersionName", installedVersionName);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "play_store_exception");
            call.resolve(ret);
        }
    }

    /**
     * Inicia o fluxo nativo de atualização da Google Play Store dentro do app.
     * Caso o aparelho não permita o fluxo nativo, retorna fallbackRequired=true para abrir a página da loja.
     */
    @PluginMethod
    public void startPlayStoreUpdate(PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null || getContext() == null) {
            JSObject ret = new JSObject();
            ret.put("started", false);
            ret.put("fallbackRequired", true);
            ret.put("error", "activity_unavailable");
            call.resolve(ret);
            return;
        }

        final String mode = call.getString("mode", "immediate");

        try {
            final AppUpdateManager appUpdateManager = AppUpdateManagerFactory.create(getContext().getApplicationContext());
            appUpdateManager
                .getAppUpdateInfo()
                .addOnSuccessListener(appUpdateInfo -> {
                    if (appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED) {
                        appUpdateManager
                            .completeUpdate()
                            .addOnSuccessListener(unused -> {
                                JSObject ret = new JSObject();
                                ret.put("started", true);
                                ret.put("completed", true);
                                ret.put("fallbackRequired", false);
                                call.resolve(ret);
                            })
                            .addOnFailureListener(err -> {
                                JSObject ret = new JSObject();
                                ret.put("started", false);
                                ret.put("fallbackRequired", true);
                                ret.put("error", err != null && err.getMessage() != null ? err.getMessage() : "complete_failed");
                                call.resolve(ret);
                            });
                        return;
                    }

                    int availability = appUpdateInfo.updateAvailability();
                    boolean statusHasUpdate =
                        availability == UpdateAvailability.UPDATE_AVAILABLE ||
                        availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;
                    if (!statusHasUpdate) {
                        JSObject ret = new JSObject();
                        ret.put("started", false);
                        ret.put("fallbackRequired", true);
                        ret.put("error", "no_update_available");
                        call.resolve(ret);
                        return;
                    }

                    int primaryType = "flexible".equalsIgnoreCase(mode)
                        ? AppUpdateType.FLEXIBLE
                        : AppUpdateType.IMMEDIATE;
                    int secondaryType = primaryType == AppUpdateType.IMMEDIATE
                        ? AppUpdateType.FLEXIBLE
                        : AppUpdateType.IMMEDIATE;

                    AppUpdateOptions chosenOptions = AppUpdateOptions.defaultOptions(primaryType);
                    if (!appUpdateInfo.isUpdateTypeAllowed(chosenOptions)) {
                        AppUpdateOptions altOptions = AppUpdateOptions.defaultOptions(secondaryType);
                        chosenOptions = appUpdateInfo.isUpdateTypeAllowed(altOptions) ? altOptions : null;
                    }

                    if (chosenOptions == null) {
                        JSObject ret = new JSObject();
                        ret.put("started", false);
                        ret.put("fallbackRequired", true);
                        ret.put("error", "update_type_not_allowed");
                        call.resolve(ret);
                        return;
                    }

                    final AppUpdateOptions finalOptions = chosenOptions;
                    activity.runOnUiThread(() -> {
                        try {
                            appUpdateManager
                                .startUpdateFlow(appUpdateInfo, activity, finalOptions)
                                .addOnSuccessListener(resultCode -> {
                                    JSObject ret = new JSObject();
                                    ret.put("started", true);
                                    ret.put("resultCode", resultCode != null ? resultCode : Activity.RESULT_CANCELED);
                                    ret.put("accepted", resultCode != null && resultCode == Activity.RESULT_OK);
                                    ret.put("fallbackRequired", false);
                                    call.resolve(ret);
                                })
                                .addOnFailureListener(err -> {
                                    JSObject ret = new JSObject();
                                    ret.put("started", false);
                                    ret.put("fallbackRequired", true);
                                    ret.put("error", err != null && err.getMessage() != null ? err.getMessage() : "flow_failed");
                                    call.resolve(ret);
                                });
                        } catch (Exception ex) {
                            JSObject ret = new JSObject();
                            ret.put("started", false);
                            ret.put("fallbackRequired", true);
                            ret.put("error", ex.getMessage() != null ? ex.getMessage() : "flow_exception");
                            call.resolve(ret);
                        }
                    });
                })
                .addOnFailureListener(e -> {
                    JSObject ret = new JSObject();
                    ret.put("started", false);
                    ret.put("fallbackRequired", true);
                    ret.put("error", e != null && e.getMessage() != null ? e.getMessage() : "play_store_unavailable");
                    call.resolve(ret);
                });
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("started", false);
            ret.put("fallbackRequired", true);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "play_store_exception");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("visible", !barsHidden);
        ret.put("style", "DARK");
        ret.put("color", "#000000");
        ret.put("overlays", true);
        ret.put("versionCode", getInstalledVersionCode());
        ret.put("versionName", getInstalledVersionName());
        call.resolve(ret);
    }
}
