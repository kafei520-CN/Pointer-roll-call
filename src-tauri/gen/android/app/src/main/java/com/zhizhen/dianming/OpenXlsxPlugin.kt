package com.zhizhen.dianming

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.webkit.WebView
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@TauriPlugin
class OpenXlsxPlugin(private val activity: Activity) : Plugin(activity) {
    override fun load(webView: WebView) {
        ingest(activity.intent, emit = true)
    }

    override fun onNewIntent(intent: Intent) {
        ingest(intent, emit = true)
    }

    private fun ingest(intent: Intent?, emit: Boolean) {
        val uri = extractUri(intent) ?: return
        val name = displayName(uri)
        val bytes = readBytes(uri) ?: return
        if (!looksLikeSpreadsheet(name, intent, uri) && !looksLikeWorkbook(bytes)) {
            return
        }
        val stored = if (hasSpreadsheetExt(name.lowercase())) name else "$name.xlsx"
        writePending(bytes, stored)
        if (emit) {
            trigger("xlsxOpened", JSObject())
        }
    }

    private fun looksLikeWorkbook(bytes: ByteArray): Boolean {
        if (bytes.size < 4) {
            return false
        }
        val zip = bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte() && bytes[2] == 0x03.toByte()
        val ole = bytes[0] == 0xD0.toByte() && bytes[1] == 0xCF.toByte() && bytes[2] == 0x11.toByte()
        return zip || ole
    }

    private fun writePending(bytes: ByteArray, name: String) {
        val dirs = mutableListOf(activity.cacheDir, File(activity.cacheDir, activity.packageName), activity.filesDir)
        activity.externalCacheDir?.let { dirs.add(it) }
        for (dir in dirs) {
            try {
                dir.mkdirs()
                File(dir, "pending_xlsx.bin").writeBytes(bytes)
                File(dir, "pending_xlsx.name").writeText(name)
            } catch (_: Exception) {
            }
        }
    }

    private fun extractUri(intent: Intent?): Uri? {
        if (intent == null) {
            return null
        }
        when (intent.action) {
            Intent.ACTION_VIEW, Intent.ACTION_EDIT -> {
                intent.data?.let { return it }
            }
            Intent.ACTION_SEND -> {
                streamExtra(intent)?.let { return it }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                streamList(intent)?.firstOrNull()?.let { return it }
            }
        }
        intent.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri?.let { return it }
        return intent.data
    }

    private fun streamExtra(intent: Intent): Uri? {
        return if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_STREAM)
        }
    }

    private fun streamList(intent: Intent): ArrayList<Uri>? {
        return if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
        }
    }

    private fun displayName(uri: Uri): String {
        val resolver = activity.contentResolver
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) {
                    val value = cursor.getString(index)
                    if (!value.isNullOrBlank()) {
                        return value
                    }
                }
            }
        }
        return uri.lastPathSegment
            ?.substringAfterLast('/')
            ?.substringAfterLast(':')
            ?: "import.xlsx"
    }

    private fun looksLikeSpreadsheet(name: String, intent: Intent?, uri: Uri): Boolean {
        val lower = name.lowercase()
        val path = uri.path.orEmpty().lowercase()
        if (hasSpreadsheetExt(lower) || hasSpreadsheetExt(path)) {
            return true
        }
        val mime = intent?.type?.lowercase().orEmpty()
        return mime.contains("excel") || mime.contains("spreadsheet") || mime.contains("haansoftxlsx")
    }

    private fun hasSpreadsheetExt(value: String): Boolean {
        return value.endsWith(".xlsx") || value.endsWith(".xls") || value.endsWith(".xlsm")
    }

    private fun readBytes(uri: Uri): ByteArray? {
        return try {
            activity.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (_: Exception) {
            null
        }
    }
}
