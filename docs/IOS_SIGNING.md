# Furnio iOS signing

Updated 9 September 2026 (Toronto). Signing setup is separate from app submission/readiness.

## Verified identities — both complete

- Owner explicitly approved creating Apple Development and Apple Distribution certificates.
- Xcode beta created **Apple Development: Alipasha Amidi (BAZJFMLJP9)**. Certificate organizational unit matches Furnio's team **5SY24C9RBH**.
- Public leaf SHA-1: `418ED070A4A8475E77EB11ACE8487BC448A66DDA`; validity 10 September 2026 00:10:00 UTC through 10 September 2027 00:09:59 UTC.
- After the owner's screenshot/update, `security find-identity -v -p codesigning` reports **2 valid identities**: one Development and one Distribution, not duplicate certificates of the same type. Both certificate/private-key pairs are available for code signing. The Development certificate chain verification also passed.
- Distribution: **Apple Distribution: Alipasha Amidi (5SY24C9RBH)**, team/OU `5SY24C9RBH`, SHA-1 `63F8DFE2C8B4EAC1B6D4E628886B7B32B0D3FBAB`, SHA-256 `221B2497BABB68835FE85802F5431A15F7B18D761E7043F537F0781F27C110B5`. Valid 10 September 2026 00:18:29 UTC through 10 September 2027 00:18:28 UTC. No additional certificate creation is needed.
- Private key stays in Keychain; no private-key/P12 export, credential disclosure, revocation or deletion performed. Ignored `output/apple-development-public.pem` contains only the public certificate.

## Resolved local certificate-chain issue

Initially the certificate/private-key pair existed but `find-identity -v` returned zero valid identities. The user Keychain lacked Apple's **WWDR G3** intermediate. Downloaded it from the link on [Apple PKI](https://www.apple.com/certificateauthority/), verified it against the existing Apple root, and imported only this public intermediate into the login Keychain with ordinary trust defaults. The older system certificate was left untouched.

- Download: `https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer`
- SHA-256: `DCF21878C77F4198E4B4614F03D696D89C66C66008D4244E1B99161AAC91601F`
- Expires 20 February 2030; [Apple identifies G3 for Development/Distribution signing](https://developer.apple.com/help/account/certificates/wwdr-intermediate-certificates/).
- No Always Trust override, new root trust, Keychain search-list change, VPN/DNS/network change or private-key access-policy broadening.

## Resolved window-control limitation

Earlier automated creation attempts were interrupted or showed no new certificate in Xcode/local inventory. The owner restored window access and used the Distribution menu directly. Their screenshot shows separate Development and Distribution groups; the latest local verification above supersedes all earlier pending/absent reports. Do not request another certificate, recreate either identity, or revoke either one.

## Remaining release boundary

No provisioning profile, device archive, upload, TestFlight release or public submission yet. Team ID is persisted in `app.config.ts` but generated native settings still need synchronization; release version still needs deliberate alignment. Xcode RC/store-toolchain selection, real-service/privacy/device acceptance and other release gates remain in `STORE_SUBMISSION_STATUS.md`. No production source/DB/deployment changed during certificate setup.
