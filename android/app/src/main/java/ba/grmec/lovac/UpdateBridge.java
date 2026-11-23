package ba.grmec.lovac;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;

/** AndroidUpdate: preuzimanje novog APK-a i pokretanje instalacije jednim tapom. */
public class UpdateBridge {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private final Activity activity;
    private final WebView webView;
    private long downloadId = -1;
    private BroadcastReceiver receiver;
    private volatile boolean downloading = false;
    private File pendingInstall = null; // preuzet APK koji čeka dozvolu za instalaciju

    UpdateBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    private void js(String fn, String arg) {
        String quoted = JSONObject.quote(arg);
        webView.post(() -> webView.evaluateJavascript("window." + fn + " && window." + fn + "(" + quoted + ")", null));
    }

    /**
     * Preuzima APK u aplikaciju (bez DownloadManager-a, koji na nekim telefonima ne krene ili ne javi kraj),
     * javlja napredak u JS, pa pokreće instalaciju. Bez dozvole za instalaciju fajl ostaje preuzet, otvore se
     * postavke dozvole, a instalacija se nastavi kad se lovac vrati u aplikaciju (resumePendingInstall).
     */
    @JavascriptInterface
    public void preuzmi(String url) {
        if (!isTrustedApkUrl(url)) {
            js("__updateGreska", "Neispravna adresa nove verzije");
            return;
        }
        if (downloading) {
            js("__updateGreska", "Preuzimanje je već u toku");
            return;
        }
        downloading = true;
        new Thread(() -> {
            try { download(url); } finally { downloading = false; }
        }).start();
    }

    private void download(String url) {
        File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = activity.getFilesDir();
        File apk = new File(dir, "update.apk");
        File tmp = new File(dir, "update.apk.dio");
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            int code = c.getResponseCode();
            if (code != 200) {
                js("__updateGreska", "Server je vratio grešku " + code);
                return;
            }
            long total = c.getContentLengthLong();
            try (InputStream in = c.getInputStream(); FileOutputStream os = new FileOutputStream(tmp)) {
                byte[] buf = new byte[1 << 16];
                long done = 0;
                int lastPct = -1;
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    done += n;
                    if (total > 0) {
                        int pct = (int) (done * 100 / total);
                        if (pct != lastPct) { lastPct = pct; js("__updateNapredak", String.valueOf(pct)); }
                    }
                }
                os.getFD().sync();
            }
            if (apk.exists() && !apk.delete()) Log.w("Lovac", "Stari update.apk nije obrisan");
            if (!tmp.renameTo(apk)) {
                js("__updateGreska", "Fajl nove verzije nije sačuvan");
                return;
            }
            js("__updatePreuzeto", apk.getName());
            activity.runOnUiThread(() -> installOrAsk(apk));
        } catch (Exception e) {
            Log.e("Lovac", "Preuzimanje nove verzije", e);
            if (tmp.exists() && !tmp.delete()) Log.w("Lovac", "Privremeni fajl nije obrisan");
            js("__updateGreska", "Preuzimanje nije uspjelo (provjeri internet): " + e.getMessage());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void installOrAsk(File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            pendingInstall = apk;
            Toast.makeText(activity, "Dozvoli instalaciju iz ove aplikacije, pa se vrati: instalacija kreće sama", Toast.LENGTH_LONG).show();
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        pendingInstall = null;
        install(apk);
    }

    /** Poziva se iz MainActivity.onResume: lovac se vratio iz postavki dozvole. */
    void resumePendingInstall() {
        File apk = pendingInstall;
        if (apk == null || !apk.exists()) return;
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) return;
        pendingInstall = null;
        install(apk);
    }

    // Prihvata se samo APK sa GitHub release linka, bez obzira šta JS pošalje.
    static boolean isTrustedApkUrl(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        return "https".equals(u.getScheme())
                && "github.com".equals(u.getHost())
                && u.getPath() != null
                && u.getPath().endsWith("/releases/latest/download/app-debug.apk");
    }

    @JavascriptInterface
    public void downloadAndInstall(String url) {
        activity.runOnUiThread(() -> start(url));
    }

    private void start(String url) {
        if (!isTrustedApkUrl(url)) {
            Log.w("Lovac", "Odbijen URL za update: " + url);
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(activity, "Dozvolite instalaciju iz ove aplikacije, pa ponovo tapnite Ažuriraj", Toast.LENGTH_LONG).show();
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            Toast.makeText(activity, "Memorija nije dostupna", Toast.LENGTH_LONG).show();
            return;
        }
        File apk = new File(dir, "update.apk");
        if (apk.exists() && !apk.delete()) Log.w("Lovac", "Stari update.apk nije obrisan");

        DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
                .setTitle("LD Grmeč — nova verzija")
                .setMimeType(APK_MIME)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationUri(Uri.fromFile(apk));
        registerReceiver(apk);
        downloadId = dm.enqueue(req);
        Toast.makeText(activity, "Preuzimam novu verziju…", Toast.LENGTH_SHORT).show();
    }

    private void registerReceiver(File apk) {
        release();
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != downloadId) return;
                if (isSuccessful(id)) install(apk);
                else Toast.makeText(activity, "Preuzimanje nije uspjelo", Toast.LENGTH_LONG).show();
                release();
            }
        };
        ContextCompat.registerReceiver(activity, receiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
    }

    private boolean isSuccessful(long id) {
        DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (c == null || !c.moveToFirst()) return false;
            int col = c.getColumnIndex(DownloadManager.COLUMN_STATUS);
            return col >= 0 && c.getInt(col) == DownloadManager.STATUS_SUCCESSFUL;
        }
    }

    private void install(File apk) {
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", apk);
        Intent i = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, APK_MIME)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
    }

    void release() {
        if (receiver != null) {
            try {
                activity.unregisterReceiver(receiver);
            } catch (IllegalArgumentException ignored) {
                // već odjavljen
            }
            receiver = null;
        }
    }
}
