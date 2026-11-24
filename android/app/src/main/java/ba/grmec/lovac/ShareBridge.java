package ba.grmec.lovac;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** AndroidShare: dijeljenje fajla (GPX/KML/CSV) i teksta; WebView nema pouzdan navigator.share. */
public class ShareBridge {
    private final Activity activity;

    ShareBridge(Activity activity) {
        this.activity = activity;
    }

    static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (n.isEmpty() || n.startsWith(".")) n = "fajl" + n;
        return n.length() > 80 ? n.substring(n.length() - 80) : n;
    }

    @JavascriptInterface
    public void shareFile(String name, String mime, String content) {
        try {
            File dir = new File(activity.getCacheDir(), "podijeli");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("Nema mjesta za fajl");
            File f = new File(dir, safeName(name));
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", f);
            Intent send = new Intent(Intent.ACTION_SEND)
                    .setType(mime)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Podijeli");
            activity.runOnUiThread(() -> activity.startActivity(chooser));
        } catch (Exception e) {
            Log.e("Lovac", "Dijeljenje fajla", e);
            activity.runOnUiThread(() -> Toast.makeText(activity, "Dijeljenje nije uspjelo", Toast.LENGTH_LONG).show());
        }
    }

    /**
     * Sačuva fajl u Preuzimanja/Lovac (Android 10+, MediaStore, bez dozvole za pohranu).
     * Na starijem Androidu (ili kad upis ne uspije) otvara dijeljenje, pa lovac bira gdje ga čuva.
     * Vraća "preuzimanja" ili "dijeljenje".
     */
    @JavascriptInterface
    public String sacuvaj(String name, String mime, String content) {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver resolver = activity.getContentResolver();
            Uri uri = null;
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, safeName(name));
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Lovac");
                v.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IOException("Preuzimanja nisu dostupna");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IOException("Fajl se ne može otvoriti");
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, done, null, null);
                activity.runOnUiThread(() -> Toast.makeText(activity, "Sačuvano u Preuzimanja/Lovac", Toast.LENGTH_LONG).show());
                return "preuzimanja";
            } catch (Exception e) {
                Log.e("Lovac", "Čuvanje u Preuzimanja", e);
                if (uri != null) {
                    try { resolver.delete(uri, null, null); } catch (Exception ignored) { /* nedovršen fajl */ }
                }
            }
        }
        shareFile(name, mime, content);
        return "dijeljenje";
    }

    @JavascriptInterface
    public void shareText(String text) {
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        activity.runOnUiThread(() -> activity.startActivity(Intent.createChooser(send, "Podijeli")));
    }
}
