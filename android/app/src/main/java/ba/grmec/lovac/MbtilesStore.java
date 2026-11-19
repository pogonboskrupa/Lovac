package ba.grmec.lovac;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

/**
 * Offline karte iz MBTiles (zoom_level/tile_column/tile_row, TMS) i RMaps/MOBAC SQLiteDB (x/y/z, z = 17 - zoom).
 * Fajl se čita direktno iz SQLite-a, pločicu po pločicu — nikad cijeli u memoriju.
 */
final class MbtilesStore {
    private static final Map<String, SQLiteDatabase> OPEN = new HashMap<>();
    private static final Map<String, Boolean> IS_RMAPS = new HashMap<>();

    private MbtilesStore() {
    }

    static File dir(Context ctx) {
        File d = new File(ctx.getFilesDir(), "karte");
        if (!d.exists() && !d.mkdirs()) Log.w("Lovac", "Folder za karte nije napravljen");
        return d;
    }

    static boolean validId(String id) {
        return id != null && id.matches("[A-Za-z0-9._-]{1,80}") && !id.startsWith(".");
    }

    private static synchronized SQLiteDatabase db(Context ctx, String id) {
        SQLiteDatabase d = OPEN.get(id);
        if (d != null && d.isOpen()) return d;
        File f = new File(dir(ctx), id);
        if (!f.exists()) return null;
        d = SQLiteDatabase.openDatabase(f.getPath(), null,
                SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS);
        OPEN.put(id, d);
        IS_RMAPS.put(id, hasColumn(d, "tiles", "image"));
        return d;
    }

    static synchronized void close(String id) {
        SQLiteDatabase d = OPEN.remove(id);
        IS_RMAPS.remove(id);
        if (d != null) d.close();
    }

    private static boolean hasColumn(SQLiteDatabase d, String table, String col) {
        try (Cursor c = d.rawQuery("PRAGMA table_info(" + table + ")", null)) {
            while (c.moveToNext()) if (col.equalsIgnoreCase(c.getString(1))) return true;
        }
        return false;
    }

    static byte[] tile(Context ctx, String id, int z, int x, int y) {
        if (!validId(id)) return null;
        SQLiteDatabase d = db(ctx, id);
        if (d == null) return null;
        boolean rmaps = Boolean.TRUE.equals(IS_RMAPS.get(id));
        String sql = rmaps
                ? "SELECT image FROM tiles WHERE x=? AND y=? AND z=?"
                : "SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?";
        String[] args = rmaps
                ? new String[]{String.valueOf(x), String.valueOf(y), String.valueOf(17 - z)}
                : new String[]{String.valueOf(z), String.valueOf(x), String.valueOf((1 << z) - 1 - y)};
        try (Cursor c = d.rawQuery(sql, args)) {
            return c.moveToFirst() ? c.getBlob(0) : null;
        } catch (Exception e) {
            Log.w("Lovac", "Pločica iz offline karte", e);
            return null;
        }
    }

    static String mime(byte[] b) {
        if (b.length > 3 && (b[0] & 0xff) == 0x89 && b[1] == 'P') return "image/png";
        if (b.length > 2 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8) return "image/jpeg";
        if (b.length > 11 && b[0] == 'R' && b[8] == 'W') return "image/webp";
        return "application/octet-stream";
    }

    private static String meta(SQLiteDatabase d, String key) {
        try (Cursor c = d.rawQuery("SELECT value FROM metadata WHERE name=?", new String[]{key})) {
            return c.moveToFirst() ? c.getString(0) : null;
        } catch (Exception e) {
            return null;
        }
    }

    static JSONObject info(Context ctx, String id) throws JSONException {
        SQLiteDatabase d = db(ctx, id);
        JSONObject o = new JSONObject().put("id", id);
        if (d == null) return o.put("greska", "nema fajla");
        boolean rmaps = Boolean.TRUE.equals(IS_RMAPS.get(id));
        o.put("format", rmaps ? "sqlitedb" : "mbtiles");
        o.put("velicina", new File(dir(ctx), id).length());
        int min;
        int max;
        String q = rmaps ? "SELECT MIN(z), MAX(z) FROM tiles" : "SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles";
        try (Cursor c = d.rawQuery(q, null)) {
            c.moveToFirst();
            min = c.getInt(0);
            max = c.getInt(1);
        }
        if (rmaps) {
            int a = 17 - max;
            max = 17 - min;
            min = a;
        }
        o.put("minzoom", min).put("maxzoom", max);
        if (!rmaps) {
            String name = meta(d, "name");
            String bounds = meta(d, "bounds");
            if (name != null) o.put("naziv", name);
            if (bounds != null) o.put("bounds", bounds);
        }
        if (!o.has("naziv")) o.put("naziv", id.replaceAll("\\.(mbtiles|sqlitedb)$", ""));
        return o;
    }

    static String list(Context ctx) {
        JSONArray arr = new JSONArray();
        File[] files = dir(ctx).listFiles();
        if (files != null) {
            for (File f : files) {
                String n = f.getName();
                if (!n.endsWith(".mbtiles") && !n.endsWith(".sqlitedb")) continue;
                try {
                    arr.put(info(ctx, n));
                } catch (Exception e) {
                    Log.w("Lovac", "Offline karta " + n, e);
                }
            }
        }
        return arr.toString();
    }

    static boolean remove(Context ctx, String id) {
        if (!validId(id)) return false;
        close(id);
        return new File(dir(ctx), id).delete();
    }
}
