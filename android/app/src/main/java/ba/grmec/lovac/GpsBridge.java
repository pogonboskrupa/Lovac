package ba.grmec.lovac;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;

import androidx.core.content.ContextCompat;

/** AndroidGps: pokretanje/zaustavljanje servisa i čitanje GPS bafera iz JS-a. */
public class GpsBridge {
    static final int REQ_PERMISSIONS = 42;
    private final Activity activity;

    GpsBridge(Activity activity) {
        this.activity = activity;
    }

    private boolean granted(String perm) {
        return ContextCompat.checkSelfPermission(activity, perm) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public String start() {
        if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            activity.runOnUiThread(() -> activity.requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_PERMISSIONS));
            return "dozvola";
        }
        if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS)) {
            activity.runOnUiThread(() -> activity.requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERMISSIONS));
        }
        try {
            ContextCompat.startForegroundService(activity, new Intent(activity, GpsService.class));
            return "ok";
        } catch (Exception e) {
            Log.e("Lovac", "Start GPS servisa", e);
            return "greska: " + e.getMessage();
        }
    }

    @JavascriptInterface
    public void stop() {
        activity.stopService(new Intent(activity, GpsService.class));
    }

    @JavascriptInterface
    public boolean isRunning() {
        return GpsService.running;
    }

    // JS broj stiže kao double; pomak je u bajtovima.
    @JavascriptInterface
    public String read(double offset) {
        return GpsBuffer.read(activity, (long) offset);
    }

    @JavascriptInterface
    public void clear() {
        GpsBuffer.clear(activity);
    }

    @JavascriptInterface
    public boolean isIgnoringBattery() {
        PowerManager pm = (PowerManager) activity.getSystemService(Activity.POWER_SERVICE);
        return pm.isIgnoringBatteryOptimizations(activity.getPackageName());
    }

    @SuppressLint("BatteryLife")
    @JavascriptInterface
    public void requestBatteryExemption() {
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception e) {
                Log.w("Lovac", "Dijalog izuzeća od baterije nije dostupan, otvaram postavke", e);
                openBatterySettingsNow();
            }
        });
    }

    /** Vodi direktno u sistemski spisak "Optimizacija baterije"; ako ga uređaj nema, u postavke aplikacije. */
    @JavascriptInterface
    public void openBatterySettings() {
        activity.runOnUiThread(this::openBatterySettingsNow);
    }

    private void openBatterySettingsNow() {
        try {
            activity.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        } catch (Exception e) {
            try {
                activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception e2) {
                Log.w("Lovac", "Postavke baterije nisu dostupne", e2);
            }
        }
    }
}
