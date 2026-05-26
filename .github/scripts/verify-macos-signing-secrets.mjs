const requiredSecrets = [
  'MAC_CSC_LINK',
  'MAC_CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
]

const missingSecrets = requiredSecrets.filter((name) => !process.env[name])

if (missingSecrets.length > 0) {
  for (const name of missingSecrets) {
    console.error(`::error::Missing GitHub Actions secret ${name}`)
  }

  console.error(
    [
      'macOS releases must be Developer ID signed and notarized before public distribution.',
      'Add the missing repository secrets, then rerun the release workflow.',
    ].join('\n'),
  )
  process.exit(1)
}

console.log('macOS signing and notarization secrets are configured.')
