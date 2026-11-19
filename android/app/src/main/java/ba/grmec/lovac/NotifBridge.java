package ba.grmec.lovac;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/** AndroidNotif: obavijest i vibracija (WebView nema window.Notification). Radi dok je app živa. */
public class NotifBridge {
    static final String CHANNEL = "sos";
    private static final long[] PATTERN = {0, 600, 300, 600, 300, 1200};
    private final Activity activity;
    private int nextId = 100;

    NotifBridge(Activity activity) {
        this.activity = activity;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "SOS i zajednički lov", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setVibrationPattern(PATTERN);
            activity.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    @JavascriptInterface
    public void prikazi(String naslov, String tekst) {
        vibriraj();
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;
        Intent open = new Intent(activity, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(activity, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(activity, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_trag)
                .setContentTitle(naslov)
                .setContentText(tekst)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(tekst))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVibrate(PATTERN)
                .setAutoCancel(true)
                .setContentIntent(pi);
        NotificationManagerCompat.from(activity).notify(nextId++, b.build());
    }

    @JavascriptInterface
    public void vibriraj() {
        Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(PATTERN, -1));
        else v.vibrate(PATTERN, -1);
    }
}
