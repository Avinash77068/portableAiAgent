const { TOOL_SCHEMAS, executeReadOnlyTool } = require('./tools.cjs')
const { readFileIfExists, writeFile } = require('./fileTools.cjs')
const { diffLines } = require('./diff.cjs')
const { log } = require('../ai/logger.cjs')
const { initializeHardware } = require('../hardware/HardwareManager.cjs')

const MAX_ITERATIONS = 14
const MAX_STALL_NUDGES = 4
const MAX_TOOL_RESULT_CHARS = 6000

const SYSTEM_PROMPT = `You are a coding assistant with tool access to a local repository.
Use list_files and search_files to explore, and read_file to inspect a file before changing it.
Always call read_file on a file before calling write_file on it. Make focused, minimal changes
that address the described problem - do not rewrite unrelated parts of a file.

search_files only matches an exact, literal substring - it is not fuzzy and does not understand
multi-word phrases as a concept. If a search for a full phrase (e.g. "navbar hover") returns no
matches, do not give up - retry with a single shorter keyword (e.g. "hover" or "navbar") before
concluding there is nothing to find. Prefer reading a file directly with read_file when its name
or path obviously matches the problem (e.g. a file named Navbar.tsx for a navbar problem) instead
of only relying on text search.

Never describe a tool you are about to call (e.g. "let's search for X" or "next I will read Y") -
call it immediately instead. Only reply with plain text once you have actually used write_file to
apply a fix, or once you have tried at least one narrower search or a direct read_file of a
plausibly-named file and are certain no change is needed.`

const STALL_NUDGE = 'Do not describe what you are about to do - call the tool now (search_files with a shorter keyword, read_file on a plausibly-named file, or write_file), or if you are truly done, state your final answer without hinting at further steps.'

class AgentSession {
  constructor({ repoRoot, server, getAutoApply }) {
    this.repoRoot = repoRoot
    this.server = server
    this.getAutoApply = getAutoApply
    this.messages = [{ role: 'system', content: SYSTEM_PROMPT }]
    this.pendingDiff = null
    this.stopped = false
    this.hasWrittenAnyFile = false
    this.stallNudgesLeft = MAX_STALL_NUDGES
  }

  // The agent loop can accumulate many tool calls/results across iterations with
  // nothing else bounding it (unlike regular chat's buildContext, which trims to
  // fit). Drop the oldest tool exchanges - keeping the system prompt and the
  // original problem statement anchored - so requests stay under the model's
  // context window instead of failing outright once it fills up.
  trimToFit() {
    const contextLength = initializeHardware().recommendedAIConfig.contextLength
    const charBudget = contextLength * 3
    const totalChars = () => this.messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0)

    while (totalChars() > charBudget && this.messages.length > 2) {
      // Remove the oldest droppable message (index 0 is system, index 1 is the
      // original problem - both stay) together with any 'tool' replies that
      // immediately follow it, so no tool result is ever left referencing a
      // tool_call_id that no longer exists in the payload.
      this.messages.splice(2, 1)
      while (this.messages[2]?.role === 'tool') this.messages.splice(2, 1)
    }
  }

  async requestCompletion() {
    this.trimToFit()
    const response = await fetch(`http://127.0.0.1:${this.server.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: this.messages,
        tools: TOOL_SCHEMAS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 1024,
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
    const payload = await response.json()
    const message = payload.choices?.[0]?.message
    if (!message) throw new Error('Local AI returned an unexpected response')
    return message
  }

  async run(problem, onEvent) {
    this.messages.push({ role: 'user', content: `Repository root: ${this.repoRoot}\n\nProblem: ${problem}` })

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      if (this.stopped) return
      onEvent({ type: 'thinking' })

      let message
      try {
        message = await this.requestCompletion()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Local AI request failed'
        log(`Agent request failed: ${errorMessage}`)
        onEvent({ type: 'error', message: errorMessage })
        return
      }

      const toolCalls = message.tool_calls ?? []
      if (toolCalls.length === 0) {
        const isStalling = !this.hasWrittenAnyFile && this.stallNudgesLeft > 0 && iteration < MAX_ITERATIONS - 1
        if (isStalling) {
          this.stallNudgesLeft -= 1
          this.messages.push({ role: 'assistant', content: message.content ?? '' })
          this.messages.push({ role: 'user', content: STALL_NUDGE })
          continue
        }
        onEvent({ type: 'final', message: message.content ?? '' })
        return
      }

      this.messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls })

      for (const toolCall of toolCalls) {
        if (this.stopped) return
        const name = toolCall.function?.name
        let args = {}
        try {
          args = JSON.parse(toolCall.function?.arguments || '{}')
        } catch {
          args = {}
        }

        let resultText
        try {
          if (name === 'write_file') {
            resultText = await this.handleWriteFile(args, onEvent)
          } else {
            onEvent({ type: 'tool-call', name, args })
            resultText = executeReadOnlyTool(this.repoRoot, name, args) ?? `Unknown tool "${name}"`
            onEvent({ type: 'tool-result', name, result: resultText })
          }
        } catch (error) {
          resultText = `Error: ${error instanceof Error ? error.message : 'tool failed'}`
          onEvent({ type: 'tool-result', name, result: resultText })
        }

        const truncated = typeof resultText === 'string' && resultText.length > MAX_TOOL_RESULT_CHARS
          ? `${resultText.slice(0, MAX_TOOL_RESULT_CHARS)}\n... truncated`
          : resultText

        this.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: truncated ?? '' })
      }
    }

    onEvent({ type: 'final', message: 'Stopped after reaching the maximum number of steps without a final answer.' })
  }

  async handleWriteFile(args, onEvent) {
    const before = readFileIfExists(this.repoRoot, args.path)
    const after = typeof args.content === 'string' ? args.content : ''
    const rows = diffLines(before, after)

    onEvent({ type: 'tool-call', name: 'write_file', args: { path: args.path } })

    if (this.getAutoApply()) {
      writeFile(this.repoRoot, args.path, after)
      this.hasWrittenAnyFile = true
      onEvent({ type: 'diff-applied', path: args.path, rows, auto: true })
      return `Applied. The file "${args.path}" was updated.`
    }

    const approved = await new Promise((resolve) => {
      this.pendingDiff = { path: args.path, resolve }
      onEvent({ type: 'diff-pending', path: args.path, rows })
    })

    if (!approved) {
      onEvent({ type: 'diff-rejected', path: args.path })
      return `The user rejected this change to "${args.path}". Do not write it again unless asked.`
    }

    writeFile(this.repoRoot, args.path, after)
    this.hasWrittenAnyFile = true
    onEvent({ type: 'diff-applied', path: args.path, rows, auto: false })
    return `Applied. The file "${args.path}" was updated.`
  }

  resolveDiff(approved) {
    if (!this.pendingDiff) return
    const { resolve } = this.pendingDiff
    this.pendingDiff = null
    resolve(approved)
  }

  stop() {
    this.stopped = true
    this.resolveDiff(false)
  }
}

module.exports = { AgentSession }
