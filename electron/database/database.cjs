const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const Database = require('better-sqlite3')

let databaseInstance = null

const resolvePortableRoot = () => {
  const runtimeOverride = process.env.PORTABLE_AI_ROOT
  if (runtimeOverride) return path.resolve(runtimeOverride)
  if (!app) return path.resolve(__dirname, '../..')
  if (!app.isPackaged) return app.getAppPath()
  // Packaged executable lives at <root>/PORTABLE.AI.exe on Windows, but on macOS
  // it's nested inside <root>/PORTABLE.AI.app/Contents/MacOS/PORTABLE.AI - walk
  // back up to the folder holding the .app bundle so runtime/models/data stay
  // sibling folders next to the app on the USB drive, not buried inside it.
  if (process.platform === 'darwin') return path.resolve(path.dirname(process.execPath), '../../..')
  return path.dirname(process.execPath)
}

const resolveDataDirectory = () => {
  const dataDirectory = path.join(resolvePortableRoot(), 'data')
  fs.mkdirSync(dataDirectory, { recursive: true })
  return dataDirectory
}

const getDatabasePath = () => path.join(resolveDataDirectory(), 'chats.db')

const initializeDatabase = () => {
  if (databaseInstance) return databaseInstance
  const database = new Database(getDatabasePath())
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations (updated_at DESC);
  `)
  databaseInstance = database
  return database
}

const getDatabase = () => databaseInstance || initializeDatabase()

const closeDatabase = () => {
  if (databaseInstance) {
    databaseInstance.close()
    databaseInstance = null
  }
}

module.exports = { resolvePortableRoot, resolveDataDirectory, getDatabasePath, getDatabase, initializeDatabase, closeDatabase }
