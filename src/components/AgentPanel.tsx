import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FolderOpen, Loader2, Search, Send, Square, Trash2, Wrench } from 'lucide-react'
import type { AgentStep, AgentTranscriptEvent } from '../hooks/useAgentSession'
import { DiffView } from './DiffView'

type AgentPanelProps = {
  repoRoot: string | null
  autoApply: boolean
  isRunning: boolean
  steps: AgentStep[]
  onSelectFolder: () => void
  onClearFolder: () => void
  onSetAutoApply: (value: boolean) => void
  onRun: (problem: string) => void
  onClearHistory: () => void
  onApproveDiff: () => void
  onRejectDiff: () => void
  onStop: () => void
  onClose: () => void
}

export function AgentPanel({ repoRoot, autoApply, isRunning, steps, onSelectFolder, onClearFolder, onSetAutoApply, onRun, onClearHistory, onApproveDiff, onRejectDiff, onStop, onClose }: AgentPanelProps) {
  const [problem, setProblem] = useState('')
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = transcriptRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [steps, isRunning])

  const handleRun = () => {
    const trimmed = problem.trim()
    if (!trimmed || isRunning || !repoRoot) return
    setProblem('')
    onRun(trimmed)
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--main-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-[18px]">
        <div className="flex items-center gap-2 font-semibold"><Wrench size={16} /> Repo Assistant</div>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={onClose}><ArrowLeft size={15} /> Back to Chat</button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--border)] px-5 py-3">
        {repoRoot ? (
          <>
            <span className="min-w-0 flex-1 truncate rounded-lg bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)]" title={repoRoot}>{repoRoot}</span>
            <button type="button" className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={onSelectFolder} disabled={isRunning}>Change</button>
            <button type="button" className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={onClearFolder} disabled={isRunning}>Revoke</button>
          </>
        ) : (
          <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[var(--button-primary)] px-3 py-1.5 text-sm font-medium text-[var(--button-primary-text)]" onClick={onSelectFolder}>
            <FolderOpen size={15} /> Grant folder access
          </button>
        )}
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={autoApply} onChange={(event) => onSetAutoApply(event.target.checked)} />
          Auto-apply changes
        </label>
        {steps.length > 0 && (
          <button type="button" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={onClearHistory} disabled={isRunning} title="Clear this panel's history">
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {steps.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--text-muted)]">
            <Search size={22} />
            <p className="max-w-[46ch] text-sm">Grant a folder, describe a problem, and it will explore the repo, propose fixes, and {autoApply ? 'apply them automatically.' : 'ask you to approve each file change.'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {steps.map(({ id, event }) => <StepView key={id} event={event} onApproveDiff={onApproveDiff} onRejectDiff={onRejectDiff} />)}
            {isRunning && <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 size={14} className="animate-spin" /> Working...</div>}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] px-5 py-3.5">
        <div className="flex items-end gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5">
          <textarea
            rows={1}
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleRun() } }}
            disabled={isRunning || !repoRoot}
            placeholder={repoRoot ? 'Describe the problem to fix...' : 'Grant folder access first...'}
            className="min-h-9 max-h-32 flex-1 resize-none bg-transparent px-1 py-1.5 leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {isRunning ? (
            <button type="button" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--main-bg)]" onClick={onStop} aria-label="Stop agent"><Square size={15} /></button>
          ) : (
            <button type="button" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--button-primary)] text-[var(--button-primary-text)] disabled:cursor-not-allowed disabled:opacity-30" onClick={handleRun} disabled={!problem.trim() || !repoRoot} aria-label="Run"><Send size={15} /></button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepView({ event, onApproveDiff, onRejectDiff }: { event: AgentTranscriptEvent; onApproveDiff: () => void; onRejectDiff: () => void }) {
  if (event.type === 'run-divider') return <div className="my-1 border-t border-dashed border-[var(--border)]" />

  if (event.type === 'user-message') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-[18px] bg-[var(--surface-strong)] px-3.5 py-2.5 text-sm text-[var(--text-primary)]">{event.message}</div>
      </div>
    )
  }

  if (event.type === 'thinking') return null

  if (event.type === 'tool-call') {
    const detail = event.name === 'read_file' || event.name === 'write_file' ? String(event.args.path ?? '') : event.name === 'search_files' ? String(event.args.query ?? '') : String(event.args.path ?? '.')
    return <div className="font-mono text-xs text-[var(--text-muted)]">→ {event.name}({detail})</div>
  }

  if (event.type === 'tool-result') {
    return (
      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-soft)] p-2.5 font-mono text-[0.72rem] text-[var(--text-secondary)]">{event.result.slice(0, 2000)}</pre>
    )
  }

  if (event.type === 'diff-pending') return <DiffView path={event.path} rows={event.rows} status="pending" onApprove={onApproveDiff} onReject={onRejectDiff} />
  if (event.type === 'diff-applied') return <DiffView path={event.path} rows={event.rows} status="applied" />
  if (event.type === 'diff-rejected') return <div className="text-sm text-[#f87171]">Rejected change to {event.path}</div>
  if (event.type === 'final') return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3.5 py-3 text-sm text-[var(--text-primary)]">{event.message}</div>
  if (event.type === 'error') return <div className="rounded-xl border border-[rgba(248,113,113,0.3)] bg-[rgba(239,68,68,0.1)] px-3.5 py-3 text-sm text-[#f87171]">{event.message}</div>
  return null
}
