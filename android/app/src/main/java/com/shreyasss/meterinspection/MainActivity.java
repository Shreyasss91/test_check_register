package com.shreyasss.meterinspection;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabsIntent;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openMeterInspection();
    }

    private void openMeterInspection() {
        String url = BuildConfig.WEB_APP_URL;

        if (url.contains("REPLACE_WITH_DEPLOYMENT_ID")) {
            Toast.makeText(this,
                    "Configure the Apps Script Web App URL before building the APK.",
                    Toast.LENGTH_LONG).show();
            return;
        }

        try {
            CustomTabsIntent intent = new CustomTabsIntent.Builder().build();
            intent.launchUrl(this, Uri.parse(url));
        } catch (Exception e) {
            Toast.makeText(this,
                    "No compatible browser is available.",
                    Toast.LENGTH_LONG).show();
        }
    }
}
