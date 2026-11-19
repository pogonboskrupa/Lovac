package ba.grmec.lovac;

import android.app.Activity;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** AndroidPrint: štampa HTML izvještaja (i "Sačuvaj kao PDF"); WebView nema pouzdan window.print. */
public class PrintBridge {
    private final Activity activity;
    // WebView mora živjeti dok sistem ne preuzme dokument, inače štampa bude prazna.
    private WebView printView;

    PrintBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void printHtml(String html, String jobName) {
        activity.runOnUiThread(() -> {
            try {
                WebView w = new WebView(activity);
                w.getSettings().setJavaScriptEnabled(false);
                w.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                        String job = jobName == null || jobName.isEmpty() ? "LD Grmeč" : jobName;
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(job);
                        pm.print(job, adapter, new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                    }
                });
                printView = w;
                w.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                Log.e("Lovac", "Štampa nije uspjela", e);
            }
        });
    }
}
