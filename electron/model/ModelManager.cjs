const fs = require('node:fs')
const path = require('node:path')
const { resolvePortableRoot } = require('../database/database.cjs')

const getModelsDirectory = () => path.join(resolvePortableRoot(), 'models')
const getSettingsPath = () => path.join(resolvePortableRoot(), 'data', 'settings.json')

const readSelectedModelId = () => {
  try {
    const settings = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'))
    return typeof settings.selectedModelId === 'string' ? settings.selectedModelId : null
  } catch {
    return null
  }
}

const writeSelectedModelId = (selectedModelId) => {
  const settingsPath = getSettingsPath()
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  let settings = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    settings = {}
  }
  fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, selectedModelId }, null, 2))
}

const toDisplayName = (filename) => {
  const withoutExtension = filename.replace(/\.gguf$/i, '')
  return withoutExtension.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

const listModels = () => {
  const modelsDirectory = getModelsDirectory()
  fs.mkdirSync(modelsDirectory, { recursive: true })

  return fs.readdirSync(modelsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf'))
    .map((entry) => {
      const filename = entry.name
      const modelPath = path.join(modelsDirectory, filename)
      const stats = fs.statSync(modelPath)
      return {
        id: filename,
        filename,
        displayName: toDisplayName(filename),
        path: modelPath,
        size: stats.size,
      }
    })
    .filter((model) => model.size > 0)
    .sort((left, right) => left.filename.localeCompare(right.filename))
}

const validateModel = (model) => {
  if (!model || typeof model.path !== 'string' || !model.filename.toLowerCase().endsWith('.gguf')) {
    throw new Error('Unable to load this model')
  }

  const stats = fs.statSync(model.path)
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error('Unable to load this model')
  }
}

module.exports = { listModels, validateModel, readSelectedModelId, writeSelectedModelId }
