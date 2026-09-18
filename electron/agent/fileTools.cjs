const fs = require('node:fs')
const path = require('node:path')
const { resolveInRepo, BLOCKED_DIRECTORY_NAMES } = require('./repoAccess.cjs')

const IGNORED_DIRECTORIES = BLOCKED_DIRECTORY_NAMES
const MAX_READ_CHARS = 40000
const MAX_TREE_ENTRIES = 400
const MAX_SEARCH_RESULTS = 60
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.py', '.txt', '.yml', '.yaml', '.toml', '.rs', '.go', '.java', '.c', '.h', '.cpp', '.hpp', '.sh', '.cfg', '.ini', '.gitignore'])

const isLikelyTextFile = (filePath) => {
  const extension = path.extname(filePath).toLowerCase()
  return TEXT_EXTENSIONS.has(extension) || !extension
}

const listTree = (repoRoot, subPath = '.') => {
  const startPath = resolveInRepo(repoRoot, subPath)
  const results = []

  const walk = (currentPath) => {
    if (results.length >= MAX_TREE_ENTRIES) return
    let entries
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (results.length >= MAX_TREE_ENTRIES) return
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue
      const entryPath = path.join(currentPath, entry.name)
      const relativePath = path.relative(repoRoot, entryPath)
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue
        results.push(`${relativePath}/`)
        walk(entryPath)
      } else if (entry.isFile()) {
        results.push(relativePath)
      }
    }
  }

  walk(startPath)
  return results.length >= MAX_TREE_ENTRIES ? [...results, `... truncated at ${MAX_TREE_ENTRIES} entries`] : results
}

const readFile = (repoRoot, relativePath) => {
  const resolved = resolveInRepo(repoRoot, relativePath)
  const stats = fs.statSync(resolved)
  if (!stats.isFile()) throw new Error(`"${relativePath}" is not a file`)
  if (!isLikelyTextFile(resolved)) throw new Error(`"${relativePath}" does not look like a text file`)
  const content = fs.readFileSync(resolved, 'utf8')
  return content.length > MAX_READ_CHARS ? `${content.slice(0, MAX_READ_CHARS)}\n... truncated (${content.length} characters total)` : content
}

const readFileIfExists = (repoRoot, relativePath) => {
  try {
    return readFile(repoRoot, relativePath)
  } catch {
    return ''
  }
}

const searchFiles = (repoRoot, query) => {
  if (typeof query !== 'string' || !query.trim()) throw new Error('A search query is required')
  const needle = query.toLowerCase()
  const matches = []

  const walk = (currentPath) => {
    if (matches.length >= MAX_SEARCH_RESULTS) return
    let entries
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (matches.length >= MAX_SEARCH_RESULTS) return
      if (entry.name.startsWith('.')) continue
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue
        walk(entryPath)
      } else if (entry.isFile() && isLikelyTextFile(entryPath)) {
        let content
        try {
          content = fs.readFileSync(entryPath, 'utf8')
        } catch {
          continue
        }
        const lines = content.split('\n')
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          if (matches.length >= MAX_SEARCH_RESULTS) break
          if (lines[lineIndex].toLowerCase().includes(needle)) {
            matches.push(`${path.relative(repoRoot, entryPath)}:${lineIndex + 1}: ${lines[lineIndex].trim().slice(0, 200)}`)
          }
        }
      }
    }
  }

  walk(repoRoot)
  return matches
}

// .env files hold secrets (API keys, credentials) - blocked here at the
// sandbox layer rather than only asked for in the system prompt, since a small
// local model won't reliably honor a "please don't" instruction on its own.
const ENV_FILE_PATTERN = /^\.env(\..+)?$/i

const writeFile = (repoRoot, relativePath, content) => {
  if (typeof content !== 'string') throw new Error('File content must be a string')
  const resolved = resolveInRepo(repoRoot, relativePath)
  if (ENV_FILE_PATTERN.test(path.basename(resolved))) throw new Error(`Refusing to write to "${relativePath}" - .env files are never modified by the agent.`)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, content, 'utf8')
}

module.exports = { listTree, readFile, readFileIfExists, searchFiles, writeFile }
