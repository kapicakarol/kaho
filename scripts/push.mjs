// Push to GitHub using a Personal Access Token from .secrets/github_token.
// The token is passed via environment-only git config, so it is never written
// to .git/config, the remote URL, or shell history.
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const TOKEN_FILE = '.secrets/github_token'
const REPO = 'https://github.com/kapicakarol/kaho.git'

if (!existsSync(TOKEN_FILE)) {
  console.error(`Brak ${TOKEN_FILE}. Utwórz token (scope: repo) na https://github.com/settings/tokens i zapisz go w tym pliku.`)
  process.exit(1)
}
const token = readFileSync(TOKEN_FILE, 'utf8').trim()
const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
const branch = process.argv[2] || 'main'

const res = spawnSync('git', ['push', REPO, `HEAD:${branch}`], {
  stdio: 'inherit',
  env: {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  },
})
process.exit(res.status ?? 1)
