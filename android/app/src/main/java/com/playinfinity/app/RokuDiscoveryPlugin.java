package com.playinfinity.app;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "RokuDiscovery")
public class RokuDiscoveryPlugin extends Plugin {

    private static final String TAG = "RokuDiscovery";
    private static final String SSDP_ADDRESS = "239.255.255.250";
    private static final int SSDP_PORT = 1900;
    private static final String SEARCH_MESSAGE = 
            "M-SEARCH * HTTP/1.1\r\n" +
            "Host: 239.255.255.250:1900\r\n" +
            "Man: \"ssdp:discover\"\r\n" +
            "ST: roku:ecp\r\n\r\n";

    @PluginMethod
    public void discover(PluginCall call) {
        new Thread(() -> {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) {
                call.reject("WifiManager not available");
                return;
            }

            WifiManager.MulticastLock lock = wifi.createMulticastLock("RokuDiscoveryLock");
            lock.setReferenceCounted(true);
            lock.acquire();

            DatagramSocket socket = null;
            Set<String> rokuIps = new HashSet<>();

            try {
                socket = new DatagramSocket();
                socket.setSoTimeout(3000); // 3 segundos de timeout

                InetAddress address = InetAddress.getByName(SSDP_ADDRESS);
                byte[] sendData = SEARCH_MESSAGE.getBytes();
                DatagramPacket sendPacket = new DatagramPacket(sendData, sendData.length, address, SSDP_PORT);
                
                socket.setBroadcast(true);
                socket.send(sendPacket);
                Log.d(TAG, "M-SEARCH sent for roku:ecp");

                long startTime = System.currentTimeMillis();
                while (System.currentTimeMillis() - startTime < 3000) {
                    byte[] receiveData = new byte[1024];
                    DatagramPacket receivePacket = new DatagramPacket(receiveData, receiveData.length);
                    try {
                        socket.receive(receivePacket);
                        String response = new String(receivePacket.getData(), 0, receivePacket.getLength());
                        if (response.toLowerCase().contains("roku:ecp")) {
                            String ip = receivePacket.getAddress().getHostAddress();
                            rokuIps.add(ip);
                            Log.d(TAG, "Found Roku at: " + ip);
                        }
                    } catch (java.net.SocketTimeoutException e) {
                        break; // Timeout alcançado
                    }
                }

                JSArray arr = new JSArray();
                for (String ip : rokuIps) {
                    arr.put(ip);
                }

                JSObject res = new JSObject();
                res.put("devices", arr);
                call.resolve(res);

            } catch (Exception e) {
                Log.e(TAG, "SSDP Error", e);
                call.reject(e.getMessage() != null ? e.getMessage() : "Unknown SSDP Error", e);
            } finally {
                if (socket != null && !socket.isClosed()) {
                    socket.close();
                }
                if (lock.isHeld()) {
                    lock.release();
                }
            }
        }).start();
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String ip = call.getString("ip");
        String urlString = call.getString("url");
        
        if (ip == null || urlString == null) {
            call.reject("Must provide ip and url");
            return;
        }

        new Thread(() -> {
            try {
                String format = call.getString("format", "mp4");
                String encodedUrl = java.net.URLEncoder.encode(urlString, "UTF-8");
                String[] endpoints = {
                    "/input/15985?t=v&videoFormat=" + format + "&u=" + encodedUrl, 
                    "/input?t=v&videoFormat=" + format + "&u=" + encodedUrl,       
                    "/launch/15985?t=v&videoFormat=" + format + "&u=" + encodedUrl 
                };
                
                int responseCode = -1;
                for (String endpoint : endpoints) {
                    URL url = new URL("http://" + ip + ":8060" + endpoint);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(3000);
                    conn.setReadTimeout(3000);
                    
                    responseCode = conn.getResponseCode();
                    Log.d(TAG, "Roku attempt " + endpoint + " -> " + responseCode);
                    
                    if (responseCode == 200) {
                        break;
                    }
                }
                
                JSObject res = new JSObject();
                res.put("success", responseCode == 200);
                res.put("status", responseCode);
                call.resolve(res);
            } catch (Exception e) {
                Log.e(TAG, "Error launching on Roku", e);
                call.reject("Error launching on Roku: " + e.getMessage(), e);
            }
        }).start();
    }

    @PluginMethod
    public void openIntent(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null) {
            call.reject("Must provide url");
            return;
        }
        try {
            android.content.Intent intent = android.content.Intent.parseUri(urlString, android.content.Intent.URI_INTENT_SCHEME);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (android.content.ActivityNotFoundException e) {
            try {
                android.content.Intent originalIntent = android.content.Intent.parseUri(urlString, android.content.Intent.URI_INTENT_SCHEME);
                String fallbackUrl = originalIntent.getStringExtra("browser_fallback_url");
                if (fallbackUrl != null) {
                    android.content.Intent fallbackIntent = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(fallbackUrl));
                    fallbackIntent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(fallbackIntent);
                    call.resolve();
                } else {
                    Log.e(TAG, "Activity not found and no fallback url", e);
                    call.reject("App not installed: " + e.getMessage(), e);
                }
            } catch (Exception ex) {
                Log.e(TAG, "Error handling fallback intent", ex);
                call.reject("Error opening fallback: " + ex.getMessage(), ex);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error opening intent", e);
            call.reject("Error opening intent: " + e.getMessage(), e);
        }
    }
}
