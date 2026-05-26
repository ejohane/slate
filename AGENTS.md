# Repository Guidelines

## Pull Requests

Always use a Conventional Commit title for pull requests. The release workflow uses
the merged PR title to choose the next semantic version.

Examples:

- `fix: preserve editor cursor position`
- `feat(sidebar): add workspace search`
- `feat!: change document storage format`

Version bump rules:

- `feat:` creates a minor release.
- `fix:` creates a patch release.
- Any valid type with `!` creates a major release.
- Other valid types, such as `docs:`, `ci:`, `chore:`, `refactor:`, `test:`,
  `style:`, `perf:`, `build:`, and `revert:`, create a patch release.

## Releases

Keep macOS releases signed and notarized. Do not restore ad-hoc signing
(`identity: "-"`) for public builds. See `docs/releasing.md` for the required
GitHub Actions secrets.
