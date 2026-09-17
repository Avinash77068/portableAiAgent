const { ipcMain } = require('electron')
const { initializeHardware } = require('../hardware/HardwareManager.cjs')

const registerHardwareHandlers = () => {
  ipcMain.handle('portableai:hardware:get-info', () => initializeHardware())
}

module.exports = { registerHardwareHandlers }
