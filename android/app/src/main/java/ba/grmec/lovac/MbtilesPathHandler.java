package ba.grmec.lovac;

import android.content.Context;
import android.webkit.WebResourceResponse;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;

/** Servira pločice offline karte na https://appassets.androidplatform.net/mbtiles/<id>/<z>/<x>/<y>. */
final class MbtilesPathHandler implements WebViewAssetLoader.PathHandler {
    private final Context ctx;

    MbtilesPathHandler(Context ctx) {
        this.ctx = ctx.getApplicationContext();
    }

    @Override
    public WebResourceResponse handle(@NonNull String path) {
        String[] p = path.split("/");
        if (p.length != 4) return notFound();
        try {
            int z = Integer.parseInt(p[1]);
            int x = Integer.parseInt(p[2]);
            int y = Integer.parseInt(p[3].replaceAll("\\..*$", ""));
            byte[] data = MbtilesStore.tile(ctx, p[0], z, x, y);
            if (data == null) return notFound();
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "max-age=86400");
            return new WebResourceResponse(MbtilesStore.mime(data), null, 200, "OK", h, new ByteArrayInputStream(data));
        } catch (NumberFormatException e) {
            return notFound();
        }
    }

    // Ne null: inače WebView pokuša mrežu za nepostojeću pločicu.
    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
}
