const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('portableAI', {
  platform: process.platform,
  versions: process.versions,
  isElectron: true,
})

window.addEventListener('DOMContentLoaded', () => {
  // No direct Node or shell access is exposed to the renderer.
})
