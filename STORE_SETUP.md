# Getting WFD to testers (TestFlight and Google Play)

Everything below is a one-time setup. After it, a new test build is: **GitHub → Actions → Release to testers → Run workflow**.

## iPhone (TestFlight)
1. Join the **Apple Developer Program** ($99/year) at developer.apple.com/programs with your Apple ID.
2. In **App Store Connect → Apps → +**, create the app: name *WFD — What's for Dinner*, bundle ID **com.jscottii.wfd**, SKU `wfd`.
3. **App Store Connect → Users and Access → Integrations → App Store Connect API → +**: create a key with **App Manager** access. Download the `.p8` file (you only get one chance). Note the **Key ID** and **Issuer ID**.
4. Find your **Team ID** at developer.apple.com → Membership details.
5. In GitHub → **jscottii/wfd → Settings → Secrets and variables → Actions**, add:
   - `ASC_KEY_ID` — the Key ID
   - `ASC_ISSUER_ID` — the Issuer ID
   - `ASC_KEY_P8_BASE64` — the .p8 file, base64-encoded (Mac: `base64 -i AuthKey_XXXX.p8 | pbcopy`)
   - `APPLE_TEAM_ID` — the Team ID
6. Run the workflow. About 15 minutes after it finishes, the build appears in **TestFlight**. Add yourself (and up to 100 people on your team) as **internal testers**; they install the TestFlight app and get an invite.
7. For testers outside your team (**external testing**), fill in the test info and submit the build for Beta App Review (usually a day).

## Android (Google Play internal testing)
1. Create a **Google Play Console** developer account ($25 once) at play.google.com/console. New personal accounts must run a **closed test with at least 12 testers for 14 days** before the app can go public; internal testing has no such wait.
2. **Create app**: *WFD — What's for Dinner*, app, free.
3. Make an **upload key** (once, keep it safe — it's how Google knows updates are yours):
   `keytool -genkeypair -v -keystore upload.jks -alias wfd -keyalg RSA -keysize 2048 -validity 10000`
4. Add GitHub secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -i upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`wfd`), `ANDROID_KEY_PASSWORD`.
5. Run the workflow once. Download **wfd-android-release** (the `.aab`) from the run's Artifacts and upload it by hand in **Testing → Internal testing → Create release** (Google requires the very first upload to be manual). Opt in to **Play App Signing** when asked.
6. For automatic uploads after that: Google Cloud Console → create a **service account**, download its JSON key; in Play Console → **Users and permissions → Invite** that service-account email with *Release to testing tracks*. Add the JSON as the `PLAY_SERVICE_ACCOUNT_JSON` secret.
7. In **Internal testing → Testers**, add an email list; send testers the opt-in link.

## Store listing (needed before either store goes public)
- Privacy policy: https://jscottii.github.io/wfd/privacy.html · Support: https://jscottii.github.io/wfd/support.html
- Screenshots (iPhone 6.7" and 6.5"; Android phone), a 1024×1024 icon (already in `app/resources`), a short and full description.
- Data-safety / privacy answers: email (account), recipes/plans/pantry (app function), approximate location (store search, not tracked). If ads are switched on: device ID for advertising, and Apple's tracking prompt.
- Account deletion is in the app (More → Settings → Delete account), which both stores require.
