package fr.overtime.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

public class MainActivity extends Activity {
    static final int PORT = 51283;
    static final String HOME = "http://127.0.0.1:" + PORT + "/";
    static Process engine;

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0B0D26"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        web.addJavascriptInterface(new Bridge(), "OvertimeAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("127.0.0.1".equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }
        });

        web.loadDataWithBaseURL(null,
            "<html><body style='background:#0B0D26;color:#a3a8d8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>Démarrage d'Overtime…</body></html>",
            "text/html", "utf-8", null);

        new Thread(() -> {
            String err = startEngine();
            ui.post(() -> {
                if (err == null) web.loadUrl(HOME + "#/pro");
                else web.loadDataWithBaseURL(null, "<html><body style='background:#0B0D26;color:#ff4d6a;font-family:sans-serif;padding:24px'>Le moteur n'a pas démarré : " + err + "</body></html>", "text/html", "utf-8", null);
            });
        }).start();
    }

    /** Lance le moteur Go (libovertime.so) puis attend qu'il réponde. */
    private String startEngine() {
        try {
            if (!portOpen()) {
                File bin = new File(getApplicationInfo().nativeLibraryDir, "libovertime.so");
                File data = new File(getFilesDir(), "overtime");
                data.mkdirs();
                ProcessBuilder pb = new ProcessBuilder(bin.getAbsolutePath(),
                    "-mobile", "-nobrowser", "-port", String.valueOf(PORT), "-data", data.getAbsolutePath());
                pb.redirectErrorStream(true);
                pb.redirectOutput(new File(data, "engine.out"));
                engine = pb.start();
            }
            for (int i = 0; i < 100; i++) {
                if (portOpen()) return null;
                if (engine != null && !engine.isAlive()) return "arrêt immédiat (code " + engine.exitValue() + ")";
                Thread.sleep(100);
            }
            return "délai dépassé";
        } catch (Exception e) {
            return e.toString();
        }
    }

    private static boolean portOpen() {
        try (Socket so = new Socket()) {
            so.connect(new InetSocketAddress("127.0.0.1", PORT), 200);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "Impossible d'ouvrir le lien", Toast.LENGTH_SHORT).show();
        }
    }

    private static byte[] decodeDataUrl(String dataUrl) {
        int i = dataUrl.indexOf(',');
        return Base64.decode(i >= 0 ? dataUrl.substring(i + 1) : dataUrl, Base64.DEFAULT);
    }

    private static String safeName(String name) {
        String n = name == null ? "overtime.png" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return n.endsWith(".png") ? n : n + ".png";
    }

    class Bridge {
        @JavascriptInterface
        public void shareImage(String dataUrl, String name) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File f = new File(dir, safeName(name));
                try (OutputStream o = new FileOutputStream(f)) { o.write(decodeDataUrl(dataUrl)); }
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, ShareProvider.uriFor(f.getName()));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, "Partager l'image");
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                ui.post(() -> startActivity(chooser));
            } catch (Exception e) {
                ui.post(() -> Toast.makeText(MainActivity.this, "Partage impossible", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public boolean saveImage(String dataUrl, String name) {
            try {
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, safeName(name));
                v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Overtime");
                Uri uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                try (OutputStream o = cr.openOutputStream(uri)) { o.write(decodeDataUrl(dataUrl)); }
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void openUrl(String url) {
            ui.post(() -> openExternal(url));
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
