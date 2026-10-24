package io.github.cosmoszhan.haruhikage;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.view.ViewGroup;

/** Offline-only WebView host for the embedded seven-track Web Audio score player. */
public final class MainActivity extends Activity {
    private WebView player;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        player = new WebView(this);
        player.setBackgroundColor(Color.rgb(11,16,32));
        player.getSettings().setJavaScriptEnabled(true);
        player.getSettings().setDomStorageEnabled(true);
        player.getSettings().setAllowFileAccess(true);
        player.getSettings().setAllowContentAccess(false);
        player.getSettings().setMediaPlaybackRequiresUserGesture(true);
        // Embedded HTML is self-contained; reject external navigation.
        player.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                String url = request.getUrl().toString();
                return !url.startsWith("file:///android_asset/");
            }
        });
        player.setWebChromeClient(new WebChromeClient());
        setContentView(player,new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        player.loadUrl("file:///android_asset/index.html");
    }
    @Override protected void onPause() {
        if (player != null) {
            player.evaluateJavascript("if(typeof pause==='function') pause();", null);
            player.onPause();
        }
        super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if(player!=null) player.onResume(); }
    @Override protected void onDestroy() {
        if (player != null) { player.loadUrl("about:blank"); player.destroy(); player=null; }
        super.onDestroy();
    }
}
