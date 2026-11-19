package ba.grmec.lovac;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/**
 * AndroidSms: otvara SMS aplikaciju sa brojevima i tekstom (SOS bez interneta).
 * Lovac sam pritisne "Pošalji", pa aplikaciji ne treba dozvola za slanje SMS-a.
 */
public class SmsBridge {
    private final Activity activity;

    SmsBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void posalji(String brojevi, String tekst) {
        String clean = brojevi == null ? "" : brojevi.replaceAll("[^0-9+;]", "");
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + clean)).putExtra("sms_body", tekst);
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(i);
            } catch (Exception e) {
                Log.e("Lovac", "SMS aplikacija nije dostupna", e);
                Toast.makeText(activity, "SMS aplikacija nije dostupna", Toast.LENGTH_LONG).show();
            }
        });
    }
}
