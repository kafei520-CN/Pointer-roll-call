package com.zhizhen.dianming

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // targetSdk 37 keeps the activity full screen, so adjustResize alone does
    // not move a bottom input. iQOO still needs the mode so the visible frame updates.
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
  }

  override fun onNewIntent(intent: Intent) {
    setIntent(intent)
    super.onNewIntent(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    // setContentView replaces LayoutParams, so wait until the WebView is attached.
    webView.post { installKeyboardInset(webView) }
  }

  private fun installKeyboardInset(webView: WebView) {
    // Listen on the parent. A listener on the WebView itself would replace
    // WebView.onApplyWindowInsets and drop env(safe-area-inset-*).
    val content = webView.parent as? View ?: return
    ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
      applyKeyboardMargin(webView, insets)
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      if (keyboardOverlap(insets) > 0 && ime > 0) {
        WindowInsetsCompat.Builder(insets)
          .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
          .build()
      } else {
        insets
      }
    }
    content.viewTreeObserver.addOnGlobalLayoutListener {
      applyKeyboardMargin(webView, ViewCompat.getRootWindowInsets(content))
    }
    ViewCompat.requestApplyInsets(content)
  }

  private fun applyKeyboardMargin(webView: View, insets: WindowInsetsCompat?) {
    val bottom = keyboardOverlap(insets)
    val params = webView.layoutParams
    if (params is ViewGroup.MarginLayoutParams && params.bottomMargin != bottom) {
      params.bottomMargin = bottom
      webView.layoutParams = params
    }
  }

  /**
   * How much of this window the keyboard still covers.
   * 0 means the system already resized the window, or the keyboard is closed.
   */
  private fun keyboardOverlap(insets: WindowInsetsCompat?): Int {
    val decor = window.decorView
    if (decor.height <= 0) {
      return 0
    }
    val nav = insets?.getInsets(WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0
    val slop = (48 * resources.displayMetrics.density).toInt()
    val visible = Rect()
    decor.getWindowVisibleDisplayFrame(visible)
    val covered = (decor.height - visible.bottom).coerceAtLeast(0)
    // Nav-bar alone must not count. A docked keyboard is much taller.
    val minKeyboard = maxOf(nav + slop, (decor.height * 0.15).toInt())
    val frameReady = visible.height() > slop && covered < decor.height * 0.7
    if (frameReady && covered > minKeyboard) {
      return covered
    }
    val ime = insets?.getInsets(WindowInsetsCompat.Type.ime())?.bottom ?: 0
    val screenHeight = resources.displayMetrics.heightPixels
    if (ime > minKeyboard && decor.height >= screenHeight - slop) {
      return ime
    }
    return 0
  }
}
