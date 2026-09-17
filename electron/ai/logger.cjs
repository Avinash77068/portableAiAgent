const fs = require('node:fs')
const path = require('node:path')
const { resolvePortableRoot } = require('../database/database.cjs')

const log = (message) => {
  try {
    const logsDirectory = path.join(resolvePortableRoot(), 'logs')
    fs.mkdirSync(logsDirectory, { recursive: true })
    fs.appendFileSync(path.join(logsDirectory, 'app.log'), `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Diagnostics must never prevent the app from running.
  }
}

module.exports = { log }
