const { randomUUID } = require('node:crypto')
const { getDatabase } = require('./database.cjs')

const allowedRoles = new Set(['user', 'assistant', 'system'])

const listMessages = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  return getDatabase().prepare('SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId)
}

const createMessage = (conversationId, role, content) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (!allowedRoles.has(normalizedRole)) throw new Error('Invalid message role')
  const normalizedContent = typeof content === 'string' ? content.trim() : ''
  if (!normalizedContent) throw new Error('Message content cannot be empty')
  const database = getDatabase()
  if (!database.prepare('SELECT id FROM conversations WHERE id = ?').get(conversationId)) throw new Error('Conversation not found')
  const id = randomUUID()
  const createdAt = Date.now()
  database.transaction(() => {
    database.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, conversationId, normalizedRole, normalizedContent, createdAt)
    database.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(createdAt, conversationId)
  })()
  return { id, conversation_id: conversationId, role: normalizedRole, content: normalizedContent, created_at: createdAt }
}

const deleteMessage = (messageId) => {
  if (!messageId || typeof messageId !== 'string') throw new Error('Invalid message ID')
  const database = getDatabase()
  const message = database.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(messageId)
  if (!message) throw new Error('Message not found')
  const now = Date.now()
  database.transaction(() => {
    database.prepare('DELETE FROM messages WHERE id = ?').run(messageId)
    database.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, message.conversation_id)
  })()
  return true
}

const updateMessage = (messageId, content) => {
  if (!messageId || typeof messageId !== 'string') throw new Error('Invalid message ID')
  const normalizedContent = typeof content === 'string' ? content.trim() : ''
  if (!normalizedContent) throw new Error('Message content cannot be empty')
  const database = getDatabase()
  const now = Date.now()
  const result = database.prepare(`
    UPDATE messages
    SET content = ?, created_at = ?
    WHERE id = ? AND role = 'user'
  `).run(normalizedContent, now, messageId)
  if (result.changes === 0) throw new Error('User message not found')

  database.prepare(`
    UPDATE conversations
    SET updated_at = ?
    WHERE id = (SELECT conversation_id FROM messages WHERE id = ?)
  `).run(now, messageId)

  return database.prepare(
    'SELECT id, conversation_id, role, content, created_at FROM messages WHERE id = ?',
  ).get(messageId)
}

module.exports = { listMessages, createMessage, deleteMessage, updateMessage }
