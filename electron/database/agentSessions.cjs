const { randomUUID } = require('node:crypto')
const { getDatabase } = require('./database.cjs')

const titleFromProblem = (problem) => {
  const normalized = typeof problem === 'string' ? problem.replace(/\s+/g, ' ').trim() : ''
  if (!normalized) return 'New Session'
  return normalized.length > 50 ? `${normalized.slice(0, 47).trim()}...` : normalized
}

const listAgentConversations = () => getDatabase().prepare('SELECT id, title, repo_root, created_at, updated_at FROM agent_conversations ORDER BY updated_at DESC').all()

const getAgentConversation = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  return getDatabase().prepare('SELECT id, title, repo_root, created_at, updated_at FROM agent_conversations WHERE id = ?').get(conversationId) ?? null
}

const createAgentConversation = (title, repoRoot) => {
  const database = getDatabase()
  const safeTitle = titleFromProblem(title)
  const now = Date.now()
  const id = randomUUID()
  database.prepare('INSERT INTO agent_conversations (id, title, repo_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, safeTitle, repoRoot ?? null, now, now)
  return { id, title: safeTitle, repo_root: repoRoot ?? null, created_at: now, updated_at: now }
}

const renameAgentConversation = (conversationId, title) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  const safeTitle = typeof title === 'string' ? title.trim() : ''
  if (!safeTitle) throw new Error('Conversation title cannot be empty')
  const database = getDatabase()
  const now = Date.now()
  const result = database.prepare('UPDATE agent_conversations SET title = ?, updated_at = ? WHERE id = ?').run(safeTitle, now, conversationId)
  if (result.changes === 0) throw new Error('Conversation not found')
  return getAgentConversation(conversationId)
}

const deleteAgentConversation = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  const database = getDatabase()
  database.transaction((id) => {
    database.prepare('DELETE FROM agent_steps WHERE conversation_id = ?').run(id)
    const result = database.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error('Conversation not found')
  })(conversationId)
  return true
}

const parseStepRow = (row) => ({ id: row.id, conversation_id: row.conversation_id, event: JSON.parse(row.event), created_at: row.created_at })

const listAgentSteps = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  return getDatabase().prepare('SELECT id, conversation_id, event, created_at FROM agent_steps WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId).map(parseStepRow)
}

const createAgentStep = (conversationId, event) => {
  if (!conversationId || typeof conversationId !== 'string') throw new Error('Invalid conversation ID')
  if (!event || typeof event !== 'object') throw new Error('Invalid step event')
  const database = getDatabase()
  if (!database.prepare('SELECT id FROM agent_conversations WHERE id = ?').get(conversationId)) throw new Error('Conversation not found')
  const id = randomUUID()
  const createdAt = Date.now()
  const serialized = JSON.stringify(event)
  database.transaction(() => {
    database.prepare('INSERT INTO agent_steps (id, conversation_id, event, created_at) VALUES (?, ?, ?, ?)').run(id, conversationId, serialized, createdAt)
    database.prepare('UPDATE agent_conversations SET updated_at = ? WHERE id = ?').run(createdAt, conversationId)
  })()
  return { id, conversation_id: conversationId, event, created_at: createdAt }
}

module.exports = {
  listAgentConversations,
  createAgentConversation,
  renameAgentConversation,
  deleteAgentConversation,
  listAgentSteps,
  createAgentStep,
}
