# Plant Survey (Android)

A standalone, offline survey app for a plot: measure points by distance and bearing, record heights,
see the plan, and export the survey as a `.sitescan` file. It needs no network to survey. Only the
updater uses the network.

Status: MVP for device testing. Not yet a public release. See [TODO.md](../../TODO.md) for what is next.

## What it does

- **Sites.** Create, open, and delete surveys. Stored as JSON on the phone (`files/sites/`).
- **Survey.** The first point is the origin. Each later point is measured as a distance and a bearing from
  the point before it, with an optional height. The app shows the plan (north up), area, perimeter, and
  the height range.
- **Export.** Save a `.sitescan` to `Downloads/Plant Survey`, or share it through the system share sheet.
  The archive holds `manifest.json` (with SHA-256 for each file), `site.json`, `points.csv` and `README.txt`.
- **Updates.** Shows the installed and the newest published version. Modes: Manual (default), Download only,
  Download and install. Downloads are saved to `Downloads/Plant Survey` and can be shared.

## Updater rules

- Manual is the default. Nothing is checked or downloaded until you tap a button.
- In the two automatic modes the app checks GitHub at launch, at most once a day. When a new version is
  found it asks first. Downloading and installing always needs your yes.
- The source is the repository's GitHub releases tagged `android-v<version>` with an `.apk` asset.
- The downloaded APK must be this app's package and must not be older than the release it came from.
- **Android decides whether an install is silent.** The app asks the system installer not to prompt.
  Android still shows its own confirmation unless this app is the device owner or the installing app
  owns the update. A fully silent install is not possible for a normally installed app.
- An update installs over the old one only if it is signed with the same key. Builds on the test
  phone use this machine's debug key, so they update each other.

## Build and test

Requirements: JDK 17, Android SDK (platform 35, build-tools 35), `apps/android/local.properties` with `sdk.dir`.

```bash
cd apps/android
./gradlew testDebugUnitTest assembleDebug
```

The APK is at `app/build/outputs/apk/debug/app-debug.apk`. Install it over wireless debugging:

```bash
adb connect <phone-tailscale-ip>:<port>
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Release

Version numbers live in `gradle.properties` (`appVersionName`, `appVersionCode`). Bump both before a release.
Releases are created with `gh` from this machine, so they carry the same debug key as the phone:

```bash
./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk "PlantSurvey-<version>.apk"
gh release create android-v<version> "PlantSurvey-<version>.apk" --title "Plant Survey <version>" --notes "<notes>"
```

Do not commit keystores. For a public release, create a separate release key outside the repository, and
note that builds signed with a different key cannot update an install signed with another key.
