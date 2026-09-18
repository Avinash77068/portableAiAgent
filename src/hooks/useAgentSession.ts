import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortableAIAgentConversation, PortableAIAgentStep, PortableAIDiffRow } from '../portableAI'

export type AgentTranscriptEvent = PortableAIAgentStep['event']
export type AgentStep = { id: number; event: AgentTranscriptEvent }
export type PendingDiff = { path: string; rows: PortableAIDiffRow[] }

// Electron wraps every rejected ipcRenderer.invoke() in boilerplate like
// "Error invoking remote method 'portableai:agent:run': Error: <message>" -
// strip it so the user sees the actual message, not IPC internals.
const cleanIpcErrorMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof Error)) return fallback
  return error.message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '') || fallback
}

export function useAgentSession() {
  const [repoRoot, setRepoRoot] = useState<string | null>(null)
  const [autoApply, setAutoApplyState] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null)
  const [conversations, setConversations] = useState<PortableAIAgentConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const stepIdRef = useRef(0)
  const activeConversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    void window.portableAI.agent.getInfo().then((info) => {
      setRepoRoot(info.repoRoot)
      setAutoApplyState(info.autoApply)
    })
  }, [])

  const refreshConversations = useCallback(async () => {
    const next = await window.portableAI.agentConversations.list()
    setConversations(next)
    return next
  }, [])

  const loadSteps = useCallback(async (conversationId: string) => {
    const persistedSteps = await window.portableAI.agentSteps.list(conversationId)
    setSteps(persistedSteps.map((step) => {
      stepIdRef.current += 1
      return { id: stepIdRef.current, event: step.event }
    }))
  }, [])

  const selectConversation = useCallback(async (conversationId: string) => {
    activeConversationIdRef.current = conversationId
    setActiveConversationId(conversationId)
    setPendingDiff(null)
    await loadSteps(conversationId)
  }, [loadSteps])

  const startNewSession = useCallback(() => {
    activeConversationIdRef.current = null
    setActiveConversationId(null)
    setSteps([])
    setPendingDiff(null)
  }, [])

  useEffect(() => {
    void refreshConversations().then((existing) => {
      if (existing[0]) void selectConversation(existing[0].id)
    })
  }, [refreshConversations, selectConversation])

  useEffect(() => {
    return window.portableAI.agent.onConversationStarted(({ conversationId }) => {
      activeConversationIdRef.current = conversationId
      setActiveConversationId(conversationId)
      void refreshConversations()
    })
  }, [refreshConversations])

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
      const result = await window.portableAI.agent.run(activeConversationIdRef.current, problem)
      activeConversationIdRef.current = result.conversationId
      setActiveConversationId(result.conversationId)
      void refreshConversations()
    } catch (error) {
      stepIdRef.current += 1
      setSteps((previous) => [...previous, { id: stepIdRef.current, event: { type: 'error', message: cleanIpcErrorMessage(error, 'Could not start the agent') } }])
    } finally {
      setIsRunning(false)
    }
  }, [refreshConversations])

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    await window.portableAI.agentConversations.rename(conversationId, title)
    await refreshConversations()
  }, [refreshConversations])

  const deleteConversation = useCallback(async (conversationId: string) => {
    await window.portableAI.agentConversations.delete(conversationId)
    if (activeConversationIdRef.current === conversationId) startNewSession()
    await refreshConversations()
  }, [refreshConversations, startNewSession])

  const approveDiff = useCallback(() => window.portableAI.agent.approveDiff(), [])
  const rejectDiff = useCallback(() => window.portableAI.agent.rejectDiff(), [])
  const stop = useCallback(() => window.portableAI.agent.stop(), [])

  return {
    repoRoot,
    autoApply,
    isRunning,
    steps,
    pendingDiff,
    conversations,
    activeConversationId,
    selectFolder,
    clearFolder,
    setAutoApply,
    run,
    selectConversation,
    startNewSession,
    renameConversation,
    deleteConversation,
    approveDiff,
    rejectDiff,
    stop,
  }
}
