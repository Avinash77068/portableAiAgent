const fs = require('node:fs')
const path = require('node:path')
const { readSettings, writeSettingsKey } = require('../settings.cjs')

const getRepoRoot = () => {
  const repoRoot = readSettings().agentRepoRoot
  if (typeof repoRoot !== 'string') return null
  try {
    return fs.statSync(repoRoot).isDirectory() ? repoRoot : null
  } catch {
    return null
  }
}

const setRepoRoot = (repoRoot) => {
  if (typeof repoRoot !== 'string' || !fs.statSync(repoRoot).isDirectory()) {
    throw new Error('Selected path is not a valid folder')
  }
  writeSettingsKey('agentRepoRoot', path.resolve(repoRoot))
}

const clearRepoRoot = () => writeSettingsKey('agentRepoRoot', null)

const BLOCKED_DIRECTORY_NAMES = new Set(['node_modules', '.git','package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'dist', 'dist-ssr', 'release', 'usb-build', 'build', '.next', '.venv', '__pycache__'])

const findExistingAncestor = (targetPath) => {
  let current = targetPath
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) return current
    current = parent
  }
  return current
}

// Resolves a path the model asked for against the granted repo root, refusing
// anything that would escape it - lexically (../.. traversal) or physically
// (a symlink inside the repo pointing somewhere else on disk).
const resolveInRepo = (repoRoot, relativePath) => {
  if (typeof relativePath !== 'string' || !relativePath.trim()) throw new Error('A file path is required')
  // Models naturally write paths as if the repo root were "/" (e.g. "/", "/src/App.tsx").
  // Treat a leading slash as repo-root-relative instead of the real filesystem root.
  const normalizedPath = relativePath.replace(/^\/+/, '') || '.'
  const resolved = path.resolve(repoRoot, normalizedPath)
  const relative = path.relative(repoRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Path "${relativePath}" is outside the granted folder`)

  const blockedSegment = relative.split(path.sep).find((segment) => BLOCKED_DIRECTORY_NAMES.has(segment))
  if (blockedSegment) throw new Error(`Path "${relativePath}" is inside "${blockedSegment}", which is off-limits`)

  const realRoot = fs.realpathSync(repoRoot)
  const realAncestor = fs.realpathSync(findExistingAncestor(resolved))
  const realRelative = path.relative(realRoot, realAncestor)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error(`Path "${relativePath}" escapes the granted folder`)

  return resolved
}

module.exports = { getRepoRoot, setRepoRoot, clearRepoRoot, resolveInRepo, BLOCKED_DIRECTORY_NAMES }
