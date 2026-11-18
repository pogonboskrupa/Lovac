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
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;

/** AndroidUpdate: preuzimanje novog APK-a i pokretanje instalacije jednim tapom. */
public class UpdateBridge {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private final Activity activity;
    private long downloadId = -1;
    private BroadcastReceiver receiver;

    UpdateBridge(Activity activity) {
        this.activity = activity;
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
