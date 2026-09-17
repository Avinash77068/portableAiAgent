import { LoaderCircle } from 'lucide-react'
import type { PendingAttachment } from '../hooks/useAttachments'
import { AttachmentChip } from './AttachmentChip'

type AttachmentPreviewProps = {
  attachments: PendingAttachment[]
  loading: boolean
  onRemove: (attachmentId: string) => void
}

export function AttachmentPreview({ attachments, loading, onRemove }: AttachmentPreviewProps) {
  if (loading) {
    return (
      <div className="mx-auto mt-2 flex w-full max-w-[980px] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        <LoaderCircle size={15} className="animate-spin" />
        <span>Reading attachment locally...</span>
      </div>
    )
  }

  if (attachments.length === 0) return null

  return (
    <div className="mt-2 flex w-full gap-2 overflow-x-auto pb-1">
      {attachments.map((attachment) => (
        <AttachmentChip key={attachment.id} attachment={attachment} onRemove={onRemove} />
      ))}
    </div>
  )
}
