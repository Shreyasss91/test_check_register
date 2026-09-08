# Meter Inspection Android APK

This is a thin Android launcher for the existing Google Apps Script Meter Inspection web app.

## Why Custom Tabs instead of WebView?

The APK deliberately opens the deployed Apps Script URL in an Android Custom Tab. The web app relies on Google account identity and Apps Script session behavior. Google documents that Google Sign-In is not supported inside Android WebViews and recommends Chrome Custom Tabs on Android for sign-in flows.

The APK therefore does **not** duplicate the Apps Script form or business logic. The Apps Script project remains the source of truth.

## Build locally

Install Android Studio with JDK 17 and Android SDK 36, then from this directory run:

```text
gradle :app:assembleRelease -PMETER_WEB_APP_URL="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

The APK is generated at:

```text
app/build/outputs/apk/release/app-release.apk
```

## Build from GitHub Actions

Open **Actions → Build Meter Inspection APK → Run workflow** and provide the deployed Apps Script Web App URL, including `/exec`.

The workflow builds the release APK and uploads `meter-inspection-apk` as a workflow artifact.

## Important

The URL used here must be the **deployed Web App URL**, not the Apps Script editor/project URL. Keep the existing deployment configured as documented in `docs/deployment.md`.

The current web app is configured for **Anyone with a Google account**. Inspectors should therefore use their Google account when the Custom Tab opens the form so the existing Team/guest identity logic continues to work.
