const fs = require('node:fs')
const path = require('node:path')
const { resolvePortableRoot } = require('./database/database.cjs')

const getSettingsPath = () => path.join(resolvePortableRoot(), 'data', 'settings.json')

const readSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'))
  } catch {
    return {}
  }
}

const writeSettingsKey = (key, value) => {
  const settingsPath = getSettingsPath()
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  const settings = readSettings()
  settings[key] = value
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

module.exports = { readSettings, writeSettingsKey }
