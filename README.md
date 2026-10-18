# Reviva — Photo, Video & Document Restoration Studio

Restores damaged, blurry, and black-and-white photos to color; upscales images;
repairs videos the same way; and reads/transcribes old documents — all in the
browser, nothing uploaded.

## Run locally (web)

```bash
npm install
npm run dev
```

## Build the web app

```bash
npm run build
```

## Android APK

This project is wrapped as a native Android app with
[Capacitor](https://capacitorjs.com). There are two ways to build an APK.

### Option 1 — GitHub Actions (recommended)

1. Create a new repository on GitHub and push this project:

   ```bash
   git init
   git add .
   git commit -m "Reviva restoration studio"
   git branch -M main
   git remote add origin https://github.com/<your-user>/<your-repo>.git
   git push -u origin main
   ```

2. The **Build Android APK** workflow (`.github/workflows/build-apk.yml`) runs
   automatically on every push to `main`/`master`.

3. Open the workflow run on GitHub → scroll to **Artifacts** → download
   `reviva-apk`. Inside is `reviva.apk`.

4. Transfer `reviva.apk` to your Android phone and install it (enable
   "Install from unknown sources" when prompted).

You can also trigger the build manually: Actions tab → **Build Android APK** →
**Run workflow**.

### Option 2 — Build locally

Requires Android Studio (or JDK 17 + Android SDK) installed.

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
# APK at android/app/build/outputs/apk/debug/app-debug.apk
```

For a release-signed APK, open the project in Android Studio or configure a
keystore per the [Android signing guide](https://developer.android.com/build/building-cmdline#sign_cmdline).

## Project structure

```
src/
  components/    React UI (Studio, VideoStudio, DocumentStudio, Gallery)
  lib/           imageProcessing, videoProcessing, ocr, gallery (IndexedDB)
android/         Capacitor Android shell
.github/workflows/build-apk.yml   CI that produces the APK
```
