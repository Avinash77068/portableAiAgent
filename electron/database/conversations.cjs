const { randomUUID } = require('node:crypto')
const { getDatabase } = require('./database.cjs')

const normalizeConversationTitle = (title) => {
  const safeTitle = typeof title === 'string' ? title.trim() : ''
  return safeTitle || 'New Chat'
}

const listConversations = () => getDatabase().prepare('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC').all()

const getConversation = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  return getDatabase().prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?').get(conversationId) ?? null
}

const createConversation = (title = 'New Chat') => {
  const database = getDatabase()
  const safeTitle = normalizeConversationTitle(title)
  const now = Date.now()
  const id = randomUUID()
  database.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, safeTitle, now, now)
  return { id, title: safeTitle, created_at: now, updated_at: now }
}

const renameConversation = (conversationId, title) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  const safeTitle = typeof title === 'string' ? title.trim() : ''
  if (!safeTitle) throw new Error('Conversation title cannot be empty')
  const database = getDatabase()
  const now = Date.now()
  const result = database.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(safeTitle, now, conversationId)
  if (result.changes === 0) throw new Error('Conversation not found')
  return getConversation(conversationId)
}

const deleteConversation = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  const database = getDatabase()
  database.transaction((id) => {
    database.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id)
    const result = database.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error('Conversation not found')
  })(conversationId)
  return true
}

module.exports = { listConversations, createConversation, renameConversation, deleteConversation }
