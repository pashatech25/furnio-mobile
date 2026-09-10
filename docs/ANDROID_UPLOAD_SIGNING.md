# Android upload signing

The dedicated upload key is stored only in `.local-signing/` (ignored by Git). The directory is owner-only; the keystore and credential file are mode 0600. Back up that directory securely outside Git before relying on this key for ongoing releases. Do not replace or regenerate it after the first Play upload.

`node scripts/build-android-store.mjs --production` pins the existing production public configuration and supplies signing credentials to Gradle at build time. It never uploads or submits the bundle. It verifies the JAR signature and matches the signer fingerprint to the upload keystore before copying the output. Emulator builds retain their separate debug signing behavior.

First local production bundle built successfully on 10 September 2026. `jarsigner` verified the signature; its signer is `CN=Furnio Upload`, not Android Debug. Self-signed upload certificates are expected. Store acceptance, privacy/deletion completion and review submission are separate gates. Rebuild after subsequent app changes; this first bundle retains app version 0.1.0 and is not the final 1.0 release candidate.

Output: `output/store/furnio-production.aab` (ignored). The Expo config plugin persists signing integration through future native generation. No production database, web logic or deployed Worker changes are included.
