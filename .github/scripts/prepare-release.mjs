import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

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

const repository = requireEnv('GITHUB_REPOSITORY')
const sha = requireEnv('GITHUB_SHA')
const token = requireEnv('GITHUB_TOKEN')
const outputPath = requireEnv('GITHUB_OUTPUT')
const manualTitle = process.env.RELEASE_PR_TITLE?.trim()

const prTitle = manualTitle || (await getMergedPullRequestTitle())
const parsedTitle = parseConventionalTitle(prTitle)
const previousVersion = getPreviousVersion()
const nextVersion = bumpVersion(previousVersion, parsedTitle.bump)
const tag = `v${nextVersion}`

if (tagExists(tag)) {
  fail(`Release tag ${tag} already exists. The latest version source is ${previousVersion}.`)
}

writeJson('package.json', updatePackageVersion(readJson('package.json'), nextVersion))
writeJson('package-lock.json', updatePackageVersion(readJson('package-lock.json'), nextVersion))

run('git', ['config', 'user.name', 'github-actions[bot]'])
run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
run('git', ['add', 'package.json', 'package-lock.json'])
run('git', ['commit', '-m', `chore(release): ${tag} [skip ci]`])
run('git', ['tag', '-a', tag, '-m', `Slate ${nextVersion}`])

const releaseSha = run('git', ['rev-parse', 'HEAD'])

appendOutput({
  bump: parsedTitle.bump,
  pr_title: prTitle,
  previous_version: previousVersion,
  release_sha: releaseSha,
  tag,
  version: nextVersion,
})

function parseConventionalTitle(title) {
  const match = titlePattern.exec(title)
  if (!match?.groups) {
    fail(
      [
        `Merged PR title is not a valid Conventional Commit title: ${title}`,
        `Allowed types: ${allowedTypes.join(', ')}`,
      ].join('\n'),
    )
  }

  return {
    bump: getVersionBump(match.groups.type, Boolean(match.groups.breaking)),
    type: match.groups.type,
  }
}

function getVersionBump(type, breaking) {
  if (breaking) return 'major'
  if (type === 'feat') return 'minor'
  return 'patch'
}

async function getMergedPullRequestTitle() {
  const associatedPrs = await githubJson(`/repos/${repository}/commits/${sha}/pulls`)
  const pullRequest = associatedPrs
    .filter((item) => item.merged_at)
    .sort((a, b) => b.number - a.number)[0]

  if (pullRequest?.title) return pullRequest.title

  const commitMessage = run('git', ['log', '-1', '--pretty=%B'])
  const pullRequestNumber = commitMessage.match(/Merge pull request #(\d+)/)?.[1]

  if (pullRequestNumber) {
    const pullRequestDetails = await githubJson(`/repos/${repository}/pulls/${pullRequestNumber}`)
    if (pullRequestDetails.title) return pullRequestDetails.title
  }

  fail(
    'Could not find the merged PR title for this main push. Use workflow_dispatch with RELEASE_PR_TITLE for manual releases.',
  )
}

async function githubJson(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    fail(`GitHub API request failed (${response.status}): ${await response.text()}`)
  }

  return response.json()
}

function getPreviousVersion() {
  const latestTag = run('git', [
    'tag',
    '--list',
    'v[0-9]*.[0-9]*.[0-9]*',
    '--sort=-v:refname',
  ])
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (latestTag) return latestTag.replace(/^v/, '')

  const packageJson = readJson('package.json')
  if (typeof packageJson.version !== 'string') {
    fail('package.json must include a version when no previous release tag exists.')
  }

  return packageJson.version
}

function bumpVersion(version, bump) {
  const match = version.match(/^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/)
  if (!match?.groups) fail(`Cannot bump non-standard version: ${version}`)

  let major = Number(match.groups.major)
  let minor = Number(match.groups.minor)
  let patch = Number(match.groups.patch)

  if (bump === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (bump === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }

  return `${major}.${minor}.${patch}`
}

function tagExists(tag) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}`], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function updatePackageVersion(json, version) {
  json.version = version
  if (json.packages?.['']) {
    json.packages[''].version = version
  }

  return json
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, json) {
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`)
}

function appendOutput(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)
  writeFileSync(outputPath, `${lines.join('\n')}\n`, { flag: 'a' })
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) fail(`${name} is required.`)
  return value
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
