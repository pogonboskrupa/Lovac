package ba.grmec.lovac;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/** AndroidKarte: uvoz offline karte (MBTiles/SQLiteDB) sa telefona, spisak i uklanjanje. */
public class KarteBridge {
    static final int REQ_KARTA = 61;
    private final Activity activity;
    private final WebView webView;

    KarteBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public void uvezi() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        activity.runOnUiThread(() -> activity.startActivityForResult(i, REQ_KARTA));
    }

    @JavascriptInterface
    public String spisak() {
        return MbtilesStore.list(activity);
    }

    @JavascriptInterface
    public boolean ukloni(String id) {
        return MbtilesStore.remove(activity, id);
    }

    private void js(String fn, String arg) {
        String quoted = JSONObject.quote(arg);
        webView.post(() -> webView.evaluateJavascript("window." + fn + " && window." + fn + "(" + quoted + ")", null));
    }

    private String displayName(Uri uri) {
        try (Cursor c = activity.getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception ignored) {
            // ime je samo za prikaz
        }
        return "karta.mbtiles";
    }

    // Kopira fajl u folder aplikacije u komadima (fajl može imati više GB) uz napredak u JS.
    void onResult(int resultCode, Intent data) {
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        new Thread(() -> {
            String name = displayName(uri).replaceAll("[^A-Za-z0-9._-]", "_");
            if (!name.endsWith(".mbtiles") && !name.endsWith(".sqlitedb")) {
                js("__karteGreska", "Izaberi .mbtiles ili .sqlitedb fajl");
                return;
            }
            File out = new File(MbtilesStore.dir(activity), name);
            File tmp = new File(out.getPath() + ".dio");
            long total = -1;
            try (Cursor c = activity.getContentResolver().query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int i = c.getColumnIndex(OpenableColumns.SIZE);
                    if (i >= 0) total = c.getLong(i);
                }
            } catch (Exception ignored) {
                // veličina je samo za napredak
            }
            try (InputStream in = activity.getContentResolver().openInputStream(uri);
                 FileOutputStream os = new FileOutputStream(tmp)) {
                byte[] buf = new byte[1 << 16];
                long done = 0;
                int lastPct = -1;
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    done += n;
                    if (total > 0) {
                        int pct = (int) (done * 100 / total);
                        if (pct != lastPct) { lastPct = pct; js("__karteNapredak", String.valueOf(pct)); }
                    }
                }
                os.getFD().sync();
            } catch (Exception e) {
                Log.e("Lovac", "Uvoz offline karte", e);
                if (!tmp.delete()) Log.w("Lovac", "Privremeni fajl nije obrisan");
                js("__karteGreska", "Kopiranje nije uspjelo: " + e.getMessage());
                return;
            }
            MbtilesStore.close(name);
            if (out.exists() && !out.delete()) Log.w("Lovac", "Stara karta nije obrisana");
            if (!tmp.renameTo(out)) {
                js("__karteGreska", "Fajl nije sačuvan");
                return;
            }
            try {
                js("__karteUvoz", MbtilesStore.info(activity, name).toString());
            } catch (Exception e) {
                MbtilesStore.remove(activity, name);
                js("__karteGreska", "Fajl nije ispravna MBTiles/SQLiteDB karta");
            }
        }).start();
    }
}
