package com.playinfinity.app;

import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Abre a tela de configurações de notificação do app no Android
 * (Ajustes → Aplicativos → Play Infinity → Notificações).
 *
 * Usado pelo modal de instruções do NotificationPermissionGate quando o
 * usuário BLOQUEOU notificações no nível do sistema — o Android não permite
 * re-promptar o diálogo nativo nesse estado, então o único caminho é o
 * usuário habilitar manualmente nas configurações. Um toque direto é bem
 * melhor que instruir o usuário a navegar até lá.
 *
 * Requer APK >= 71 (1.4.39) — a interface JS detecta a disponibilidade via
 * Capacitor.isPluginAvailable() e cai para instruções de texto quando o
 * plugin não existe (APKs antigos).
 */
@CapacitorPlugin(name = "OpenNotificationSettings")
public class OpenNotificationSettingsPlugin extends Plugin {

    @PluginMethod
    public void open(final PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("Falha ao abrir configuracoes de notificacao: " + e.getMessage());
        }
    }
}
