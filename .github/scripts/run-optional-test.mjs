import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

if (!packageJson.scripts?.test) {
  console.log('::notice::No npm test script is configured yet.')
  process.exit(0)
}

const result = spawnSync('npm', ['test'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
