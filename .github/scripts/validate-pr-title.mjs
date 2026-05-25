const allowedTypes = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
]

const titlePattern = new RegExp(
  `^(?<type>${allowedTypes.join('|')})(\\([a-z0-9._-]+\\))?(?<breaking>!)?: .+`,
)

const title = process.argv.slice(2).join(' ').trim() || process.env.PR_TITLE?.trim()

if (!title) {
  fail('PR title is required.')
}

if (!titlePattern.test(title)) {
  fail(
    [
      `PR title must use Conventional Commit format: ${allowedTypes.join('|')}(optional-scope): summary`,
      'Examples:',
      '  fix: preserve editor cursor position',
      '  feat(sidebar): add workspace search',
      '  feat!: change document storage format',
    ].join('\n'),
  )
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
