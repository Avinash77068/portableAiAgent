const { computeAIConfig } = require('../hardware/HardwareManager.cjs')
const { listModels, validateModel, readSelectedModelId, writeSelectedModelId } = require('../model/ModelManager.cjs')
const { LlamaServerManager } = require('./LlamaServerManager.cjs')
const { AI_STATES } = require('./types.cjs')
const { extractAttachmentText, resolveAttachment } = require('../attachments.cjs')

const SYSTEM_PROMPT = 'You are PORTABLE.AI, a private local AI assistant. Answer clearly and helpfully. You are running locally on the user\'s computer.'

class LocalAIManager {
  constructor() {
    this.server = new LlamaServerManager()
    this.models = []
    this.selectedModelId = null
  }

  initialize() {
    this.models = listModels()
    const savedModelId = readSelectedModelId()
    this.selectedModelId = this.models.some((model) => model.id === savedModelId)
      ? savedModelId
      : this.models[0]?.id ?? null
    const selectedModel = this.getSelectedModel()
    if (selectedModel) this.server.setModel(selectedModel)
    return this.getStatus()
  }

  getModels() {
    this.models = listModels()
    if (!this.selectedModelId && this.models[0]) {
      this.selectedModelId = this.models[0].id
      this.server.setModel(this.models[0])
    }
    return this.models.map((model) => ({
      id: model.id,
      filename: model.filename,
      displayName: model.displayName,
      size: model.size,
    }))
  }

  getSelectedModel() {
    return this.models.find((model) => model.id === this.selectedModelId) ?? null
  }

  getStatus() {
    const serverStatus = this.server.getStatus()
    const selectedModel = this.getSelectedModel()
    return {
      ...serverStatus,
      state: selectedModel ? serverStatus.state : AI_STATES.STOPPED,
      selectedModel: selectedModel ? {
        id: selectedModel.id,
        filename: selectedModel.filename,
        displayName: selectedModel.displayName,
        size: selectedModel.size,
      } : null,
      modelsAvailable: this.models.length,
      message: !selectedModel
        ? 'No local model available'
        : !serverStatus.runtimeAvailable
          ? 'Local AI runtime is unavailable'
          : serverStatus.error,
    }
  }

  subscribe(listener) {
    return this.server.subscribe(listener)
  }

  async selectModel(modelId) {
    const models = this.models.length > 0 ? this.models : listModels()
    const nextModel = models.find((model) => model.id === modelId)
    if (!nextModel) throw new Error('Selected model was not found')
    if (this.selectedModelId === modelId) return this.getStatus()
    await this.server.stop()
    this.models = models
    this.selectedModelId = modelId
    this.server.setModel(nextModel)
    writeSelectedModelId(modelId)
    if (this.server.getRuntimePath()) return this.start()
    return this.getStatus()
  }

  async buildContext(messages, attachments = []) {
    const maxCharacters = computeAIConfig(this.getSelectedModel()).contextLength * 4
    const normalized = messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.content }))
    if (attachments.length > 0) {
      const extracted = await Promise.all(attachments.map((attachment) => extractAttachmentText({ ...resolveAttachment(attachment.id), name: attachment.name })))
      if (extracted.some((attachment) => attachment.isImage)) throw new Error('Selected model does not support image understanding.')
      const attachmentText = extracted.map((attachment) => `\n\n[Attached file: ${attachment.name ?? 'file'}]\n${attachment.textContent}`).join('')
      const lastUserMessage = [...normalized].reverse().find((message) => message.role === 'user')
      if (lastUserMessage) lastUserMessage.content += attachmentText
    }
    const selected = []
    let characterCount = SYSTEM_PROMPT.length

    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      const message = normalized[index]
      if (characterCount + message.content.length > maxCharacters && selected.length > 0) break
      selected.unshift(message)
      characterCount += message.content.length
    }

    return [{ role: 'system', content: SYSTEM_PROMPT }, ...selected]
  }

  async generate(messages, onDelta, attachments = []) {
    const selectedModel = this.getSelectedModel()
    if (!selectedModel) throw new Error('No local model available')
    validateModel(selectedModel)
    return this.server.generate(await this.buildContext(messages, attachments), computeAIConfig(selectedModel), onDelta)
  }

  async start() {
    if (!this.getSelectedModel()) throw new Error('No local model available')
    await this.server.start()
    return this.getStatus()
  }

  stopGeneration() {
    this.server.stopGeneration()
  }

  async stop() {
    await this.server.stop()
  }
}

module.exports = { LocalAIManager }
