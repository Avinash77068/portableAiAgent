const { ipcMain, dialog, BrowserWindow } = require('electron')
const { getRepoRoot, setRepoRoot, clearRepoRoot } = require('../agent/repoAccess.cjs')
const { AgentSession } = require('../agent/AgentSession.cjs')
const { readSettings, writeSettingsKey } = require('../settings.cjs')

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

  ipcMain.handle('portableai:agent:run', async (_, problem) => {
    const repoRoot = getRepoRoot()
    if (!repoRoot) throw new Error('No repository folder is selected yet')
    if (activeSession) throw new Error('An agent run is already in progress')
    if (!aiManager.getSelectedModel()) throw new Error('No local model available')

    await aiManager.start()
    activeSession = new AgentSession({ repoRoot, server: aiManager.server, getAutoApply: () => autoApply })
    try {
      await activeSession.run(problem, (event) => broadcast('portableai:agent:event', event))
    } finally {
      activeSession = null
    }
    return true
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
