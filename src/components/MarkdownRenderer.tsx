import { Check } from 'lucide-react'
import type React from 'react'

type MarkdownRendererProps = {
  content: string
  onCopy?: (value: string) => Promise<void> | void
}

export function MarkdownRenderer({ content, onCopy }: MarkdownRendererProps) {
  const segments: Array<{ type: 'text' | 'code'; value: string; lang?: string }> = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  let lastIndex = 0

  for (const match of content.matchAll(regex)) {
    const [full, lang, code] = match
    if (match.index !== undefined) {
      const before = content.slice(lastIndex, match.index)
      if (before.trim()) segments.push({ type: 'text', value: before })
      segments.push({ type: 'code', value: code.trim(), lang: lang ?? 'text' })
      lastIndex = match.index + full.length
    }
  }

  if (lastIndex < content.length) segments.push({ type: 'text', value: content.slice(lastIndex) })

  return (
    <>
      {segments.map((segment, index) => segment.type === 'code' ? (
        <div key={`${segment.lang}-${index}`} className="my-3 overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.14)] bg-[#050608] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_10px_26px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between bg-[#0d1014] px-3 py-2 text-[0.72rem] uppercase tracking-[0.08em] text-[#94a3b8]">
            <span>{segment.lang}</span>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(148,163,184,0.2)] bg-transparent px-2 py-1 text-[#e2e8f0]" onClick={() => onCopy ? void onCopy(segment.value) : void navigator.clipboard.writeText(segment.value)}>
              <Check size={12} />
              Copy
            </button>
          </div>
          <pre className="m-0 overflow-x-auto p-4 leading-[1.6] text-[#e5e7eb]"><code>{segment.value}</code></pre>
        </div>
      ) : <TextBlock key={`text-${index}`} value={segment.value} />)}
    </>
  )
}

function TextBlock({ value }: { value: string }) {
  const nodes: React.ReactNode[] = []

  for (const line of value.split(/\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('### ')) {
      nodes.push(<h3 key={`h3-${nodes.length}`}><InlineText value={trimmed.replace(/^###\s*/, '')} /></h3>)
    } else if (trimmed.startsWith('> ')) {
      nodes.push(<blockquote key={`quote-${nodes.length}`}><InlineText value={trimmed.replace(/^>\s*/, '')} /></blockquote>)
    } else if (trimmed.startsWith('- ')) {
      nodes.push(<li key={`li-${nodes.length}`}><InlineText value={trimmed.replace(/^-\s*/, '')} /></li>)
    } else if (/^\d+\.\s/.test(trimmed)) {
      nodes.push(<li key={`ol-${nodes.length}`}><InlineText value={trimmed.replace(/^\d+\.\s*/, '')} /></li>)
    } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      nodes.push(<p key={`p-${nodes.length}`} className="font-semibold"><InlineText value={trimmed.replace(/^\*\*|\*\*$/g, '')} /></p>)
    } else {
      nodes.push(<p key={`p-${nodes.length}`}><InlineText value={trimmed} /></p>)
    }
  }

  return <>{nodes}</>
}

function InlineText({ value }: { value: string }) {
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > lastIndex) nodes.push(value.slice(lastIndex, index))
    if (match[2] && match[3]) nodes.push(<a key={`link-${index}`} href={match[3]} target="_blank" rel="noreferrer">{match[2]}</a>)
    else if (match[4]) nodes.push(<code key={`inline-code-${index}`}>{match[4]}</code>)
    else if (match[5]) nodes.push(<strong key={`strong-${index}`}>{match[5]}</strong>)
    else if (match[6]) nodes.push(<em key={`em-${index}`}>{match[6]}</em>)
    lastIndex = index + match[0].length
  }

  if (lastIndex < value.length) nodes.push(value.slice(lastIndex))
  return <>{nodes}</>
}
