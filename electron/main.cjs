const path = require('node:path')
const { app, BrowserWindow } = require('electron')
const { initializeDatabase, closeDatabase } = require('./database/database.cjs')
const { registerChatHandlers } = require('./ipc/chatHandlers.cjs')
const { initializeHardware } = require('./hardware/HardwareManager.cjs')
const { registerHardwareHandlers } = require('./ipc/hardwareHandlers.cjs')
const { registerAIHandlers } = require('./ipc/aiHandlers.cjs')
const { registerAttachmentHandlers } = require('./ipc/attachmentHandlers.cjs')
const { registerAgentHandlers } = require('./ipc/agentHandlers.cjs')

const isDev = !app.isPackaged
let aiManager = null
let isQuitting = false

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: 'PORTABLE.AI',
    backgroundColor: '#0b0f14',
    resizable: true,
    maximizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5174')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  app.setName('PORTABLE.AI')
  initializeDatabase()
  initializeHardware()
  registerChatHandlers()
  registerHardwareHandlers()
  registerAttachmentHandlers()
  aiManager = registerAIHandlers()
  registerAgentHandlers(aiManager)
  createWindow()

  if (aiManager.getSelectedModel() && aiManager.server.getRuntimePath()) {
    void aiManager.start().catch(() => {})
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  void (aiManager ? aiManager.stop() : Promise.resolve()).finally(() => {
    closeDatabase()
    app.quit()
  })
})
