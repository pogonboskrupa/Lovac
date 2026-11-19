package ba.grmec.lovac;

import android.content.Context;
import android.location.Location;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Fajl-bafer GPS tačaka (jedna JSON linija po tački). Piše ga servis, čita JS od zadnjeg pomaka.
 * Preživljava ugašen ekran, ubijen WebView i ubijen proces.
 */
final class GpsBuffer {
    private static final String FILE = "gps-buffer.jsonl";
    private static final int MAX_READ = 512 * 1024;

    private GpsBuffer() {
    }

    private static File file(Context ctx) {
        return new File(ctx.getFilesDir(), FILE);
    }

    static String toJson(Location l) {
        String alt = l.hasAltitude() ? String.format(Locale.US, "%.1f", l.getAltitude()) : "null";
        String spd = l.hasSpeed() ? String.format(Locale.US, "%.2f", l.getSpeed()) : "null";
        String brg = l.hasBearing() ? String.format(Locale.US, "%.1f", l.getBearing()) : "null";
        float acc = l.hasAccuracy() ? l.getAccuracy() : 999f;
        return String.format(Locale.US,
                "{\"t\":%d,\"lat\":%.7f,\"lon\":%.7f,\"acc\":%.1f,\"alt\":%s,\"spd\":%s,\"brg\":%s}",
                l.getTime(), l.getLatitude(), l.getLongitude(), acc, alt, spd, brg);
    }

    static synchronized void append(Context ctx, Location l) {
        try (FileOutputStream out = new FileOutputStream(file(ctx), true)) {
            out.write((toJson(l) + "\n").getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (IOException e) {
            Log.e("Lovac", "Upis GPS tačke nije uspio", e);
        }
    }

    /** Vraća {"next":pomak,"pts":[...]} sa cijelim linijama od pomaka. */
    static synchronized String read(Context ctx, long offset) {
        File f = file(ctx);
        if (!f.exists()) return "{\"next\":0,\"pts\":[]}";
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            long len = raf.length();
            // Bafer je u međuvremenu obrisan: kreni od početka.
            if (offset < 0 || offset > len) offset = 0;
            int n = (int) Math.min(MAX_READ, len - offset);
            byte[] buf = new byte[n];
            raf.seek(offset);
            raf.readFully(buf);
            int lastNl = -1;
            for (int i = n - 1; i >= 0; i--) {
                if (buf[i] == '\n') {
                    lastNl = i;
                    break;
                }
            }
            if (lastNl < 0) return "{\"next\":" + offset + ",\"pts\":[]}";
            String chunk = new String(buf, 0, lastNl, StandardCharsets.UTF_8).trim();
            String pts = chunk.isEmpty() ? "" : chunk.replace("\n", ",");
            return "{\"next\":" + (offset + lastNl + 1) + ",\"pts\":[" + pts + "]}";
        } catch (IOException e) {
            Log.e("Lovac", "Čitanje GPS bafera nije uspjelo", e);
            return "{\"next\":" + offset + ",\"pts\":[]}";
        }
    }

    static synchronized void clear(Context ctx) {
        File f = file(ctx);
        if (f.exists() && !f.delete()) Log.w("Lovac", "GPS bafer nije obrisan");
    }
}
