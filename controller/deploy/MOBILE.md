# 📱 SecureOps Mobile — Android & iOS Build Guide

There are **two ways** to put SecureOps on a phone, each with its own trade-off. Start with PWA — it covers 90% of use cases with zero build infrastructure.

---

## Option 1 — PWA (Recommended, 0 build)

The React app is now a **Progressive Web App**. Any modern browser will offer to install it.

### Android (Chrome / Edge / Brave / Samsung Internet)
1. Visit `https://<your-server>/` on the phone.
2. Tap the browser menu → **"Install app"** (or "Add to Home Screen").
3. SecureOps gets a real launcher icon, runs full-screen, works offline-cached.

### iOS (Safari)
1. Open `https://<your-server>/` in **Safari** (not Chrome — Apple restriction).
2. Tap the **Share** button → **"Add to Home Screen"**.
3. The icon appears on the home screen and runs full-screen without browser chrome.

> ⚠️  iOS only supports PWA install via Safari and requires HTTPS. Use the Cloudflare Tunnel method in the README if you don't have a real domain yet.

**That's it.** No app store, no signing, no review process. Updates happen automatically when you deploy.

---

## Option 2 — Native APK / IPA (Capacitor)

For a true installable app on Play Store / TestFlight, build a native shell that hosts the React app inside a WebView via **Capacitor**.

### Prerequisites
| Target  | Required                                                                 |
|---------|--------------------------------------------------------------------------|
| Android | Android Studio + JDK 17, Android SDK 34, Gradle (bundled)                |
| iOS     | macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`), Apple ID     |

### One-time setup (any platform)

```bash
cd frontend

# 1) Install JS dependencies (Capacitor is already in package.json)
npm install

# 2) Configure the API URL the app will hit
echo "VITE_API_BASE_URL=https://secureops.yourdomain.com" > .env.production

# 3) Build the web bundle
npm run build

# 4) Add native platforms (creates ./android and ./ios folders)
npx cap add android        # only if you want Android
npx cap add ios            # only if you want iOS (mac only)

# 5) Sync the build into the native projects
npx cap sync
```

### Build Android APK

```bash
# Easiest: open in Android Studio and click Run
npm run cap:android        # opens Android Studio

# Or build APK from the command line:
cd android
./gradlew assembleDebug                   # → android/app/build/outputs/apk/debug/app-debug.apk
# For release:
./gradlew assembleRelease                  # requires a signing keystore — see below
```

#### Signing the release APK

```bash
# Generate a keystore (do this ONCE and keep it forever — losing it means losing
# the ability to update the published app on the Play Store)
keytool -genkey -v -keystore frontend/android/keystore/secureops.keystore \
        -alias secureops -keyalg RSA -keysize 2048 -validity 10000
```

Add the keystore details to `frontend/android/key.properties`:
```
storePassword=...
keyPassword=...
keyAlias=secureops
storeFile=keystore/secureops.keystore
```

Then `./gradlew assembleRelease` produces a signed APK at
`android/app/build/outputs/apk/release/app-release.apk` — sideload it or
upload to Google Play Console.

### Build iOS IPA

```bash
npm run cap:ios            # opens Xcode
```
Inside Xcode:
1. Select the **App** target → **Signing & Capabilities**, pick your Team.
2. Bump the bundle version if you've published before.
3. **Product → Archive**, then **Distribute App** → choose TestFlight or Ad-Hoc.

### Update the app after backend changes
```bash
cd frontend
npm run build && npx cap sync
# Then re-open Android Studio / Xcode and re-archive.
```

---

## Picking between PWA and Native

| Question                                           | PWA   | Native |
|----------------------------------------------------|-------|--------|
| Need to publish on App Store / Play Store?         | ❌    | ✅     |
| Want updates without app-store review?             | ✅    | ❌     |
| Need push notifications on iOS?                    | ❌    | ✅     |
| Need camera / fingerprint / device sensors?        | partial | ✅   |
| Setup time                                          | 0 min | 1–2 hours |
| Maintenance overhead                                | none  | medium |

**Recommendation for SecureOps:** stick with **PWA** unless your university IT requires distribution via Play Store.

---

## Troubleshooting

**Android app shows a white screen**
→ The bundled HTML can't reach the backend.
   1. Open the app, log in via the in-app Settings → Server URL flow.
   2. Or rebuild with `VITE_API_BASE_URL=…` in `.env.production`.

**iOS "Add to Home Screen" missing**
→ You must use Safari (not Chrome/Brave). The site must be HTTPS.

**Android: "Cleartext HTTP traffic not permitted"**
→ Either deploy with HTTPS (recommended) or keep `cleartext: true` in
   `capacitor.config.json` — already set in this repo.

**`certbot --nginx` fails to issue certificate**
→ The domain must point to your server (check DNS A record). For local-only
   deployments, use **Cloudflare Tunnel** — see `deploy-prod.sh` and
   `cloudflared-config.yml`.
