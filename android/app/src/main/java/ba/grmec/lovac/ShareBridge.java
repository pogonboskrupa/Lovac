package ba.grmec.lovac;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
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

    @JavascriptInterface
    public void shareText(String text) {
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        activity.runOnUiThread(() -> activity.startActivity(Intent.createChooser(send, "Podijeli")));
    }
}
