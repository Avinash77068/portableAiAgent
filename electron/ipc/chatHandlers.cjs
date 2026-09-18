const { ipcMain } = require('electron')
const { listConversations, createConversation, renameConversation, deleteConversation } = require('../database/conversations.cjs')
const { listMessages, createMessage, deleteMessage, updateMessage } = require('../database/messages.cjs')

const registerChatHandlers = () => {
  ipcMain.handle('portableai:conversations:list', () => listConversations())
  ipcMain.handle('portableai:conversations:create', (_, title) => createConversation(title))
  ipcMain.handle('portableai:conversations:rename', (_, payload) => {
    const { conversationId, title } = payload ?? {}
    return renameConversation(conversationId, title)
  })
  ipcMain.handle('portableai:conversations:delete', (_, conversationId) => {
    deleteConversation(conversationId)
    return true
  })
  ipcMain.handle('portableai:messages:list', (_, conversationId) => listMessages(conversationId))
  ipcMain.handle('portableai:messages:create', (_, payload) => {
    const { conversationId, role, content } = payload ?? {}
    return createMessage(conversationId, role, content)
  })
  ipcMain.handle('portableai:messages:delete', (_, messageId) => deleteMessage(messageId))
  ipcMain.handle('portableai:messages:update', (_, payload) => {
    const { messageId, content } = payload ?? {}
    return updateMessage(messageId, content)
  })
}

module.exports = { registerChatHandlers }
