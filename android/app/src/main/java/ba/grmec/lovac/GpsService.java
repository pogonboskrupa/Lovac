package ba.grmec.lovac;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/** Foreground servis koji snima GPS u GpsBuffer dok traje bar jedno snimanje. */
public class GpsService extends Service implements LocationListener {
    static final String CHANNEL = "snimanje";
    private static final int NOTIF_ID = 7;
    private static final long MIN_TIME_MS = 2000;
    static volatile boolean running = false;

    private LocationManager lm;
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (running) return START_STICKY;
        createChannel();
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_trag)
                .setContentTitle("Snimanje traga")
                .setContentText("LD Grmeč snima trag i kad je ekran ugašen")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pi)
                .build();
        try {
            int type = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0;
            ServiceCompat.startForeground(this, NOTIF_ID, n, type);
        } catch (Exception e) {
            // Npr. Android 12+ ne dozvoljava start iz pozadine nakon što je sistem ubio proces.
            Log.e("Lovac", "Foreground servis nije pokrenut", e);
            stopSelf();
            return START_NOT_STICKY;
        }

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lovac:snimanje");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(12 * 60 * 60 * 1000L);

        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w("Lovac", "Nema dozvole za lokaciju");
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, MIN_TIME_MS, 0f, this, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException e) {
            Log.e("Lovac", "GPS nije dostupan", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        Log.i("Lovac", "GPS servis pokrenut");
        return START_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Snimanje traga", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Obavijest dok se snima trag");
        getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    @Override
    public void onLocationChanged(Location location) {
        GpsBuffer.append(this, location);
    }

    // Na Androidu 10 i starijem ove metode nisu default: bez njih AbstractMethodError.
    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {
    }

    @Override
    public void onProviderEnabled(String provider) {
    }

    @Override
    public void onProviderDisabled(String provider) {
    }

    @Override
    public void onDestroy() {
        running = false;
        if (lm != null) lm.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        Log.i("Lovac", "GPS servis zaustavljen");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
