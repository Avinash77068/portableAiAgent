const { ipcMain } = require('electron')
const { listMessages } = require('../database/messages.cjs')
const { LocalAIManager } = require('../ai/LocalAIManager.cjs')

const registerAIHandlers = () => {
  const manager = new LocalAIManager()
  manager.initialize()

  manager.subscribe((status) => {
    for (const window of require('electron').BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('portableai:ai:status', status)
    }
  })

  ipcMain.handle('portableai:ai:get-status', () => manager.getStatus())
  ipcMain.handle('portableai:ai:get-models', () => manager.getModels())
  ipcMain.handle('portableai:ai:select-model', (_, modelId) => manager.selectModel(modelId))
  ipcMain.handle('portableai:ai:start', async () => {
    return manager.start()
  })
  ipcMain.handle('portableai:ai:stop', async () => {
    await manager.stop()
    return manager.getStatus()
  })
  ipcMain.handle('portableai:ai:stop-generation', () => {
    manager.stopGeneration()
    return manager.getStatus()
  })
  ipcMain.handle('portableai:ai:generate', async (event, { conversationId, attachments = [], webSearchEnabled = false }) => {
    const messages = listMessages(conversationId)
    const result = await manager.generate(messages, (delta) => {
      if (!event.sender.isDestroyed()) event.sender.send('portableai:ai:stream', { type: 'delta', delta })
    }, attachments, webSearchEnabled)
    return result
  })

  ipcMain.handle('portableai:models:refresh', () => manager.getModels())
  return manager
}

module.exports = { registerAIHandlers }
