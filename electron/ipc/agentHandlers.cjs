const { ipcMain, dialog, BrowserWindow } = require('electron')
const { getRepoRoot, setRepoRoot, clearRepoRoot } = require('../agent/repoAccess.cjs')
const { AgentSession } = require('../agent/AgentSession.cjs')
const { readSettings, writeSettingsKey } = require('../settings.cjs')
const {
  listAgentConversations,
  createAgentConversation,
  renameAgentConversation,
  deleteAgentConversation,
  listAgentSteps,
  createAgentStep,
} = require('../database/agentSessions.cjs')

const registerAgentHandlers = (aiManager) => {
  let activeSession = null
  let autoApply = readSettings().agentAutoApply === true

  const broadcast = (channel, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('portableai:agent:select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return getRepoRoot()
    setRepoRoot(result.filePaths[0])
    return getRepoRoot()
  })

  ipcMain.handle('portableai:agent:get-info', () => ({ repoRoot: getRepoRoot(), autoApply }))

  ipcMain.handle('portableai:agent:clear-folder', () => {
    clearRepoRoot()
    return null
  })

  ipcMain.handle('portableai:agent:set-auto-apply', (_, value) => {
    autoApply = Boolean(value)
    writeSettingsKey('agentAutoApply', autoApply)
    return autoApply
  })

  ipcMain.handle('portableai:agent-conversations:list', () => listAgentConversations())
  ipcMain.handle('portableai:agent-conversations:rename', (_, payload) => {
    const { conversationId, title } = payload ?? {}
    return renameAgentConversation(conversationId, title)
  })
  ipcMain.handle('portableai:agent-conversations:delete', (_, conversationId) => {
    deleteAgentConversation(conversationId)
    return true
  })
  ipcMain.handle('portableai:agent-steps:list', (_, conversationId) => listAgentSteps(conversationId))

  ipcMain.handle('portableai:agent:run', async (_, payload) => {
    const { conversationId: requestedConversationId, problem } = payload ?? {}
    const repoRoot = getRepoRoot()
    if (!repoRoot) throw new Error('No repository folder is selected yet')
    if (activeSession) throw new Error('An agent run is already in progress')
    if (!aiManager.getSelectedModel()) throw new Error('No local model available')

    const conversationId = requestedConversationId ?? createAgentConversation(problem, repoRoot).id
    broadcast('portableai:agent:conversation-started', { conversationId })

    if (listAgentSteps(conversationId).length > 0) createAgentStep(conversationId, { type: 'run-divider' })
    createAgentStep(conversationId, { type: 'user-message', message: problem })

    await aiManager.start()
    activeSession = new AgentSession({ repoRoot, server: aiManager.server, getAutoApply: () => autoApply })
    try {
      await activeSession.run(problem, (event) => {
        createAgentStep(conversationId, event)
        broadcast('portableai:agent:event', event)
      })
    } finally {
      activeSession = null
    }
    return { conversationId }
  })

  ipcMain.handle('portableai:agent:approve-diff', () => {
    activeSession?.resolveDiff(true)
    return true
  })

  ipcMain.handle('portableai:agent:reject-diff', () => {
    activeSession?.resolveDiff(false)
    return true
  })

  ipcMain.handle('portableai:agent:stop', () => {
    activeSession?.stop()
    return true
  })
}

module.exports = { registerAgentHandlers }
