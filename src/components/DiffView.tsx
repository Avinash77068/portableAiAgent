import type { PortableAIDiffRow } from '../portableAI'

type DiffViewProps = {
  path: string
  rows: PortableAIDiffRow[]
  status?: 'pending' | 'applied' | 'rejected'
  onApprove?: () => void
  onReject?: () => void
}

const rowClass: Record<PortableAIDiffRow['type'], string> = {
  add: 'bg-[rgba(34,197,94,0.14)] text-[#4ade80]',
  remove: 'bg-[rgba(239,68,68,0.12)] text-[#f87171] line-through decoration-1',
  context: 'text-[var(--text-muted)]',
}

const rowPrefix: Record<PortableAIDiffRow['type'], string> = { add: '+', remove: '-', context: ' ' }

export function DiffView({ path, rows, status = 'pending', onApprove, onReject }: DiffViewProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
        <span className="truncate font-mono">{path}</span>
        {status === 'applied' && <span className="shrink-0 text-[#4ade80]">Applied</span>}
        {status === 'rejected' && <span className="shrink-0 text-[#f87171]">Rejected</span>}
      </div>
      <div className="max-h-64 overflow-y-auto px-3 py-2 font-mono text-[0.8rem] leading-[1.6]">
        {rows.map((row, index) => (
          <div key={index} className={`whitespace-pre-wrap ${rowClass[row.type]}`}>
            {rowPrefix[row.type]} {row.line}
          </div>
        ))}
      </div>
      {status === 'pending' && onApprove && onReject && (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
          <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={onReject}>Reject</button>
          <button type="button" className="rounded-lg bg-[var(--button-primary)] px-3 py-1.5 text-sm font-medium text-[var(--button-primary-text)]" onClick={onApprove}>Apply</button>
        </div>
      )}
    </div>
  )
}
