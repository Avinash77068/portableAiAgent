import { Pencil, SquarePen, Trash2 } from 'lucide-react'
import type { PortableAIAgentConversation } from '../portableAI'
import { groupConversations } from '../utils/conversations'

type AgentSidebarProps = {
  conversations: PortableAIAgentConversation[]
  activeConversationId: string | null
  isRunning: boolean
  onNewSession: () => void
  onSelect: (id: string) => void
  onRename: (conversation: PortableAIAgentConversation) => void
  onDelete: (conversation: PortableAIAgentConversation) => void
}

export function AgentSidebar({ conversations, activeConversationId, isRunning, onNewSession, onSelect, onRename, onDelete }: AgentSidebarProps) {
  const groupedConversations = groupConversations(conversations, '')

  return (
    <aside className="flex h-full min-h-0 w-[240px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar-bg)] max-[900px]:w-[200px]">
      <div className="px-3 pb-2 pt-3">
        <span className="block px-1 pb-2 text-[0.8rem] font-semibold text-[var(--text-secondary)]">Repo Assistant</span>
        <button type="button" className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-65" onClick={onNewSession} disabled={isRunning}>
          <SquarePen size={17} /> New session
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable]">
        {conversations.length === 0 ? (
          <div className="px-3 py-[22px] text-xs text-[var(--text-muted)]">
            <strong className="block text-[0.84rem] text-[var(--text-secondary)]">No sessions yet</strong>
            <span>Grant a folder and describe a problem to start one.</span>
          </div>
        ) : (
          Object.entries(groupedConversations).map(([groupName, items]) => items.length > 0 && (
            <div key={groupName} className="mb-3">
              <div className="px-2.5 pb-1 pt-2 text-xs text-[var(--text-muted)]">{groupName}</div>
              <div className="flex flex-col gap-0.5">
                {items.map((conversation) => (
                  <div key={conversation.id} className={`group flex h-9 items-center gap-2 rounded-lg px-2.5 ${conversation.id === activeConversationId ? 'bg-[var(--surface-strong)]' : 'hover:bg-[var(--surface-hover)]'}`}>
                    <button type="button" className="min-w-0 flex-1 truncate bg-transparent p-0 text-left text-sm text-[var(--text-primary)] disabled:opacity-65" onClick={() => onSelect(conversation.id)} disabled={isRunning}>
                      <span className="truncate">{conversation.title}</span>
                    </button>
                    <button type="button" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] opacity-0 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100" onClick={() => onRename(conversation)} aria-label={`Rename ${conversation.title}`}><Pencil size={13} /></button>
                    <button type="button" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] opacity-0 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100" onClick={() => onDelete(conversation)} aria-label={`Delete ${conversation.title}`}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
