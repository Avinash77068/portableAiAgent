const { ipcMain } = require('electron')
const { initializeHardware, computeAIConfig } = require('../hardware/HardwareManager.cjs')

const registerHardwareHandlers = (aiManager) => {
  ipcMain.handle('portableai:hardware:get-info', () => ({
    ...initializeHardware(),
    recommendedAIConfig: computeAIConfig(aiManager.getSelectedModel()),
  }))
}

module.exports = { registerHardwareHandlers }
