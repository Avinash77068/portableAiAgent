const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('portableAI', {
  conversations: {
    list: () => ipcRenderer.invoke('portableai:conversations:list'),
    create: (title) => ipcRenderer.invoke('portableai:conversations:create', title),
    get: (conversationId) => ipcRenderer.invoke('portableai:conversations:get', conversationId),
    rename: (conversationId, title) => ipcRenderer.invoke('portableai:conversations:rename', { conversationId, title }),
    delete: (conversationId) => ipcRenderer.invoke('portableai:conversations:delete', conversationId),
  },
  messages: {
    list: (conversationId) => ipcRenderer.invoke('portableai:messages:list', conversationId),
    create: (conversationId, role, content) => ipcRenderer.invoke('portableai:messages:create', { conversationId, role, content }),
    delete: (messageId) => ipcRenderer.invoke('portableai:messages:delete', messageId),
    update: (messageId, content) => ipcRenderer.invoke('portableai:messages:update', { messageId, content }),
  },
  hardware: {
    getInfo: () => ipcRenderer.invoke('portableai:hardware:get-info'),
  },
  attachments: {
    save: (file) => ipcRenderer.invoke('portableai:attachments:save', {
      name: file.name,
      type: file.type,
      size: file.size,
      sourcePath: webUtils.getPathForFile(file),
    }),
  },
  ai: {
    getStatus: () => ipcRenderer.invoke('portableai:ai:get-status'),
    getModels: () => ipcRenderer.invoke('portableai:ai:get-models'),
    selectModel: (modelId) => ipcRenderer.invoke('portableai:ai:select-model', modelId),
    start: () => ipcRenderer.invoke('portableai:ai:start'),
    stop: () => ipcRenderer.invoke('portableai:ai:stop'),
    generate: (conversationId, attachments, webSearchEnabled) => ipcRenderer.invoke('portableai:ai:generate', { conversationId, attachments, webSearchEnabled }),
    stopGeneration: () => ipcRenderer.invoke('portableai:ai:stop-generation'),
    onStatus: (listener) => {
      const handler = (_, status) => listener(status)
      ipcRenderer.on('portableai:ai:status', handler)
      return () => ipcRenderer.removeListener('portableai:ai:status', handler)
    },
    onStream: (listener) => {
      const handler = (_, event) => listener(event)
      ipcRenderer.on('portableai:ai:stream', handler)
      return () => ipcRenderer.removeListener('portableai:ai:stream', handler)
    },
  },
  agent: {
    selectFolder: () => ipcRenderer.invoke('portableai:agent:select-folder'),
    getInfo: () => ipcRenderer.invoke('portableai:agent:get-info'),
    clearFolder: () => ipcRenderer.invoke('portableai:agent:clear-folder'),
    setAutoApply: (value) => ipcRenderer.invoke('portableai:agent:set-auto-apply', value),
    run: (problem) => ipcRenderer.invoke('portableai:agent:run', problem),
    approveDiff: () => ipcRenderer.invoke('portableai:agent:approve-diff'),
    rejectDiff: () => ipcRenderer.invoke('portableai:agent:reject-diff'),
    stop: () => ipcRenderer.invoke('portableai:agent:stop'),
    onEvent: (listener) => {
      const handler = (_, event) => listener(event)
      ipcRenderer.on('portableai:agent:event', handler)
      return () => ipcRenderer.removeListener('portableai:agent:event', handler)
    },
  },
})
