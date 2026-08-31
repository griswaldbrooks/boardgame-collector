package home.bgn.coordinator

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Hand-patch of a generated file (see AGENTS.md): replaces the generated
    // enableEdgeToEdge() so the WebView never sits under the status or
    // navigation bar. A `tauri android init` regen drops this.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
  }

  // Hand-patch of a generated file (see AGENTS.md): the self-updater's
  // install handoff (docs/adr/0007). The WebView downloads the new APK into
  // the app cache dir (src/updater.js + tauri-plugin-fs) and calls this
  // bridge; the bridge shares the file through the app's own FileProvider
  // and hands it to Android's installer, whose signature check is the
  // update-integrity guarantee — the app verifies nothing itself.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(Installer(), "BgnInstaller")
  }

  private inner class Installer {
    // Returns null on success, a short error token otherwise (surfaced on
    // the update screen). Only a bare file name is accepted, resolved in
    // the app cache dir — JS can never point the installer anywhere else.
    @JavascriptInterface
    fun installApk(fileName: String): String? {
      if (fileName != File(fileName).name) return "bad-file-name"
      val apk = File(cacheDir, fileName)
      if (!apk.isFile) return "no-such-file"
      val uri: Uri = try {
        FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", apk)
      } catch (e: IllegalArgumentException) {
        return "no-file-provider"
      }
      return try {
        startActivity(
          Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
        null
      } catch (e: ActivityNotFoundException) {
        "no-installer"
      }
    }
  }
}
