import { FileText, X } from 'lucide-react'
import type { PendingAttachment } from '../hooks/useAttachments'

type AttachmentChipProps = {
  attachment: PendingAttachment
  onRemove: (attachmentId: string) => void
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const fileType = attachment.isImage ? 'Image' : attachment.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'File'

  return (
    <div className="flex min-w-[220px] max-w-[280px] shrink-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]">
      <AttachmentThumbnail attachment={attachment} />
      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">{fileType}</span>
      <button type="button" className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)]" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`} title="Remove attachment"><X size={15} /></button>
    </div>
  )
}

function AttachmentThumbnail({ attachment }: { attachment: PendingAttachment }) {
  if (attachment.isImage && attachment.previewUrl) {
    return <img src={attachment.previewUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
  }

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--surface-strong)] text-[var(--text-secondary)]">
      <FileText size={15} />
    </div>
  )
}
