package app.clu.jazzsolo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Insets;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 즉흥 악보 생성기 — 앱 껍데기.
 * · 앱 안에 든 index.html(assets/www)을 https://appassets.androidplatform.net/ 주소로 연다(인터넷 없이도 열림).
 * · 저장(백업·PNG·MusicXML)은 「저장 위치 고르기」 창으로, 공유는 안드로이드 공유 시트로 — 웹 쪽 AndroidBridge.
 * · 곡 불러오기(파일 고르기)는 시스템 파일 선택 창.
 * · 데이터(저장 솔로·보관 마디·내 곡)는 앱 저장소(WebView localStorage)에 남는다. 앱을 지우면 함께 지워지므로 백업 파일 권장.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REQ_OPEN = 11, REQ_SAVE = 12;
    private WebView web;
    private ValueCallback<Uri[]> openCallback;
    private byte[] pendingSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);   // 볼륨 버튼 = 미디어 볼륨

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF10161F);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        /* 화면 끝까지 그리는(edge-to-edge) 기기에서 상태 표시줄·내비게이션 바에 가리지 않게 */
        root.setOnApplyWindowInsetsListener((v, ins) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(ins.getSystemWindowInsetLeft(), ins.getSystemWindowInsetTop(), ins.getSystemWindowInsetRight(), ins.getSystemWindowInsetBottom());
            }
            return ins;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* 열 앱 없음 */ }
                return true;   // 바깥 링크(피드백·메일)는 브라우저·메일 앱으로
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (openCallback != null) openCallback.onReceiveValue(null);
                openCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");   // .musicxml·.mxl·.json은 기기마다 형식 이름이 달라 전부 보이게
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "파일 고르기"), REQ_OPEN); }
                catch (ActivityNotFoundException e) { openCallback = null; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("https://" + HOST + "/assets/www/index.html");
    }

    /** 웹 쪽에서 부르는 저장·공유 */
    public class Bridge {
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String b64) {
            runOnUiThread(() -> {
                pendingSave = Base64.decode(b64, Base64.DEFAULT);
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_SAVE); }
                catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "저장할 수 없습니다", Toast.LENGTH_SHORT).show(); }
            });
        }
        @JavascriptInterface
        public void shareFile(final String name, final String mime, final String b64) {
            runOnUiThread(() -> {
                try {
                    File dir = new File(getCacheDir(), "share");
                    dir.mkdirs();
                    File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                    try (FileOutputStream o = new FileOutputStream(f)) { o.write(Base64.decode(b64, Base64.DEFAULT)); }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(mime);
                    i.putExtra(Intent.EXTRA_STREAM, uri);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "공유"));
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "공유할 수 없습니다", Toast.LENGTH_SHORT).show();
                }
            });
        }
        @JavascriptInterface
        public String platform() { return "android"; }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_OPEN) {
            if (openCallback != null) {
                Uri[] r = null;
                if (res == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        r = new Uri[n];
                        for (int k = 0; k < n; k++) r[k] = data.getClipData().getItemAt(k).getUri();
                    } else if (data.getData() != null) r = new Uri[]{data.getData()};
                }
                openCallback.onReceiveValue(r);
                openCallback = null;
            }
        } else if (req == REQ_SAVE) {
            boolean ok = false;
            if (res == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream o = getContentResolver().openOutputStream(data.getData())) {
                    if (o != null) { o.write(pendingSave); ok = true; }
                } catch (Exception e) { ok = false; }
            }
            pendingSave = null;
            if (res == RESULT_OK) Toast.makeText(this, ok ? "저장했습니다" : "저장하지 못했습니다", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {   // 화면을 벗어나면 재생 소리도 멈춘다(웹 쪽 일시정지)
        super.onPause();
        web.evaluateJavascript("try{if(typeof pauseAll==='function')pauseAll()}catch(e){}", null);
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
    /* 뒤로 가기: 한 페이지 앱이라 기본 동작(앱 닫기)을 그대로 쓴다 — Android 16(API 36) 예측 뒤로 가기와도 맞음 */
}
