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
                call.reject("Error during discovery", e);
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
}
