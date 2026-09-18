import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Globe,
  MoonStar,
  Paperclip,
  Settings,
  ShieldCheck,
  SunMedium,
  Wrench,
  X,
} from 'lucide-react'
import { welcomePrompts } from './data/demoData'
import { MessageBubble, StreamingBubble } from './components/MessageBubble'
import { AttachmentPreview } from './components/AttachmentPreview'
import { AgentPanel } from './components/AgentPanel'
import { Sidebar } from './components/Sidebar'
import { SplashScreen } from './components/SplashScreen'
import { useTheme, type ThemeMode } from './hooks/useTheme'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSplashScreen } from './hooks/useSplashScreen'
import { useAttachments, type PendingAttachment, supportedAttachmentExtensions } from './hooks/useAttachments'
import { useAgentSession } from './hooks/useAgentSession'
import { createConversationTitle, groupConversations } from './utils/conversations'
import { formatAIStatus, formatMemory, formatProfile } from './utils/formatters'
import type { PortableAIConversation, PortableAIHardwareInfo, PortableAIMessage, PortableAIModel, PortableAIStatus } from './portableAI'

type ToastState = {
  id: number
  message: string
}


function App() {
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [conversations, setConversations] = useState<PortableAIConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<PortableAIMessage[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [draft, setDraft] = useState('')
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAgentOpen, setIsAgentOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const agentSession = useAgentSession()
  const [toast, setToast] = useState<ToastState | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hardwareInfo, setHardwareInfo] = useState<PortableAIHardwareInfo | null>(null)
  const [aiModels, setAiModels] = useState<PortableAIModel[]>([])
  const [aiStatus, setAiStatus] = useState<PortableAIStatus | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [editingMessage, setEditingMessage] = useState<PortableAIMessage | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [renamingConversation, setRenamingConversation] = useState<PortableAIConversation | null>(null)
  const [renamingTitle, setRenamingTitle] = useState('')
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesWrapRef = useRef<HTMLDivElement | null>(null)
  const isNearBottomRef = useRef(true)
  const startupChatCreatedRef = useRef(false)

  useTheme(theme)
  const isSplashVisible = useSplashScreen(isLoading)

  const refreshConversations = async () => {
    const nextConversations = await window.portableAI.conversations.list()
    setConversations(nextConversations)
    return nextConversations
  }

  useEffect(() => {
    void refreshConversations()
      .then(async (existingConversations) => {
        if (startupChatCreatedRef.current) return
        startupChatCreatedRef.current = true
        if (existingConversations[0]) {
          setSelectedId(existingConversations[0].id)
          return
        }
        const startupConversation = await window.portableAI.conversations.create()
        setConversations([startupConversation])
        setSelectedId(startupConversation.id)
      })
      .catch(() => showToast('Could not load conversations'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    void window.portableAI.hardware.getInfo()
      .then(setHardwareInfo)
      .catch(() => showToast('Hardware information unavailable'))
  }, [])

  useEffect(() => {
    const removeStatusListener = window.portableAI.ai.onStatus(setAiStatus)
    const removeStreamListener = window.portableAI.ai.onStream((event) => {
      setStreamingText((current) => current + event.delta)
    })

    void Promise.all([
      window.portableAI.ai.getModels().then(setAiModels),
      window.portableAI.ai.getStatus().then(setAiStatus),
    ]).catch(() => setAiStatus(null))

    return () => {
      removeStatusListener()
      removeStreamListener()
    }
  }, [])

  useEffect(() => {
    isNearBottomRef.current = true
    setShowJumpToLatest(false)
    if (!selectedId) {
      setMessages([])
      return
    }

    void window.portableAI.messages.list(selectedId)
      .then(setMessages)
      .catch(() => showToast('Could not load messages'))
  }, [selectedId])

  useEffect(() => {
    const container = messagesWrapRef.current
    if (!container || !isNearBottomRef.current) return
    container.scrollTop = container.scrollHeight
  }, [messages, streamingText])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useKeyboardShortcuts({ isSettingsOpen, searchInputRef, onNewChat: () => void handleNewChat(), onCloseSettings: () => setIsSettingsOpen(false) })

  const groupedConversations = useMemo(() => groupConversations(conversations, searchValue), [conversations, searchValue])

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  )

  const showToast = (message: string) => {
    setToast({ id: Date.now(), message })
  }

  const { pendingAttachments, isReadingAttachment, addFile, removeAttachment, reset: resetAttachments } = useAttachments(showToast)

  const handleNewChat = async () => {
    if (isSending) return
    try {
      const nextConversation = await window.portableAI.conversations.create()
      setConversations((previous) => [nextConversation, ...previous])
      setSelectedId(nextConversation.id)
      setMessages([])
      setSearchValue('')
      setDraft('')
      resetAttachments()
      if (composerRef.current) composerRef.current.style.height = 'auto'
      showToast('New chat created')
    } catch {
      showToast('Could not create chat')
    }
  }

  const handleRename = async (conversation: PortableAIConversation) => {
    if (isSending) return
    setRenamingConversation(conversation)
    setRenamingTitle(conversation.title)
  }

  const handleSaveRename = async () => {
    if (!renamingConversation) return
    const nextTitle = renamingTitle.trim()
    if (!nextTitle) {
      showToast('Title cannot be empty')
      return
    }
    if (nextTitle === renamingConversation.title) {
      setRenamingConversation(null)
      return
    }

    try {
      const renamed = await window.portableAI.conversations.rename(renamingConversation.id, nextTitle)
      setConversations((previous) => previous.map((item) => item.id === renamed.id ? renamed : item))
      setRenamingConversation(null)
      showToast('Conversation renamed')
    } catch {
      showToast('Could not rename conversation')
    }
  }

  const handleDelete = async (conversationId: string) => {
    if (isSending) return
    if (!window.confirm('Delete this conversation?\n\nThis action cannot be undone.')) return

    try {
      await window.portableAI.conversations.delete(conversationId)
      const remaining = conversations.filter((conversation) => conversation.id !== conversationId)
      setConversations(remaining)
      if (selectedId === conversationId) {
        setSelectedId(remaining[0]?.id ?? null)
        setMessages([])
      }
      showToast('Conversation deleted')
    } catch {
      showToast('Could not delete conversation')
    }
  }

  const generateAssistantResponse = async (conversationId: string, attachments: PendingAttachment[] = []) => {
    setStreamingText('')
    const result = await window.portableAI.ai.generate(conversationId, attachments, webSearchEnabled)
    if (!result.text && result.stopped) return true
    if (!result.text) throw new Error('Local AI returned an empty response')
    const assistantMessage = await window.portableAI.messages.create(conversationId, 'assistant', result.text)
    setMessages((previous) => [...previous, assistantMessage])
    setStreamingText('')
    if (result.usedWebSearch) showToast('Searched the web for this answer')
    if (result.error) throw new Error(result.error)
    return result.stopped
  }

  const handleSend = async () => {
    if (isSending) return
    const trimmed = draft.trim()
    if (!trimmed && pendingAttachments.length === 0) {
      return
    }

    if (pendingAttachments.some((attachment) => attachment.isImage)) {
      showToast('Selected model does not support image understanding.')
      return
    }

    const requestText = trimmed || `Please analyze the ${pendingAttachments.length} attached file${pendingAttachments.length === 1 ? '' : 's'}.`
    const attachmentSummary = pendingAttachments.map((attachment) => attachment.name).join(', ')
    const storedMessageText = pendingAttachments.length > 0 ? `${requestText}\n\nAttached files: ${attachmentSummary}` : requestText

    setIsSending(true)
    try {
      let targetId = selectedId
      if (!targetId) {
        const created = await window.portableAI.conversations.create()
        targetId = created.id
        setConversations((previous) => [created, ...previous])
        setSelectedId(targetId)
      }

      const userMessage = await window.portableAI.messages.create(targetId, 'user', storedMessageText)
      setMessages((previous) => [...previous, userMessage])

      const attachmentsToSend = pendingAttachments
      setDraft('')
      resetAttachments()
      if (composerRef.current) composerRef.current.style.height = 'auto'

      const currentConversation = conversations.find((conversation) => conversation.id === targetId)
      if (!selectedId || currentConversation?.title === 'New Chat') {
        await window.portableAI.conversations.rename(targetId, createConversationTitle(trimmed || attachmentsToSend[0]?.name || 'Attached file'))
      }
      const wasStopped = await generateAssistantResponse(targetId, attachmentsToSend)
      await refreshConversations()
      showToast(wasStopped ? 'Partial response saved' : 'Local response generated')
    } catch {
      setStreamingText('')
      showToast(aiStatus?.message ?? 'Local AI could not generate a response')
    } finally {
      setIsSending(false)
      window.setTimeout(() => composerRef.current?.focus(), 20)
    }
  }

  const handleRegenerate = async () => {
    if (!selectedId || isSending) return
    const previousAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    if (!previousAssistant) return

    setIsSending(true)
    try {
      await window.portableAI.messages.delete(previousAssistant.id)
      setMessages((previous) => previous.filter((message) => message.id !== previousAssistant.id))
      await generateAssistantResponse(selectedId)
      showToast('Response regenerated')
    } catch {
      setStreamingText('')
      showToast(aiStatus?.message ?? 'Could not regenerate response')
    } finally {
      setIsSending(false)
    }
  }

  const handleEditMessage = async (message: PortableAIMessage) => {
    if (isSending || message.role !== 'user') return
    setEditingMessage(message)
    setEditingContent(message.content)
  }

  const handleSaveEdit = async () => {
    if (!editingMessage) return
    const nextContent = editingContent.trim()
    if (!nextContent) {
      showToast('Message cannot be empty')
      return
    }
    if (nextContent === editingMessage.content) {
      setEditingMessage(null)
      return
    }

    try {
      const updatedMessage = await window.portableAI.messages.update(editingMessage.id, nextContent)
      setMessages((previous) => previous.map((item) => item.id === updatedMessage.id ? updatedMessage : item))
      await refreshConversations()
      setEditingMessage(null)
      showToast('Message updated')
    } catch {
      showToast('Could not update message')
    }
  }

  const handleDeleteMessage = async (message: PortableAIMessage) => {
    if (isSending) return
    if (!window.confirm('Delete this message?\n\nThis action cannot be undone.')) return

    try {
      await window.portableAI.messages.delete(message.id)
      setMessages((previous) => previous.filter((item) => item.id !== message.id))
      await refreshConversations()
      showToast('Message deleted')
    } catch {
      showToast('Could not delete message')
    }
  }

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast('Copied')
    } catch {
      showToast('Copy failed')
    }
  }

  const handleAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) addFile(file)
    event.target.value = ''
  }

  const handleDraftChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  const latestAssistantId = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant')?.id ?? null,
    [messages],
  )

  const handleMessagesScroll = () => {
    const container = messagesWrapRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const isNearBottom = distanceFromBottom < 80
    isNearBottomRef.current = isNearBottom
    setShowJumpToLatest(!isNearBottom)
  }

  const jumpToLatest = () => {
    const container = messagesWrapRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
    isNearBottomRef.current = true
    setShowJumpToLatest(false)
  }

  if (isSplashVisible) return <SplashScreen />

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      {!isAgentOpen && (
        <Sidebar
          collapsed={sidebarCollapsed}
          conversations={conversations}
          groupedConversations={groupedConversations}
          selectedId={selectedId}
          searchValue={searchValue}
          isSending={isSending}
          aiStatusLabel={formatAIStatus(aiStatus)}
          hasStatusError={aiStatus?.state === 'ERROR' || !aiStatus?.runtimeAvailable}
          searchInputRef={searchInputRef}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          onNewChat={() => void handleNewChat()}
          onSearchChange={setSearchValue}
          onSelect={setSelectedId}
          onRename={handleRename}
          onDelete={handleDelete}
          onSettings={() => setIsSettingsOpen(true)}
        />
      )}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--main-bg)]">
        {isAgentOpen ? (
          <AgentPanel
            repoRoot={agentSession.repoRoot}
            autoApply={agentSession.autoApply}
            isRunning={agentSession.isRunning}
            steps={agentSession.steps}
            conversations={agentSession.conversations}
            activeConversationId={agentSession.activeConversationId}
            onSelectFolder={() => void agentSession.selectFolder()}
            onClearFolder={() => void agentSession.clearFolder()}
            onSetAutoApply={(value) => void agentSession.setAutoApply(value)}
            onRun={(problem) => void agentSession.run(problem)}
            onSelectConversation={(id) => void agentSession.selectConversation(id)}
            onStartNewSession={agentSession.startNewSession}
            onRenameConversation={(id, title) => void agentSession.renameConversation(id, title)}
            onDeleteConversation={(id) => void agentSession.deleteConversation(id)}
            onApproveDiff={() => void agentSession.approveDiff()}
            onRejectDiff={() => void agentSession.rejectDiff()}
            onStop={() => void agentSession.stop()}
            onClose={() => setIsAgentOpen(false)}
          />
        ) : (
          <>
        <header className="flex items-center justify-between gap-[18px] bg-[var(--header-bg)] px-5 pb-3 pt-[18px]">
          <div className="relative flex flex-1 items-center gap-2.5">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.95rem] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              onClick={() => setIsModelMenuOpen((value) => !value)}
              aria-expanded={isModelMenuOpen}
              aria-haspopup="listbox"
            >
              <span>{aiStatus?.selectedModel?.displayName ?? 'Local Model'}</span>
              <ChevronDown size={15} className="text-[var(--text-muted)]" />
            </button>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
              <span className={`size-1.5 rounded-full bg-[var(--success)] ${aiStatus?.state === 'ERROR' || !aiStatus?.runtimeAvailable ? 'bg-orange-500' : ''}`} />
              {formatAIStatus(aiStatus)}
            </div>

            {isModelMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsModelMenuOpen(false)} />
                <div className="absolute left-0 top-11 z-40 w-64 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--modal-bg)] py-1.5 shadow-[0_18px_34px_rgba(15,23,42,0.18)]" role="listbox">
                  {aiModels.length === 0 ? (
                    <div className="px-3.5 py-2.5 text-sm text-[var(--text-muted)]">No local model found</div>
                  ) : aiModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={model.id === aiStatus?.selectedModel?.id}
                      disabled={isSending}
                      className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${model.id === aiStatus?.selectedModel?.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
                      onClick={() => {
                        setIsModelMenuOpen(false)
                        if (model.id === aiStatus?.selectedModel?.id) return
                        void window.portableAI.ai.selectModel(model.id)
                          .then(setAiStatus)
                          .catch(() => showToast('Could not select model'))
                      }}
                    >
                      <span className="truncate">{model.displayName}</span>
                      {model.id === aiStatus?.selectedModel?.id && <Check size={14} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button type="button" className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => setIsAgentOpen(true)} aria-label="Open repo assistant" title="Repo Assistant">
              <Wrench size={17} />
            </button>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunMedium size={17} /> : <MoonStar size={17} />}
            </button>
            <button type="button" className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => setIsSettingsOpen(true)} aria-label="Open settings">
              <Settings size={17} />
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex min-h-full items-center justify-center"><div className="max-w-[900px] px-5 py-8 text-center"><p>Loading conversations...</p></div></div>
        ) : selectedConversation ? (
          <div className="flex h-full min-h-0 flex-col">
            <div ref={messagesWrapRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-3 pt-5 [scrollbar-gutter:stable]" onScroll={handleMessagesScroll}>
              {messages.length === 0 ? (
                <div className="flex min-h-full flex-col items-center justify-center text-center">
                  <h2 className="text-[2rem] font-semibold tracking-[-0.02em]">What can I help with?</h2>
                  <div className="mt-6 grid grid-cols-2 gap-2.5 max-[900px]:grid-cols-1">
                    {welcomePrompts.map((prompt) => (
                      <button key={prompt} type="button" className="rounded-2xl border border-[var(--border)] bg-transparent px-[18px] py-[14px] text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => setDraft(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-[980px] flex-col gap-[18px]">
                  {messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onCopy={handleCopy}
                      onEdit={handleEditMessage}
                      onDelete={handleDeleteMessage}
                      onRegenerate={handleRegenerate}
                      canRegenerate={message.id === latestAssistantId}
                    />
                  ))}
                  {streamingText && <StreamingBubble content={streamingText} />}
                </div>
              )}
              {showJumpToLatest && <button type="button" className="sticky bottom-3 mx-auto mt-3 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2.5 py-1.5 text-[var(--text-primary)] shadow-[0_8px_22px_rgba(15,23,42,0.16)]" onClick={jumpToLatest}>↓ Jump to latest</button>}
            </div>

            <div className="bg-[var(--main-bg)] px-[22px] pb-5 pt-2.5">
                <AttachmentPreview attachments={pendingAttachments} loading={isReadingAttachment} onRemove={removeAttachment} />
              <div className="mx-auto flex min-w-0 max-w-[820px] items-end gap-2 rounded-[28px] border border-[var(--border)] bg-[var(--composer-bg)] px-3 pb-2.5 pt-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                <label className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" title="Attach PDF, text, code, or image">
                  <Paperclip size={17} />
                  <input type="file" accept={[...supportedAttachmentExtensions].join(',')} onChange={handleAttachment} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
                <button
                  type="button"
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm ${webSearchEnabled ? 'border-transparent bg-[var(--accent)] text-[var(--button-primary-text)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
                  onClick={() => setWebSearchEnabled((value) => !value)}
                  title="Search the web for this message"
                  aria-pressed={webSearchEnabled}
                >
                  <Globe size={15} />
                  Search
                </button>
                  <textarea
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  onChange={handleDraftChange}
                  onKeyDown={handleComposerKeyDown}
                  disabled={isSending}
                  placeholder="Message PORTABLE.AI..."
                  className="min-h-9 max-h-[180px] flex-1 resize-none bg-transparent px-1 py-1.5 leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
                {isSending ? (
                  <button type="button" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--main-bg)]" onClick={() => void window.portableAI.ai.stopGeneration()} aria-label="Stop generating">
                    <X size={16} />
                  </button>
                ) : (
                  <button type="button" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--button-primary)] text-[var(--button-primary-text)] disabled:cursor-not-allowed disabled:opacity-30" onClick={handleSend} disabled={isReadingAttachment || (!draft.trim() && pendingAttachments.length === 0)} aria-label="Send message">
                    <ArrowUp size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center">
            <div className="max-w-[900px] px-5 py-8 text-center">
              <h1 className="text-[2rem] font-semibold tracking-[-0.02em]">What can I help with?</h1>
              <div className="mt-6 grid grid-cols-2 gap-2.5 max-[900px]:grid-cols-1">
                {welcomePrompts.map((prompt) => (
                  <button key={prompt} type="button" className="rounded-2xl border border-[var(--border)] bg-transparent px-[18px] py-[14px] text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => setDraft(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </main>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(15,23,42,0.54)]" onClick={() => setIsSettingsOpen(false)}>
          <div className="max-h-[86vh] w-[min(720px,calc(100vw-32px))] overflow-auto rounded-[22px] border border-[var(--border)] bg-[var(--modal-bg)] shadow-[0_40px_60px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-[18px]">
              <h3>Settings</h3>
              <button type="button" className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]" onClick={() => setIsSettingsOpen(false)} aria-label="Close settings">
                <X size={15} />
              </button>
            </div>

            <div className="grid gap-4 px-5 pb-5 pt-[18px]">
              <Section title="General">
                <SettingRow label="Language" value="English" />
                <SettingRow label="Startup behavior" value="Open last chat" />
              </Section>

              <Section title="Appearance">
                <div className="grid grid-cols-3 gap-2">
                  {['Dark', 'Light', 'System'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`rounded-[10px] border border-[var(--border)] px-2 py-[9px] text-[var(--text-primary)] ${theme === option.toLowerCase() || (theme === 'system' && option === 'System') ? 'border-transparent bg-[var(--button-primary)] text-[var(--button-primary-text)]' : 'bg-transparent'}`}
                      onClick={() => {
                        const value = option.toLowerCase() as ThemeMode
                        setTheme(value)
                        showToast(`${option} theme selected`)
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="AI">
                <label className="text-[0.78rem] text-[var(--text-secondary)]" htmlFor="local-model">Local Model</label>
                <select
                  id="local-model"
                  className="w-full rounded-[9px] border border-[var(--border)] bg-[var(--surface-soft)] px-[9px] py-2 text-[var(--text-primary)]"
                  value={aiStatus?.selectedModel?.id ?? ''}
                  disabled={aiModels.length === 0 || isSending}
                  onChange={(event) => {
                    void window.portableAI.ai.selectModel(event.target.value)
                      .then(setAiStatus)
                      .catch(() => showToast('Could not select model'))
                  }}
                >
                  {aiModels.length === 0 ? <option value="">No local model found</option> : aiModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}
                </select>
                {aiModels.length === 0 && <div className="text-[0.74rem] leading-snug text-[var(--text-muted)]">Place a compatible .gguf file inside models/.</div>}
                <SettingRow label="AI Status" value={formatAIStatus(aiStatus)} />
              </Section>

              <Section title="Performance">
                <div className="mb-2.5 inline-flex w-fit items-center rounded-lg border border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.12)] px-[9px] py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-[var(--success)]">{hardwareInfo ? formatProfile(hardwareInfo.performanceProfile) : 'Detecting'}</div>
                <SettingRow label="System Memory" value={hardwareInfo ? formatMemory(hardwareInfo.totalRamBytes) : 'Detecting'} />
                <SettingRow label="Available Memory" value={hardwareInfo ? formatMemory(hardwareInfo.availableRamBytes) : 'Detecting'} />
                <SettingRow label="CPU" value={hardwareInfo?.cpuModel ?? 'Detecting'} />
                <SettingRow label="CPU Cores" value={hardwareInfo ? `${hardwareInfo.physicalCores ?? 'Unknown'} physical / ${hardwareInfo.logicalCores} logical` : 'Detecting'} />
                <SettingRow label="Recommended Threads" value={hardwareInfo ? `${hardwareInfo.recommendedThreads} (Automatic)` : 'Detecting'} />
                <SettingRow label="Architecture" value={hardwareInfo ? hardwareInfo.architecture : 'Detecting'} />
                <SettingRow label="Memory Status" value={hardwareInfo ? hardwareInfo.memoryPressure : 'Detecting'} />
                <SettingRow label="Context Length" value={hardwareInfo ? `${hardwareInfo.recommendedAIConfig.contextLength} (Automatic)` : 'Detecting'} />
                <SettingRow label="Maximum Output" value={hardwareInfo ? `${hardwareInfo.recommendedAIConfig.maxOutputTokens} (Automatic)` : 'Detecting'} />
                <SettingRow label="Temperature" value={hardwareInfo ? String(hardwareInfo.recommendedAIConfig.temperature) : 'Detecting'} />
                <SettingRow label="GPU Layers" value={hardwareInfo ? `${hardwareInfo.recommendedAIConfig.gpuLayers} (Automatic)` : 'Detecting'} />
              </Section>

              <Section title="Privacy">
                <div className="grid gap-2 text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> Local-first architecture</span>
                  <span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> No cloud AI - all responses generated on this device</span>
                  <span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> No telemetry</span>
                  <span className="inline-flex items-center gap-2"><Globe size={14} /> Web Search (optional, per-message) sends your message to DuckDuckGo</span>
                </div>
              </Section>

              <Section title="Storage">
                <SettingRow label="Portable USB Storage" value="Ready" />
              </Section>

              <Section title="About">
                <div className="grid gap-1 text-[var(--text-secondary)]">
                  <div className="text-base font-bold text-[var(--text-primary)]">PORTABLE.AI</div>
                  <div className="text-[0.9rem]">Version: 0.1.0</div>
                  <div className="text-[0.9rem]">Private local AI assistant for Windows.</div>
                </div>
              </Section>
            </div>
          </div>
        </div>
      )}

      {renamingConversation && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(15,23,42,0.54)]" onClick={() => setRenamingConversation(null)}>
          <div className="w-[min(520px,calc(100vw-40px))] rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-0 pb-[18px] pt-0">
              <h3>Rename conversation</h3>
              <button type="button" className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-primary)]" onClick={() => setRenamingConversation(null)} aria-label="Close rename dialog"><X size={15} /></button>
            </div>
            <input className="mt-4 w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]" value={renamingTitle} onChange={(event) => setRenamingTitle(event.target.value)} autoFocus />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-transparent px-[9px] py-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => setRenamingConversation(null)}>Cancel</button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--button-primary)] px-4 font-semibold text-[var(--button-primary-text)]" onClick={() => void handleSaveRename()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {editingMessage && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(15,23,42,0.54)]" onClick={() => setEditingMessage(null)}>
          <div className="w-[min(520px,calc(100vw-40px))] rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-0 pb-[18px] pt-0">
              <h3>Edit message</h3>
              <button type="button" className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-primary)]" onClick={() => setEditingMessage(null)} aria-label="Close edit dialog"><X size={15} /></button>
            </div>
            <textarea className="mt-4 min-h-[120px] w-full resize-y rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 leading-6 text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]" value={editingContent} onChange={(event) => setEditingContent(event.target.value)} autoFocus rows={5} />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-transparent px-[9px] py-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => setEditingMessage(null)}>Cancel</button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--button-primary)] px-4 font-semibold text-[var(--button-primary-text)]" onClick={() => void handleSaveEdit()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-[rgba(148,163,184,0.22)] bg-[rgba(15,23,42,0.92)] px-3.5 py-2.5 text-[#f8fafc] shadow-[0_18px_28px_rgba(15,23,42,0.24)]">{toast.message}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface-soft)]">
      <div className="bg-[rgba(148,163,184,0.08)] px-3 py-2.5 text-[0.76rem] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{title}</div>
      <div className="grid gap-2 p-3">{children}</div>
    </div>
  )
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-5 px-1 py-2 text-[var(--text-secondary)]">
      <span>{label}</span>
      <strong className="font-semibold text-[var(--text-primary)]">{value}</strong>
    </div>
  )
}

export default App
