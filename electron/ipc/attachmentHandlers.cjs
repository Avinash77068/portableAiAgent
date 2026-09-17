const { ipcMain } = require('electron')
const { saveAttachment } = require('../attachments.cjs')

const registerAttachmentHandlers = () => {
  ipcMain.handle('portableai:attachments:save', (_, payload) => saveAttachment(payload))
}

module.exports = { registerAttachmentHandlers }
