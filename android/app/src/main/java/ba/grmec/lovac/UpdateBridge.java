package ba.grmec.lovac;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
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

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;

/** AndroidUpdate: preuzimanje novog APK-a i pokretanje instalacije jednim tapom. */
public class UpdateBridge {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final String INSTALL_ACTION = "ba.grmec.lovac.INSTALL_STATUS";
    private final Activity activity;
    private final WebView webView;
    private long downloadId = -1;
    private BroadcastReceiver receiver;
    private volatile boolean downloading = false;
    private File pendingInstall = null; // preuzet APK koji čeka dozvolu za instalaciju
    private BroadcastReceiver installReceiver;

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

    private File targetDir() {
        File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        return dir != null ? dir : activity.getFilesDir();
    }

    /** Dugme "Instaliraj preuzeto": instalacija već preuzetog APK-a bez ponovnog preuzimanja. */
    @JavascriptInterface
    public void instalirajPreuzeto() {
        activity.runOnUiThread(() -> {
            File apk = new File(targetDir(), "update.apk");
            if (!apk.exists() || apk.length() < 1_000_000) {
                js("__updateGreska", "Nema preuzete verzije na telefonu — preuzmi je ponovo.");
                return;
            }
            installOrAsk(apk);
        });
    }

    private void download(String url) {
        File dir = targetDir();
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
                long lastMb = -1;
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    done += n;
                    long mb = done / 1048576;
                    if (total > 0) {
                        int pct = (int) (done * 100 / total);
                        if (pct != lastPct) {
                            lastPct = pct;
                            js("__updateNapredak", String.valueOf(pct));
                            js("__updateStatus", "Preuzimam zadnju verziju… " + pct + " % (" + mb + " / " + (total / 1048576) + " MB)");
                        }
                    } else if (mb != lastMb) {
                        // Server nije javio veličinu: bez postotka, ali lovac vidi da preuzimanje ide.
                        lastMb = mb;
                        js("__updateStatus", "Preuzimam zadnju verziju… " + mb + " MB");
                    }
                }
                os.getFD().sync();
            }
            if (total > 0 && tmp.length() < total) {
                js("__updateGreska", "Preuzimanje je prekinuto prije kraja (" + tmp.length() / 1048576 + " od " + total / 1048576 + " MB). Pokušaj ponovo.");
                return;
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
        try {
            installViaSession(apk);
        } catch (Exception e) {
            Log.e("Lovac", "PackageInstaller nije uspio, probam ACTION_VIEW", e);
            installViaIntent(apk);
        }
    }

    /**
     * Instalacija kroz PackageInstaller sesiju: APK se predaje sistemu direktno (bez FileProvider-a i MIME tipa, koje
     * neki telefoni ne prihvate), a sistem pokaže svoj dijalog "Ažuriraj". Rezultat stiže u installReceiver.
     */
    private void installViaSession(File apk) throws Exception {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        int sessionId = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(sessionId);
        try {
            try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("update.apk", 0, apk.length())) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                session.fsync(out);
            }
            registerInstallReceiver();
            Intent intent = new Intent(INSTALL_ACTION).setPackage(activity.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pending = PendingIntent.getBroadcast(activity, sessionId, intent, flags);
            session.commit(pending.getIntentSender());
        } catch (Exception e) {
            session.abandon();
            throw e;
        } finally {
            session.close();
        }
    }

    private void registerInstallReceiver() {
        unregisterInstallReceiver();
        installReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    @SuppressWarnings("deprecation")
                    Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) {
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(confirm);
                    }
                    return;
                }
                unregisterInstallReceiver();
                if (status != PackageInstaller.STATUS_SUCCESS && status != PackageInstaller.STATUS_FAILURE_ABORTED) {
                    String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                    Log.w("Lovac", "Instalacija: status " + status + " " + msg);
                    js("__updateGreska", "Instalacija nije uspjela" + (msg != null ? " (" + msg + ")" : "") + ". Pokušaj \"Instaliraj preuzeto\".");
                }
            }
        };
        ContextCompat.registerReceiver(activity, installReceiver,
                new IntentFilter(INSTALL_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void unregisterInstallReceiver() {
        if (installReceiver != null) {
            try {
                activity.unregisterReceiver(installReceiver);
            } catch (IllegalArgumentException ignored) {
                // već odjavljen
            }
            installReceiver = null;
        }
    }

    private void installViaIntent(File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", apk);
            Intent i = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, APK_MIME)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
        } catch (Exception e) {
            Log.e("Lovac", "Instalacija nije pokrenuta", e);
            js("__updateGreska", "Instalacija se nije mogla pokrenuti: " + e.getMessage());
        }
    }

    void release() {
        unregisterInstallReceiver();
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
