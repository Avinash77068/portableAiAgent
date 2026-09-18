import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortableAIAgentEvent, PortableAIDiffRow } from '../portableAI'

export type AgentTranscriptEvent = PortableAIAgentEvent | { type: 'user-message'; message: string } | { type: 'run-divider' }
export type AgentStep = { id: number; event: AgentTranscriptEvent }
export type PendingDiff = { path: string; rows: PortableAIDiffRow[] }

export function useAgentSession() {
  const [repoRoot, setRepoRoot] = useState<string | null>(null)
  const [autoApply, setAutoApplyState] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null)
  const stepIdRef = useRef(0)

  useEffect(() => {
    void window.portableAI.agent.getInfo().then((info) => {
      setRepoRoot(info.repoRoot)
      setAutoApplyState(info.autoApply)
    })
  }, [])

  useEffect(() => {
    return window.portableAI.agent.onEvent((event) => {
      stepIdRef.current += 1
      setSteps((previous) => [...previous, { id: stepIdRef.current, event }])
      if (event.type === 'diff-pending') setPendingDiff({ path: event.path, rows: event.rows })
      if (event.type === 'diff-applied' || event.type === 'diff-rejected') setPendingDiff(null)
    })
  }, [])

  const selectFolder = useCallback(async () => {
    const nextRoot = await window.portableAI.agent.selectFolder()
    setRepoRoot(nextRoot)
    return nextRoot
  }, [])

  const clearFolder = useCallback(async () => {
    await window.portableAI.agent.clearFolder()
    setRepoRoot(null)
  }, [])

  const setAutoApply = useCallback(async (value: boolean) => {
    const next = await window.portableAI.agent.setAutoApply(value)
    setAutoApplyState(next)
  }, [])

  const run = useCallback(async (problem: string) => {
    setSteps((previous) => {
      const next = [...previous]
      if (next.length > 0) {
        stepIdRef.current += 1
        next.push({ id: stepIdRef.current, event: { type: 'run-divider' } })
      }
      stepIdRef.current += 1
      next.push({ id: stepIdRef.current, event: { type: 'user-message', message: problem } })
      return next
    })
    setPendingDiff(null)
    setIsRunning(true)
    try {
      await window.portableAI.agent.run(problem)
    } catch (error) {
      stepIdRef.current += 1
      setSteps((previous) => [...previous, { id: stepIdRef.current, event: { type: 'error', message: error instanceof Error ? error.message : 'Could not start the agent' } }])
    } finally {
      setIsRunning(false)
    }
  }, [])

  const clearHistory = useCallback(() => {
    setSteps([])
    setPendingDiff(null)
  }, [])

  const approveDiff = useCallback(() => window.portableAI.agent.approveDiff(), [])
  const rejectDiff = useCallback(() => window.portableAI.agent.rejectDiff(), [])
  const stop = useCallback(() => window.portableAI.agent.stop(), [])

  return { repoRoot, autoApply, isRunning, steps, pendingDiff, selectFolder, clearFolder, setAutoApply, run, clearHistory, approveDiff, rejectDiff, stop }
}
