const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const http = require('node:http')
const { resolvePortableRoot } = require('../database/database.cjs')
const { initializeHardware } = require('../hardware/HardwareManager.cjs')
const { findAvailablePort } = require('./portManager.cjs')
const { AI_STATES } = require('./types.cjs')
const { log } = require('./logger.cjs')

const REQUEST_TIMEOUT_MS = 60000
const HEALTH_TIMEOUT_MS = 60000

class LlamaServerManager {
  constructor() {
    this.process = null
    this.port = null
    this.state = AI_STATES.STOPPED
    this.error = null
    this.selectedModel = null
    this.abortController = null
    this.generationStopRequested = false
    this.stateListeners = new Set()
  }

  subscribe(listener) {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  emitState() {
    const snapshot = this.getStatus()
    for (const listener of this.stateListeners) listener(snapshot)
  }

  getRuntimePath() {
    const runtimeDirectory = path.join(resolvePortableRoot(), 'runtime')
    const platform = process.platform
    const executableName = platform === 'win32' ? 'llama-server.exe' : 'llama-server'
    const candidates = [
      path.join(runtimeDirectory, platform, executableName),
      path.join(runtimeDirectory, executableName),
    ]

    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null
  }

  setModel(model) {
    this.selectedModel = model
    this.error = null
  }

  getStatus() {
    return {
      state: this.state,
      error: this.error,
      port: this.port,
      runtimeAvailable: Boolean(this.getRuntimePath()),
      selectedModel: this.selectedModel ? {
        id: this.selectedModel.id,
        filename: this.selectedModel.filename,
        displayName: this.selectedModel.displayName,
        size: this.selectedModel.size,
      } : null,
    }
  }

  buildArguments(modelPath, port) {
    const hardware = initializeHardware()
    const config = hardware.recommendedAIConfig
    const args = [
      '--model', modelPath,
      '--host', '127.0.0.1',
      '--port', String(port),
      '--ctx-size', String(config.contextLength),
      '--threads', String(config.recommendedThreads),
    ]

    if (typeof config.gpuLayers === 'number') {
      args.push('--n-gpu-layers', String(config.gpuLayers))
    }

    return args
  }

  async start() {
    if (this.state === AI_STATES.READY || this.state === AI_STATES.GENERATING) return this.getStatus()
    if (!this.selectedModel) throw new Error('No local model found')

    const runtimePath = this.getRuntimePath()
    if (!runtimePath) throw new Error('Local AI runtime is unavailable')

    this.state = AI_STATES.STARTING
    this.error = null
    this.emitState()

    const port = await findAvailablePort()
    const args = this.buildArguments(this.selectedModel.path, port)
    log(`Starting llama-server runtime=${path.basename(runtimePath)} model=${this.selectedModel.filename} port=${port}`)

    this.port = port
    this.process = spawn(runtimePath, args, {
      cwd: path.dirname(runtimePath),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.process.stdout.on('data', (chunk) => {
      const line = String(chunk).trim()
      if (line) log(`llama-server stdout: ${line.slice(0, 500)}`)
    })
    this.process.stderr.on('data', (chunk) => {
      const line = String(chunk).trim()
      if (line) log(`llama-server stderr: ${line.slice(0, 500)}`)
    })
    this.process.once('error', (error) => {
      this.error = 'Unable to start Local AI'
      log(`llama-server process error: ${error.message}`)
      this.state = AI_STATES.ERROR
      this.emitState()
    })
    this.process.once('exit', (code, signal) => {
      log(`llama-server exited code=${code ?? 'none'} signal=${signal ?? 'none'}`)
      this.process = null
      this.port = null
      if (this.state !== AI_STATES.STOPPING) {
        this.state = AI_STATES.ERROR
        this.error = 'Local AI server stopped unexpectedly'
        this.emitState()
      }
    })

    try {
      await this.waitForHealth()
      this.state = AI_STATES.READY
      this.emitState()
      log('llama-server is ready')
      return this.getStatus()
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to start Local AI'
      this.state = AI_STATES.ERROR
      this.emitState()
      await this.stop()
      throw new Error(this.error)
    }
  }

  async waitForHealth() {
    const startedAt = Date.now()
    while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
      if (!this.process || this.process.killed) throw new Error('Local AI server exited during startup')
      if (await this.checkHealth()) return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('Local AI server health check timed out')
  }

  checkHealth() {
    if (!this.port) return Promise.resolve(false)
    return new Promise((resolve) => {
      const request = http.get({ hostname: '127.0.0.1', port: this.port, path: '/health', timeout: 1000 }, (response) => {
        response.resume()
        resolve(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300)
      })
      request.on('error', () => resolve(false))
      request.on('timeout', () => {
        request.destroy()
        resolve(false)
      })
    })
  }

  async generate(messages, settings, onDelta) {
    if (this.state !== AI_STATES.READY) await this.start()
    if (!this.port) throw new Error('Local AI server is unavailable')

    this.state = AI_STATES.GENERATING
    this.error = null
    this.emitState()
    this.abortController = new AbortController()
    this.generationStopRequested = false
    const timeout = setTimeout(() => this.abortController.abort(), REQUEST_TIMEOUT_MS)
    let responseText = ''

    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: this.abortController.signal,
        body: JSON.stringify({
          messages,
          stream: true,
          temperature: settings.temperature,
          top_p: 0.9,
          max_tokens: settings.maxOutputTokens,
        }),
      })

      if (!response.ok || !response.body) throw new Error(`Local AI request failed (${response.status})`)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const content = JSON.parse(payload).choices?.[0]?.delta?.content
            if (typeof content === 'string' && content) {
              responseText += content
              onDelta(content)
            }
          } catch {
            log('Ignored malformed local AI stream chunk')
          }
        }
      }

      this.state = AI_STATES.READY
      this.emitState()
      return { text: responseText.trim(), stopped: false }
    } catch (error) {
      if (this.abortController?.signal.aborted && this.generationStopRequested) {
        this.state = AI_STATES.READY
        this.emitState()
        return { text: responseText.trim(), stopped: true }
      }
      const serverStillAlive = Boolean(this.process && !this.process.killed)
      this.state = serverStillAlive ? AI_STATES.READY : AI_STATES.ERROR
      this.error = 'Local AI generation failed'
      this.emitState()
      log(`Generation error: ${error instanceof Error ? error.message : 'unknown error'}`)
      return { text: responseText.trim(), stopped: false, error: this.error }
    } finally {
      clearTimeout(timeout)
      this.abortController = null
    }
  }

  stopGeneration() {
    if (this.abortController) {
      this.generationStopRequested = true
      this.abortController.abort()
    }
    if (this.state === AI_STATES.GENERATING) {
      this.state = AI_STATES.READY
      this.emitState()
    }
  }

  async stop() {
    this.stopGeneration()
    if (!this.process) {
      this.state = AI_STATES.STOPPED
      this.emitState()
      return
    }

    this.state = AI_STATES.STOPPING
    this.emitState()
    const child = this.process
    let forcedTermination = false
    await new Promise((resolve) => {
      let exited = false
      const timer = setTimeout(() => {
        if (!exited) {
          forcedTermination = true
          child.kill('SIGKILL')
          log('llama-server did not exit gracefully; forced termination requested')
        }
        resolve()
      }, 3000)
      child.once('exit', () => {
        exited = true
        clearTimeout(timer)
        resolve()
      })
      child.kill()
    })
    this.process = null
    this.port = null
    this.state = AI_STATES.STOPPED
    this.emitState()
    log(forcedTermination ? 'llama-server forced termination completed' : 'llama-server stopped successfully')
  }
}

module.exports = { LlamaServerManager }
