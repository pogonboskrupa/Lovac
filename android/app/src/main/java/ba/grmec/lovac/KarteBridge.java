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
import java.io.RandomAccessFile;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.net.HttpURLConnection;
import java.net.URL;

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

    // Samo GitHub Release fajlovi karata (npr. teren.mbtiles); JS ne može tražiti proizvoljnu adresu.
    static boolean isTrustedMapUrl(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        String path = u.getPath();
        return "https".equals(u.getScheme()) && "github.com".equals(u.getHost()) && path != null
                && path.contains("/releases/download/") && (path.endsWith(".mbtiles") || path.endsWith(".sqlitedb"));
    }

    @JavascriptInterface
    public void preuzmi(String url, String naziv) {
        if (!isTrustedMapUrl(url) || !MbtilesStore.validId(naziv)) {
            js("__karteGreska", "Neispravna adresa karte");
            return;
        }
        // Dva istovremena preuzimanja istog fajla bi pisala u isti privremeni fajl i pokvarila kartu.
        if (!U_TOKU.add(naziv)) {
            js("__karteGreska", "Preuzimanje je već u toku");
            return;
        }
        new Thread(() -> {
            try { download(url, naziv); } finally { U_TOKU.remove(naziv); }
        }).start();
    }

    private static final java.util.Set<String> U_TOKU = java.util.Collections.synchronizedSet(new java.util.HashSet<>());

    // Preuzimanje velikog fajla (stotine MB). Jedna konekcija prema GitHub-ovom CDN-u je ograničena brzinom po konekciji,
    // pa se fajl, kad server podržava Range, preuzima u DIJELOVA paralelnih dijelova; svaki dio se sam nastavlja od mjesta
    // gdje je veza pukla. Bez Range podrške ide stari put (jedan tok). Napredak, brzina i preostalo vrijeme idu u JS.
    private static final int DIJELOVA = 4;
    private static final int POKUSAJA = 5;

    private static HttpURLConnection open(String url, String range) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        if (range != null) c.setRequestProperty("Range", range);
        return c;
    }

    // "bytes 0-0/552333312" -> 552333312; -1 ako server ne javlja ukupnu veličinu.
    static long totalFromContentRange(String header) {
        if (header == null) return -1;
        Matcher m = Pattern.compile("/(\\d+)\\s*$").matcher(header);
        return m.find() ? Long.parseLong(m.group(1)) : -1;
    }

    private void download(String url, String name) {
        File out = new File(MbtilesStore.dir(activity), name);
        File tmp = new File(out.getPath() + ".dio");
        try {
            HttpURLConnection probe = open(url, "bytes=0-0");
            int code = probe.getResponseCode();
            long total = code == 206 ? totalFromContentRange(probe.getHeaderField("Content-Range")) : probe.getContentLengthLong();
            probe.disconnect();
            if (code == 404) {
                js("__karteGreska", "Teren još nije objavljen (Release \"karte\" nema fajl " + name + ")");
                return;
            }
            if (code != 206 && code != 200) {
                js("__karteGreska", "Server je vratio grešku " + code);
                return;
            }
            File dir = MbtilesStore.dir(activity);
            if (total > 0 && dir.getUsableSpace() < total + total / 10) {
                js("__karteGreska", "Nema dovoljno prostora na telefonu za " + (total / 1048576) + " MB");
                return;
            }
            if (code == 206 && total > 8L * 1048576) downloadParallel(url, tmp, total);
            else downloadSingle(url, tmp);
            finishImport(name, tmp, out);
        } catch (Exception e) {
            Log.e("Lovac", "Preuzimanje karte", e);
            if (tmp.exists() && !tmp.delete()) Log.w("Lovac", "Privremeni fajl nije obrisan");
            js("__karteGreska", "Preuzimanje nije uspjelo (provjeri internet): " + e.getMessage());
        }
    }

    private void downloadSingle(String url, File tmp) throws Exception {
        HttpURLConnection c = open(url, null);
        try {
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
                        if (pct != lastPct) { lastPct = pct; js("__karteNapredak", String.valueOf(pct)); }
                    }
                }
                os.getFD().sync();
            }
        } finally {
            c.disconnect();
        }
    }

    private void downloadParallel(String url, File tmp, long total) throws Exception {
        try (RandomAccessFile raf = new RandomAccessFile(tmp, "rw")) { raf.setLength(total); }
        AtomicLong done = new AtomicLong();
        AtomicBoolean failed = new AtomicBoolean(false);
        final Exception[] error = new Exception[1];
        long part = (total + DIJELOVA - 1) / DIJELOVA;
        Thread[] workers = new Thread[DIJELOVA];
        for (int i = 0; i < DIJELOVA; i++) {
            final long start = i * part;
            final long end = Math.min(total, start + part) - 1;
            workers[i] = new Thread(() -> {
                try { downloadRange(url, tmp, start, end, done, failed); } catch (Exception e) {
                    failed.set(true);
                    synchronized (error) { if (error[0] == null) error[0] = e; }
                }
            });
            workers[i].start();
        }
        long t0 = System.currentTimeMillis();
        long lastDone = 0;
        long lastT = t0;
        double speed = 0;
        int lastPct = -1;
        while (true) {
            boolean alive = false;
            for (Thread w : workers) alive |= w.isAlive();
            long d = done.get();
            long now = System.currentTimeMillis();
            int pct = (int) (d * 100 / total);
            if (now - lastT >= 1000) {
                double inst = (d - lastDone) * 1000.0 / (now - lastT);
                speed = speed == 0 ? inst : speed * 0.7 + inst * 0.3; // glađenje
                lastDone = d;
                lastT = now;
                js("__karteBrzina", speedText(speed, total - d));
            }
            if (pct != lastPct) { lastPct = pct; js("__karteNapredak", String.valueOf(pct)); }
            if (!alive) break;
            Thread.sleep(250);
        }
        if (failed.get()) throw error[0] != null ? error[0] : new Exception("dio fajla nije preuzet");
        if (done.get() < total) throw new Exception("fajl nije cijel");
    }

    private void downloadRange(String url, File tmp, long start, long end, AtomicLong done, AtomicBoolean failed) throws Exception {
        long pos = start;
        int attempt = 0;
        while (pos <= end) {
            if (failed.get()) return;
            try {
                HttpURLConnection c = open(url, "bytes=" + pos + "-" + end);
                try {
                    if (c.getResponseCode() != 206) throw new Exception("server ne podržava nastavak (" + c.getResponseCode() + ")");
                    try (InputStream in = c.getInputStream(); RandomAccessFile raf = new RandomAccessFile(tmp, "rw")) {
                        raf.seek(pos);
                        byte[] buf = new byte[1 << 16];
                        int n;
                        while (pos <= end && (n = in.read(buf)) > 0) {
                            int len = (int) Math.min(n, end - pos + 1);
                            raf.write(buf, 0, len);
                            pos += len;
                            done.addAndGet(len);
                        }
                    }
                } finally {
                    c.disconnect();
                }
                attempt = 0;
            } catch (Exception e) {
                if (++attempt > POKUSAJA) throw e;
                Log.w("Lovac", "Dio karte se nastavlja (pokušaj " + attempt + ")", e);
                Thread.sleep(1500L * attempt);
            }
        }
    }

    // "3,4 MB/s · još 2 min"
    static String speedText(double bytesPerSec, long left) {
        if (bytesPerSec <= 0) return "";
        String mbs = String.format(java.util.Locale.ROOT, "%.1f", bytesPerSec / 1048576).replace('.', ',');
        long sec = (long) (left / bytesPerSec);
        String eta = sec >= 60 ? "još " + (sec + 59) / 60 + " min" : "još " + Math.max(1, sec) + " s";
        return mbs + " MB/s · " + eta;
    }

    // Zamjenjuje staru kartu novom tek kad je fajl cijel; neispravan fajl se uklanja.
    private void finishImport(String name, File tmp, File out) {
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
            finishImport(name, tmp, out);
        }).start();
    }
}
