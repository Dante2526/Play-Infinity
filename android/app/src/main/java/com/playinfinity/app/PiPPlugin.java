package com.playinfinity.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.os.Build;
import android.app.PictureInPictureParams;
import android.util.Rational;

@CapacitorPlugin(name = "PiP")
public class PiPPlugin extends Plugin {
    @PluginMethod
    public void setPlayingStatus(PluginCall call) {
        Boolean isPlaying = call.getBoolean("isPlaying", false);
        MainActivity.isVideoPlaying = isPlaying;
        call.resolve();
    }

    @PluginMethod
    public void enter(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    try {
                        PictureInPictureParams params = new PictureInPictureParams.Builder()
                                .setAspectRatio(new Rational(16, 9))
                                .build();
                        boolean entered = getActivity().enterPictureInPictureMode(params);
                        if (entered) {
                            call.resolve();
                        } else {
                            call.reject("Falha ao entrar em Picture-in-Picture");
                        }
                    } catch (Exception e) {
                        call.reject("Erro ao entrar em PiP: " + e.getMessage());
                    }
                });
            } else {
                call.reject("Activity indisponível");
            }
        } else {
            call.reject("Dispositivo não suporta Picture-in-Picture (requer Android 8.0+)");
        }
    }
}
