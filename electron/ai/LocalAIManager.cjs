const { computeAIConfig } = require('../hardware/HardwareManager.cjs')
const { listModels, validateModel, readSelectedModelId, writeSelectedModelId } = require('../model/ModelManager.cjs')
const { LlamaServerManager } = require('./LlamaServerManager.cjs')
const { AI_STATES } = require('./types.cjs')
const { extractAttachmentText, resolveAttachment } = require('../attachments.cjs')
const { searchWeb, extractUtcOffsetMinutes } = require('./webSearch.cjs')

const BASE_SYSTEM_PROMPT = 'You are PORTABLE.AI, a private local AI assistant. Answer clearly and helpfully. You are running locally on the user\'s computer. Use a friendly tone with a light sprinkle of relevant emoji (a few per reply, not one on every line) - skip them for serious, technical, or code-heavy answers where they would look out of place.'

// A local model has no built-in notion of "now" - without this it either
// hedges ("I don't have real-time access") or answers from its training
// cutoff as if it were the present. Computed fresh per request since it's a
// point-in-time fact, not something to bake into a constant. Only the device's
// own clock and UTC are given here - anywhere else is resolved dynamically via
// web search (see maybeAddRemoteTimeFact below), not a fixed place list.
const getSystemPrompt = () => {
  const now = new Date()
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // timeZoneName: 'long' resolves to a plain-English name (e.g. "India Standard
  // Time", "Japan Standard Time") for whatever zone the device is actually in -
  // this comes from Intl/ICU generically, not a lookup table. Spelling this out
  // matters: an IANA id like "Asia/Calcutta" alone left the model unsure it
  // meant India. Deliberately NOT also showing a UTC value here: giving the
  // model two numbers for "now" made it grab the wrong one at random even once
  // correctly labeled - UTC is only needed as an internal computation anchor
  // (see maybeAddRemoteTimeFact), never as something the model itself reasons about.
  const deviceTime = now.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'long', timeZone: deviceTimeZone })

  return `${BASE_SYSTEM_PROMPT}

Current date and time where this device is located: ${deviceTime}.
Treat this as the actual current date/time - never say you lack real-time access when asked what the date or time is. Never attempt to convert this to another timezone yourself, since that arithmetic is unreliable - if asked about the time somewhere else, rely only on a "current time elsewhere" fact if one is given to you, and otherwise say you're not certain rather than guessing.`
}

// Time in a specific place can't be looked up from a fixed list (any place
// could be asked about) and search snippets never contain a live clock value -
// but they very often state the UTC/GMT offset in plain text. Extract that and
// compute the exact current time from it directly, instead of leaving the
// arithmetic to the model.
const maybeAddRemoteTimeFact = (resultsText, results, now) => {
  const offsetMinutes = extractUtcOffsetMinutes(results)
  if (offsetMinutes === null) return resultsText
  const remoteTime = new Date(now.getTime() + offsetMinutes * 60000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offsetLabel = `UTC${sign}${Math.floor(Math.abs(offsetMinutes) / 60)}${Math.abs(offsetMinutes) % 60 ? ':' + String(Math.abs(offsetMinutes) % 60).padStart(2, '0') : ''}`
  return `${resultsText}\n\n[Derived fact - the search results above mention a timezone offset of ${offsetLabel}; the exact current time there right now is ${remoteTime}. If the question is about the current time or date in that place, answer with only this value - one short sentence, no mention of UTC, no other timezone, no extra conversion or comparison.]`
}

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

  async buildContext(messages, attachments = [], webSearchEnabled = false) {
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

    let usedWebSearch = false
    if (webSearchEnabled) {
      const lastUserMessage = [...normalized].reverse().find((message) => message.role === 'user')
      if (lastUserMessage) {
        const results = await searchWeb(lastUserMessage.content)
        if (results.length > 0) {
          usedWebSearch = true
          const resultsText = maybeAddRemoteTimeFact(
            results.map((result, index) => `${index + 1}. ${result.title}\n${result.snippet}\n(${result.url})`).join('\n\n'),
            results,
            new Date(),
          )
          lastUserMessage.content += `\n\n[Web search results - not visible to the user, use them to inform your answer]\n${resultsText}\n\nAnswer the user's question using these results where relevant, in your own words - do not just list or repeat them. Mention the source when you use one. If none of the results actually help, say so and answer from your own knowledge instead.`
        }
      }
    }

    const systemPrompt = getSystemPrompt()
    const selected = []
    let characterCount = systemPrompt.length

    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      const message = normalized[index]
      if (characterCount + message.content.length > maxCharacters && selected.length > 0) break
      selected.unshift(message)
      characterCount += message.content.length
    }

    return { messages: [{ role: 'system', content: systemPrompt }, ...selected], usedWebSearch }
  }

  async generate(messages, onDelta, attachments = [], webSearchEnabled = false) {
    const selectedModel = this.getSelectedModel()
    if (!selectedModel) throw new Error('No local model available')
    validateModel(selectedModel)
    const { messages: contextMessages, usedWebSearch } = await this.buildContext(messages, attachments, webSearchEnabled)
    const result = await this.server.generate(contextMessages, computeAIConfig(selectedModel), onDelta)
    return { ...result, usedWebSearch }
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
