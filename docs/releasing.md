# Releasing Slate

Slate releases are built by GitHub Actions when a Conventional Commit PR title is
merged into `main`. The workflow bumps the semantic version, builds the macOS
artifacts, and publishes a GitHub release.

## macOS Signing and Notarization

Public macOS downloads must be signed with an Apple Developer ID Application
certificate and notarized by Apple. Unsigned or ad-hoc signed builds will be
blocked by Gatekeeper with a message that Apple could not verify the app.

Add these GitHub Actions repository secrets before publishing macOS releases:

- `MAC_CSC_LINK`: base64-encoded `.p12` export of the Developer ID Application
  certificate and private key.
- `MAC_CSC_KEY_PASSWORD`: password used when exporting the `.p12`.
- `APPLE_ID`: Apple ID email for the developer account.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID.
- `APPLE_TEAM_ID`: 10-character Apple Developer team ID.

To create `MAC_CSC_LINK`, export the Developer ID Application certificate from
Keychain Access as a `.p12`, then encode it:

```sh
base64 -i certificate.p12 | pbcopy
```

Paste the clipboard value into the `MAC_CSC_LINK` secret.

The release workflow fails fast if any required signing or notarization secret is
missing. That is intentional: publishing unsigned builds would recreate the
Gatekeeper warning for users.
