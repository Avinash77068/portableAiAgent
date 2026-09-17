import type { PortableAIConversation } from '../portableAI'

export const getConversationGroup = (updatedAt: number) => {
  const now = new Date()
  const updated = new Date(updatedAt)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const updatedDay = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime()
  const dayDifference = Math.floor((today - updatedDay) / 86400000)
  if (dayDifference <= 0) return 'Today'
  if (dayDifference === 1) return 'Yesterday'
  if (dayDifference <= 7) return 'Previous 7 Days'
  return 'Older'
}

export const createConversationTitle = (message: string) => {
  const normalized = message.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'New Chat'
  return normalized.length > 50 ? `${normalized.slice(0, 47).trim()}...` : normalized
}

export const groupConversations = (conversations: PortableAIConversation[], searchValue: string) => {
  const query = searchValue.trim().toLowerCase()
  const groups: Record<string, PortableAIConversation[]> = { Today: [], Yesterday: [], 'Previous 7 Days': [], Older: [] }
  for (const conversation of conversations) {
    if (query && !conversation.title.toLowerCase().includes(query)) continue
    groups[getConversationGroup(conversation.updated_at)].push(conversation)
  }
  return groups
}
