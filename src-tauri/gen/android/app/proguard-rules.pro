# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Hand-patch of a generated file (see AGENTS.md): the self-updater's install
# bridge (MainActivity.Installer) is called from JS by method name — R8 must
# not rename or strip it (docs/adr/0007).
-keepclassmembers class home.bgn.coordinator.MainActivity$Installer {
   @android.webkit.JavascriptInterface <methods>;
}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile