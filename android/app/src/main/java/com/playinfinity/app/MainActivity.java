package com.playinfinity.app;

import android.os.Bundle;
import android.os.Build;
import android.app.PictureInPictureParams;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static boolean isVideoPlaying = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RokuDiscoveryPlugin.class);
        registerPlugin(PiPPlugin.class);
        super.onCreate(savedInstanceState);
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
}
