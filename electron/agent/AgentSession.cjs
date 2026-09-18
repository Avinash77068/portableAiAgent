const fs = require('node:fs')
const path = require('node:path')
const { TOOL_SCHEMAS, executeReadOnlyTool } = require('./tools.cjs')
const { readFileIfExists, writeFile } = require('./fileTools.cjs')
const { diffLines } = require('./diff.cjs')
const { log } = require('../ai/logger.cjs')
const { computeAIConfig } = require('../hardware/HardwareManager.cjs')

const MAX_ITERATIONS = 25
const MAX_STALL_NUDGES = 4
const MAX_CONSECUTIVE_EMPTY_SEARCHES = 3
const MAX_TOOL_RESULT_CHARS = 6000
const MAX_REQUEST_ATTEMPTS = 4
// Defends against a single malformed response asking for an implausible
// number of parallel tool calls - never actually observed, just a bound.
const MAX_TOOL_CALLS_PER_RESPONSE = 8
// Only used if computeAIConfig itself throws - real sizing always comes from
// the selected model's own architecture (see hardware/performanceProfile.cjs).
const FALLBACK_CONTEXT_LENGTH = 4096
const FALLBACK_MAX_OUTPUT_TOKENS = 2048

const RULES_FILE_PATH = path.join(__dirname, 'AGENT_RULES.md')

// Falls back to a minimal built-in prompt only if AGENT_RULES.md can't be read
// (deleted, permissions issue, ...) - the agent should still function, just
// without the accumulated behavioral fixes that file documents and encodes.
const FALLBACK_SYSTEM_PROMPT = 'You are a coding assistant with tool access to a local repository. Not every message is a coding task - reply directly when no tool is needed. Read a file before writing it, never guess paths, and never touch .env files or node_modules.'

// Read fresh per session (not cached at module load) so editing the rules
// file takes effect on the next run without an app restart.
const loadSystemPrompt = () => {
  try {
    const content = fs.readFileSync(RULES_FILE_PATH, 'utf8').trim()
    return content || FALLBACK_SYSTEM_PROMPT
  } catch (error) {
    log(`Could not read AGENT_RULES.md, using fallback system prompt: ${error instanceof Error ? error.message : 'unknown error'}`)
    return FALLBACK_SYSTEM_PROMPT
  }
}

const STALL_NUDGE = 'Do not describe what you are about to do - call the tool now (search_files with a shorter keyword, read_file on a plausibly-named file, or write_file), or if you are truly done, state your final answer without hinting at further steps.'

const SEARCH_THRASHING_NUDGE = 'Multiple attempts in a row found nothing - the paths or search terms you tried do not exist in this repository, likely because they were guessed rather than seen in an actual tool result. Call list_files now to see the real files and folders before trying anything else. If this message never actually named something to find or fix in the code, just answer it directly in plain text instead.'

class AgentSession {
  constructor({ repoRoot, server, getAutoApply }) {
    if (typeof repoRoot !== 'string' || !repoRoot) throw new Error('AgentSession requires repoRoot')
    if (!server) throw new Error('AgentSession requires server')
    if (typeof getAutoApply !== 'function') throw new Error('AgentSession requires getAutoApply')

    this.repoRoot = repoRoot
    this.server = server
    this.getAutoApply = getAutoApply
    this.messages = [{ role: 'system', content: loadSystemPrompt() }]
    this.pendingDiff = null
    this.stopped = false
    this.isRunning = false
    this.hasWrittenAnyFile = false
    this.stallNudgesLeft = MAX_STALL_NUDGES
    this.consecutiveEmptySearches = 0
    this.justNudgedForThrashing = false
    this.abortController = null
  }

  // computeAIConfig already falls back internally if GGUF parsing fails, but
  // this is the last line of defense so a config lookup can never itself take
  // down the run.
  getAIConfig() {
    try {
      const config = computeAIConfig(this.server.selectedModel)
      const contextLength = Number.isFinite(config?.contextLength) && config.contextLength > 0 ? config.contextLength : FALLBACK_CONTEXT_LENGTH
      const maxOutputTokens = Number.isFinite(config?.maxOutputTokens) && config.maxOutputTokens > 0 ? config.maxOutputTokens : FALLBACK_MAX_OUTPUT_TOKENS
      return { contextLength, maxOutputTokens }
    } catch (error) {
      log(`computeAIConfig failed, using fallback sizing: ${error instanceof Error ? error.message : 'unknown error'}`)
      return { contextLength: FALLBACK_CONTEXT_LENGTH, maxOutputTokens: FALLBACK_MAX_OUTPUT_TOKENS }
    }
  }

  // An onEvent handler runs in the caller (IPC broadcast to the renderer) -
  // a failure there should never take down the agent loop itself.
  emit(onEvent, event) {
    try {
      onEvent(event)
    } catch (error) {
      log(`Agent event handler failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  // The agent loop can accumulate many tool calls/results across iterations with
  // nothing else bounding it (unlike regular chat's buildContext, which trims to
  // fit). Drop the oldest tool exchanges - keeping the system prompt and the
  // original problem statement anchored - so requests stay under the model's
  // context window instead of failing outright once it fills up.
  trimToFit() {
    const { contextLength } = this.getAIConfig()
    const charBudget = contextLength * 3

    // A message's real weight includes its tool_calls payload - write_file in
    // particular can carry an entire file's contents as a JSON argument, which
    // was previously left uncounted here and could let real usage run well
    // past this budget despite the check passing.
    const messageChars = (message) => {
      let total = typeof message.content === 'string' ? message.content.length : 0
      if (Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls) {
          total += typeof call?.function?.arguments === 'string' ? call.function.arguments.length : 0
        }
      }
      return total
    }
    const totalChars = () => this.messages.reduce((sum, m) => sum + messageChars(m), 0)

    while (totalChars() > charBudget && this.messages.length > 2) {
      // Remove the oldest droppable message (index 0 is system, index 1 is the
      // original problem - both stay) together with any 'tool' replies that
      // immediately follow it, so no tool result is ever left referencing a
      // tool_call_id that no longer exists in the payload.
      this.messages.splice(2, 1)
      while (this.messages[2]?.role === 'tool') this.messages.splice(2, 1)
    }
  }

  // Local models can return tool call arguments that are missing, not valid
  // JSON, or valid JSON that isn't an object (e.g. an array or a bare string).
  // Any of those should degrade to "no arguments" rather than propagate a
  // wrong-shaped value into a file tool.
  parseToolArguments(toolCall) {
    const raw = toolCall?.function?.arguments
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
    if (typeof raw !== 'string' || !raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  async requestCompletion() {
    this.trimToFit()
    const { maxOutputTokens } = this.getAIConfig()
    this.abortController = new AbortController()
    const response = await fetch(`http://127.0.0.1:${this.server.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: this.abortController.signal,
      body: JSON.stringify({
        messages: this.messages,
        tools: TOOL_SCHEMAS,
        tool_choice: 'auto',
        temperature: 0.6,
        max_tokens: maxOutputTokens,
      }),
    })
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      let detail = ''
      try {
        detail = JSON.parse(errorBody)?.error?.message ?? ''
      } catch {
        detail = errorBody.slice(0, 200)
      }
      throw new Error(`Local AI request failed (${response.status})${detail ? `: ${detail}` : ''}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch {
      throw new Error('Local AI returned invalid JSON')
    }
    const message = payload?.choices?.[0]?.message
    if (!message || typeof message !== 'object') throw new Error('Local AI returned an unexpected response')
    return message
  }

  async requestCompletionWithRetry() {
    let lastError = null
    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      try {
        return await this.requestCompletion()
      } catch (error) {
        if (this.stopped) throw error // user hit Stop - the request was aborted on purpose, don't burn retries on it
        lastError = error
        log(`Agent request attempt ${attempt}/${MAX_REQUEST_ATTEMPTS} failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }
    throw lastError
  }

  async run(problem, onEvent) {
    if (this.isRunning) throw new Error('This agent session is already running')
    if (typeof problem !== 'string' || !problem.trim()) throw new Error('A problem description is required')

    this.isRunning = true
    try {
      await this.executeRun(problem.trim(), onEvent)
    } finally {
      this.isRunning = false
    }
  }

  async executeRun(problem, onEvent) {
    this.messages.push({ role: 'user', content: `Repository root: ${this.repoRoot}\n\nProblem: ${problem}` })

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      if (this.stopped) return
      this.emit(onEvent, { type: 'thinking' })

      let message
      try {
        message = await this.requestCompletionWithRetry()
      } catch (error) {
        if (this.stopped) return // aborted on purpose via stop() - not a failure worth reporting
        const errorMessage = error instanceof Error ? error.message : 'Local AI request failed'
        log(`Agent request failed after ${MAX_REQUEST_ATTEMPTS} attempts: ${errorMessage}`)
        this.emit(onEvent, { type: 'error', message: 'The local model ran into a problem and could not continue after several attempts. Try rephrasing the problem or asking for a smaller change.' })
        return
      }

      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.slice(0, MAX_TOOL_CALLS_PER_RESPONSE) : []
      if (toolCalls.length === 0) {
        // Right after correcting a search/read spiral, accept whatever comes
        // back as final rather than possibly chaining into the stall-nudge too
        // - most likely this was never a real coding task, so forcing yet
        // another tool call would just prolong an already-unproductive run.
        const justRecoveredFromThrashing = this.justNudgedForThrashing
        this.justNudgedForThrashing = false
        const isStalling = !justRecoveredFromThrashing && !this.hasWrittenAnyFile && this.stallNudgesLeft > 0 && iteration < MAX_ITERATIONS - 1
        if (isStalling) {
          this.stallNudgesLeft -= 1
          this.messages.push({ role: 'assistant', content: message.content ?? '' })
          this.messages.push({ role: 'user', content: STALL_NUDGE })
          continue
        }
        this.emit(onEvent, { type: 'final', message: message.content ?? '' })
        return
      }

      this.messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls })

      for (const toolCall of toolCalls) {
        if (this.stopped) return
        const name = toolCall?.function?.name

        let resultText
        if (!name) {
          resultText = 'Error: tool call did not include a tool name'
          this.emit(onEvent, { type: 'tool-result', name: 'unknown', result: resultText })
        } else {
          const args = this.parseToolArguments(toolCall)
          try {
            if (name === 'write_file') {
              resultText = await this.handleWriteFile(args, onEvent)
            } else {
              this.emit(onEvent, { type: 'tool-call', name, args })
              resultText = (await executeReadOnlyTool(this.repoRoot, name, args)) ?? `Unknown tool "${name}"`
              this.emit(onEvent, { type: 'tool-result', name, result: resultText })
            }
          } catch (error) {
            resultText = `Error: ${error instanceof Error ? error.message : 'tool failed'}`
            this.emit(onEvent, { type: 'tool-result', name, result: resultText })
          }
        }

        // A model can spiral into repeatedly searching/reading for something
        // that was never really there (e.g. treating a conversational sentence
        // as if it named something in the code) - bounded separately from the
        // stall-nudge, since this happens while it IS calling tools each time,
        // just unproductively. Covers both search_files finding nothing and
        // read_file being pointed at a file that doesn't exist.
        const isUnproductiveLookup = (name === 'search_files' || name === 'read_file') && typeof resultText === 'string' && (resultText === '(no matches)' || resultText.startsWith('Error:'))
        this.consecutiveEmptySearches = isUnproductiveLookup ? this.consecutiveEmptySearches + 1 : 0

        const truncated = typeof resultText === 'string' && resultText.length > MAX_TOOL_RESULT_CHARS
          ? `${resultText.slice(0, MAX_TOOL_RESULT_CHARS)}\n... truncated`
          : resultText

        // toolCall.id may itself be missing on a malformed response - using it
        // as-is (rather than inventing a replacement) keeps this reply's id
        // consistent with whatever was just recorded on the assistant message
        // above, even in that degenerate case.
        this.messages.push({ role: 'tool', tool_call_id: toolCall?.id, content: truncated ?? '' })
      }

      // Checked once per full response, after every tool call in it has been
      // given its reply - checking inside the loop and breaking early would
      // leave later tool calls in the same response without a matching 'tool'
      // message, which the chat API will reject.
      if (this.consecutiveEmptySearches >= MAX_CONSECUTIVE_EMPTY_SEARCHES) {
        this.consecutiveEmptySearches = 0
        this.justNudgedForThrashing = true
        this.messages.push({ role: 'user', content: SEARCH_THRASHING_NUDGE })
      }
    }

    if (!this.stopped) this.emit(onEvent, { type: 'final', message: 'Stopped after reaching the maximum number of steps without a final answer.' })
  }

  async handleWriteFile(args, onEvent) {
    // A model that emits two write_file calls in one response (or across a
    // parallel batch) before the first is approved would otherwise clobber
    // this.pendingDiff, orphaning the first call's Promise forever.
    if (this.pendingDiff) throw new Error('Another file change is already waiting for approval')

    const before = readFileIfExists(this.repoRoot, args.path)
    const after = typeof args.content === 'string' ? args.content : ''
    const rows = diffLines(before, after)

    this.emit(onEvent, { type: 'tool-call', name: 'write_file', args: { path: args.path } })

    if (this.getAutoApply()) {
      writeFile(this.repoRoot, args.path, after)
      this.hasWrittenAnyFile = true
      this.emit(onEvent, { type: 'diff-applied', path: args.path, rows, auto: true })
      return `Applied. The file "${args.path}" was updated.`
    }

    const approved = await new Promise((resolve) => {
      this.pendingDiff = { path: args.path, resolve }
      this.emit(onEvent, { type: 'diff-pending', path: args.path, rows })
    })

    if (!approved) {
      this.emit(onEvent, { type: 'diff-rejected', path: args.path })
      return `The user rejected this change to "${args.path}". Do not write it again unless asked.`
    }

    writeFile(this.repoRoot, args.path, after)
    this.hasWrittenAnyFile = true
    this.emit(onEvent, { type: 'diff-applied', path: args.path, rows, auto: false })
    return `Applied. The file "${args.path}" was updated.`
  }

  resolveDiff(approved) {
    if (!this.pendingDiff) return
    const { resolve } = this.pendingDiff
    this.pendingDiff = null
    resolve(Boolean(approved))
  }

  stop() {
    this.stopped = true
    this.abortController?.abort()
    this.resolveDiff(false)
  }
}

module.exports = { AgentSession }
