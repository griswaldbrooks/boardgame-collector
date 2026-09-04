package home.bgn.coordinator

import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

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
  //
  // The second hand-added bridge is the contact-book backup (docs/adr/0009):
  // MediaStore writes into Downloads/BGN Coordinator/, which need no
  // permission on API 29+ and survive an uninstall — the wipe that the
  // backup exists to answer. Nothing here leaves the device.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    webView.addJavascriptInterface(Installer(), "BgnInstaller")
    webView.addJavascriptInterface(Backup(), "BgnBackup")
  }

  private var webView: WebView? = null

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

  /* ------------------------- contact-book backup ------------------------- */
  // Every method is best-effort and returns a value the JS side can ignore:
  // src/backup.js treats any failure as "no backup this time" rather than
  // letting it break a contact save.
  private inner class Backup {
    // MediaStore's Downloads collection is API 29+; below that a write would
    // need WRITE_EXTERNAL_STORAGE, which this app deliberately does not ask
    // for (docs/adr/0009).
    private fun supported() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    private val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/BGN Coordinator/"

    private fun collection(): Uri = MediaStore.Downloads.EXTERNAL_CONTENT_URI

    // Rows this app owns in that folder. After a reinstall MediaStore no
    // longer credits us with the old files, so this can come back empty even
    // though the files are still on disk — that is what the explicit
    // file-picker import is for.
    private fun query(name: String?): Pair<Uri, String>? {
      val selection = StringBuilder("${MediaStore.MediaColumns.RELATIVE_PATH}=?")
      val args = mutableListOf(relativePath)
      if (name != null) {
        selection.append(" AND ${MediaStore.MediaColumns.DISPLAY_NAME}=?")
        args.add(name)
      }
      contentResolver.query(
        collection(),
        arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME),
        selection.toString(),
        args.toTypedArray(),
        "${MediaStore.MediaColumns.DISPLAY_NAME} DESC",
      )?.use { c ->
        if (c.moveToFirst()) {
          return Uri.withAppendedPath(collection(), c.getLong(0).toString()) to c.getString(1)
        }
      }
      return null
    }

    private fun insertRow(name: String): Uri? {
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
        put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
      }
      return contentResolver.insert(collection(), values)
    }

    @JavascriptInterface
    fun write(name: String, json: String): String? {
      if (!supported()) return "unsupported"
      if (name != File(name).name) return "bad-file-name"
      return try {
        // A second write in the same minute — a launch write and then a save
        // — overwrites that row IN PLACE. It must not be deleted first: a
        // fresh insert would let MediaStore invent "name (1).json", which
        // the dated naming/pruning in src/backup.js would never recognise
        // again, and a delete before a confirmed replacement is exactly the
        // loss this whole feature exists to prevent.
        val existing = query(name)?.first
        val uri = existing ?: insertRow(name) ?: return "insert-failed"
        val mode = if (existing == null) "w" else "wt"
        contentResolver.openOutputStream(uri, mode)!!.use { it.write(json.toByteArray()) }
        null
      } catch (e: Exception) {
        "write-failed"
      }
    }

    // JSON array of the backup file names this app can see, newest last is
    // irrelevant — src/backup.js sorts by the dated name itself.
    @JavascriptInterface
    fun list(): String {
      val names = JSONArray()
      if (!supported()) return names.toString()
      try {
        contentResolver.query(
          collection(),
          arrayOf(MediaStore.MediaColumns.DISPLAY_NAME),
          "${MediaStore.MediaColumns.RELATIVE_PATH}=?",
          arrayOf(relativePath),
          null,
        )?.use { c -> while (c.moveToNext()) names.put(c.getString(0)) }
      } catch (e: Exception) {
        // Unreadable collection: no backups as far as the app is concerned.
      }
      return names.toString()
    }

    @JavascriptInterface
    fun read(name: String): String? {
      if (!supported() || name != File(name).name) return null
      return try {
        val (uri, _) = query(name) ?: return null
        contentResolver.openInputStream(uri)?.use { it.readBytes().decodeToString() }
      } catch (e: Exception) {
        null
      }
    }

    @JavascriptInterface
    fun remove(name: String): Boolean {
      if (!supported() || name != File(name).name) return false
      return try {
        val (uri, _) = query(name) ?: return false
        contentResolver.delete(uri, null, null) > 0
      } catch (e: Exception) {
        false
      }
    }

    // Android's own document picker, so a backup written by a previous
    // install (whose MediaStore ownership this one no longer has) is still
    // reachable. The result comes back through deliverPicked().
    @JavascriptInterface
    @Suppress("DEPRECATION")
    fun pick() {
      runOnUiThread {
        try {
          startActivityForResult(
            Intent(Intent.ACTION_OPEN_DOCUMENT)
              .addCategory(Intent.CATEGORY_OPENABLE)
              .setType("*/*"),
            REQ_PICK_BACKUP,
          )
        } catch (e: ActivityNotFoundException) {
          deliverPicked(null)
        }
      }
    }
  }

  // startActivityForResult is deprecated in favour of the ActivityResult
  // APIs, but those need a registration before the activity starts — this
  // pair is the smaller bridge for one picker.
  @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQ_PICK_BACKUP) return
    val uri = data?.data
    if (resultCode != RESULT_OK || uri == null) {
      deliverPicked(null)
      return
    }
    // The picker deliberately accepts any file (a backup this install no
    // longer owns is only reachable through it), so a mis-tapped 50 MB video
    // is a normal outcome: read off the UI thread and stop at a size no
    // contact book reaches. Anything bigger, or unreadable, comes back as
    // null — the same "No backup file read." the coordinator gets on cancel.
    Thread { deliverPicked(readPicked(uri)) }.start()
  }

  private fun readPicked(uri: Uri): String? =
    try {
      contentResolver.openInputStream(uri)?.use { input ->
        val buf = ByteArray(MAX_PICK_BYTES + 1)
        var n = 0
        while (n < buf.size) {
          val r = input.read(buf, n, buf.size - n)
          if (r < 0) break
          n += r
        }
        if (n > MAX_PICK_BYTES) null else String(buf, 0, n, Charsets.UTF_8)
      }
    } catch (e: Exception) {
      null
    }

  // Hand the picked file's text (or null for cancelled/unreadable) to the
  // promise src/backup.js parked on window.
  private fun deliverPicked(text: String?) {
    val arg = if (text == null) "null" else JSONObject.quote(text)
    runOnUiThread {
      webView?.evaluateJavascript(
        "window.__bgnBackupPicked && window.__bgnBackupPicked($arg)",
        null,
      )
    }
  }

  private companion object {
    const val REQ_PICK_BACKUP = 4021

    // A contact book is kilobytes; this is orders of magnitude of headroom
    // and still bounds the allocation from an arbitrary picked file.
    const val MAX_PICK_BYTES = 1 shl 20
  }
}
