import { Copy, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import type { PortableAIMessage } from '../portableAI'
import { MarkdownRenderer } from './MarkdownRenderer'

type MessageBubbleProps = {
  message: PortableAIMessage
  onCopy: (value: string) => Promise<void> | void
  onEdit: (message: PortableAIMessage) => Promise<void> | void
  onDelete: (message: PortableAIMessage) => Promise<void> | void
  onRegenerate: () => void
  canRegenerate: boolean
}

const actionClass = 'inline-flex items-center justify-center rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
const bodyClass = 'text-[0.97rem] leading-[1.65] text-[var(--text-primary)] [&_h3]:my-2 [&_h3]:text-[1.02rem] [&_li]:my-1 [&_p]:my-1 [&_ul]:my-2 [&_ul]:ml-5 [&_ul]:pl-1 [&_ol]:my-2 [&_ol]:ml-5 [&_ol]:pl-1 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-[10px] [&_pre]:border [&_pre]:border-[rgba(255,255,255,0.12)] [&_pre]:bg-[#050608] [&_pre]:p-3.5 [&_code]:font-mono [&_code]:text-[0.88rem] [&_p_code]:rounded-[5px] [&_p_code]:border [&_p_code]:border-[rgba(255,255,255,0.12)] [&_p_code]:bg-[#0b0d10] [&_p_code]:px-1 [&_p_code]:py-0.5 [&_p_code]:text-[#d6e4ff] [&_li_code]:rounded-[5px] [&_li_code]:border [&_li_code]:border-[rgba(255,255,255,0.12)] [&_li_code]:bg-[#0b0d10] [&_li_code]:px-1 [&_li_code]:py-0.5 [&_li_code]:text-[#d6e4ff]'

export function MessageBubble({ message, onCopy, onEdit, onDelete, onRegenerate, canRegenerate }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="group max-w-[min(70ch,80%)]">
          <div className="rounded-[20px] bg-[var(--surface-strong)] px-4 py-2.5">
            <div className={bodyClass}><MarkdownRenderer content={message.content} onCopy={onCopy} /></div>
          </div>
          <div className="mt-1 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100">
            <button type="button" className={actionClass} onClick={() => onCopy(message.content)} aria-label="Copy"><Copy size={14} /></button>
            <button type="button" className={actionClass} onClick={() => onEdit(message)} aria-label="Edit"><Pencil size={14} /></button>
            <button type="button" className={actionClass} onClick={() => onDelete(message)} aria-label="Delete"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group mx-auto w-full max-w-[48rem]">
      <div className={bodyClass}><MarkdownRenderer content={message.content} onCopy={onCopy} /></div>
      <div className="mt-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button type="button" className={actionClass} onClick={() => onCopy(message.content)} aria-label="Copy"><Copy size={14} /></button>
        <button type="button" className={actionClass} onClick={() => onDelete(message)} aria-label="Delete"><Trash2 size={14} /></button>
        {canRegenerate && <button type="button" className={actionClass} onClick={onRegenerate} aria-label="Regenerate"><RotateCcw size={14} /></button>}
      </div>
    </div>
  )
}

export function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="mx-auto w-full max-w-[48rem]">
      <div className={bodyClass}><MarkdownRenderer content={content} /></div>
    </div>
  )
}
