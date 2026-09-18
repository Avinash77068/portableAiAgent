const { TOOL_SCHEMAS, executeReadOnlyTool } = require('./tools.cjs')
const { readFileIfExists, writeFile } = require('./fileTools.cjs')
const { diffLines } = require('./diff.cjs')
const { log } = require('../ai/logger.cjs')
const { computeAIConfig } = require('../hardware/HardwareManager.cjs')

const MAX_ITERATIONS = 14
const MAX_STALL_NUDGES = 4
const MAX_CONSECUTIVE_EMPTY_SEARCHES = 3
const MAX_TOOL_RESULT_CHARS = 6000
const MAX_REQUEST_ATTEMPTS = 4

const SYSTEM_PROMPT = `You are a coding assistant with tool access to a local repository.

Not every message describes a coding problem. If the message is a greeting, a general question,
an instruction about how you should behave or how the conversation should go, or otherwise doesn't
name or imply a concrete problem to find or fix in the repository, just reply in plain text
directly - do not call a tool just to have called one.

When it IS a concrete problem: use list_files and search_files to explore, and read_file to inspect
a file before changing it. Always call read_file on a file before calling write_file on it. Make
focused, minimal changes that address the described problem - do not rewrite unrelated parts of a file.

Never guess a file path from the wording of the problem (e.g. turning words from the request into
something like "main-update.md") - file names in the repository have no relation to the words the
user happened to use. If you do not already know the exact path from an earlier list_files or
search_files result in this conversation, call list_files first to see what is actually there.
Never call read_file twice on paths you invented rather than saw in a real tool result.

search_files only matches an exact, literal substring - it is not fuzzy and does not understand
multi-word phrases as a concept. If a search for a full phrase (e.g. "navbar hover") returns no
matches, you may retry ONCE with a single shorter keyword (e.g. "hover" or "navbar") - never split
a query into more than one retry, and never search for fragments of a sentence that was not itself
naming something in the code (a conversational instruction is not a search query). Prefer reading a
file directly with read_file when its name or path obviously matches the problem (e.g. a file named
Navbar.tsx for a navbar problem) instead of only relying on text search - but only when that name
came from an actual list_files/search_files result, not a guess.

Never describe a tool you are about to call (e.g. "let's search for X" or "next I will read Y") -
call it immediately instead. Only reply with plain text once you have actually used write_file to
apply a fix, once you have tried a search or a direct read_file of a plausibly-named file and are
certain no change is needed, or because the message never needed a tool in the first place.`

const STALL_NUDGE = 'Do not describe what you are about to do - call the tool now (search_files with a shorter keyword, read_file on a plausibly-named file, or write_file), or if you are truly done, state your final answer without hinting at further steps.'

const SEARCH_THRASHING_NUDGE = 'Multiple attempts in a row found nothing - the paths or search terms you tried do not exist in this repository, likely because they were guessed rather than seen in an actual tool result. Call list_files now to see the real files and folders before trying anything else. If this message never actually named something to find or fix in the code, just answer it directly in plain text instead.'

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
    this.consecutiveEmptySearches = 0
    this.justNudgedForThrashing = false
  }

  // The agent loop can accumulate many tool calls/results across iterations with
  // nothing else bounding it (unlike regular chat's buildContext, which trims to
  // fit). Drop the oldest tool exchanges - keeping the system prompt and the
  // original problem statement anchored - so requests stay under the model's
  // context window instead of failing outright once it fills up.
  trimToFit() {
    const contextLength = computeAIConfig(this.server.selectedModel).contextLength
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
    const maxTokens = computeAIConfig(this.server.selectedModel).maxOutputTokens
    const response = await fetch(`http://127.0.0.1:${this.server.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: this.messages,
        tools: TOOL_SCHEMAS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: maxTokens,
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
  async requestCompletionWithRetry() {
    let lastError = null
    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      try {
        return await this.requestCompletion()
      } catch (error) {
        lastError = error
        log(`Agent request attempt ${attempt}/${MAX_REQUEST_ATTEMPTS} failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }
    throw lastError
  }

  async run(problem, onEvent) {
    this.messages.push({ role: 'user', content: `Repository root: ${this.repoRoot}\n\nProblem: ${problem}` })

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      if (this.stopped) return
      onEvent({ type: 'thinking' })

      let message
      try {
        message = await this.requestCompletionWithRetry()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Local AI request failed'
        log(`Agent request failed after ${MAX_REQUEST_ATTEMPTS} attempts: ${errorMessage}`)
        onEvent({ type: 'error', message: 'The local model ran into a problem and could not continue after several attempts. Try rephrasing the problem or asking for a smaller change.' })
        return
      }

      const toolCalls = message.tool_calls ?? []
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

        this.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: truncated ?? '' })
      }

      if (this.consecutiveEmptySearches >= MAX_CONSECUTIVE_EMPTY_SEARCHES) {
        this.consecutiveEmptySearches = 0
        this.justNudgedForThrashing = true
        this.messages.push({ role: 'user', content: SEARCH_THRASHING_NUDGE })
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
