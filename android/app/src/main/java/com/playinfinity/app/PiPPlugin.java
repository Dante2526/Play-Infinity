package com.playinfinity.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PiP")
public class PiPPlugin extends Plugin {
    @PluginMethod
    public void setPlayingStatus(PluginCall call) {
        Boolean isPlaying = call.getBoolean("isPlaying", false);
        MainActivity.isVideoPlaying = isPlaying;
        call.resolve();
    }
}
