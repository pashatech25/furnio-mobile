# Physical iPhone login transition crash — September 10, 2026

Owner reported sign out → close → reopen → sign in crashes, then reopening restores the signed-in account.

Downloaded device crash reports at 01:44:40 and 01:45:07 into ignored output files. Both are SIGABRT through RCTExceptionsManager.reportFatal (JavaScript fatal), unlike the earlier iOS scene lifecycle launch trap. Reports do not contain the JavaScript exception message, so exact attribution is not yet proven.

Found an unsafe cleanup in TrialBadge: useAudioPlayer auto-releases its native shared object in an earlier effect cleanup, then our later cleanup calls player.pause(). Wrapped decorative audio stopping against already-released objects and remove the AppState listener before stopping. Login/session/server logic unchanged.

Two regression tests pass for live-player pause and already-released-player cleanup; TypeScript passes. Signed device rebuild passed with log output/ios-device-2026-09-10T05-48-34.281Z.log, embedded production environment checks passed, and devicectl confirmed installation on the owner's iPhone. Repeat the owner's exact physical-device sequence before marking this crash resolved. A successful launch alone is insufficient.
