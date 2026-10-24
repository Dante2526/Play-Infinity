# Project specific ProGuard / R8 rules for Play Infinity

# Capacitor Plugin and Bridge Protection for R8
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclasseswithmembers class * {
    @com.getcapacitor.annotation.CapacitorPlugin <methods>;
    @com.getcapacitor.PluginMethod <methods>;
}

# Local App Plugins and Activity
-keep class com.playinfinity.app.** { *; }
-keep class androidx.activity.EdgeToEdge { *; }

# WebView and JavaScript Interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public *;
}
-keepclassmembers class * extends android.webkit.WebViewClient {
    public *;
}

# AndroidX Core, Window and Insets
-keep class androidx.core.view.WindowInsetsControllerCompat { *; }
-keep class androidx.core.view.WindowCompat { *; }
-keep class androidx.core.view.ViewCompat { *; }

# Firebase & Google Play Services
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Line numbers for crash traces in Play Console
-keepattributes SourceFile,LineNumberTable
