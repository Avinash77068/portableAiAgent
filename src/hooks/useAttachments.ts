import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortableAIAttachment } from '../portableAI'

export type PendingAttachment = PortableAIAttachment & { previewUrl?: string }

export const supportedAttachmentExtensions = new Set(['.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.html', '.css', '.py', '.pdf', '.png', '.jpg', '.jpeg', '.webp'])
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])

const extensionOf = (fileName: string) => `.${fileName.split('.').pop()?.toLowerCase() ?? ''}`

export function useAttachments(onError: (message: string) => void) {
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [isReadingAttachment, setIsReadingAttachment] = useState(false)
  const previewUrls = useRef<Set<string>>(new Set())

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
  }, [])

  const addFile = useCallback((file: File) => {
    const extension = extensionOf(file.name)
    if (!supportedAttachmentExtensions.has(extension)) {
      onError('Unsupported file format')
      return
    }

    const previewUrl = imageExtensions.has(extension) ? URL.createObjectURL(file) : undefined
    if (previewUrl) previewUrls.current.add(previewUrl)

    setIsReadingAttachment(true)
    void window.portableAI.attachments.save(file)
      .then((attachment) => {
        setPendingAttachments((previous) => [...previous, { ...attachment, previewUrl }])
      })
      .catch((error) => {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl)
          previewUrls.current.delete(previewUrl)
        }
        onError(error instanceof Error ? error.message : 'Could not read attachment')
      })
      .finally(() => setIsReadingAttachment(false))
  }, [onError])

  const removeAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments((previous) => {
      const target = previous.find((attachment) => attachment.id === attachmentId)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
        previewUrls.current.delete(target.previewUrl)
      }
      return previous.filter((attachment) => attachment.id !== attachmentId)
    })
  }, [])

  const reset = useCallback(() => {
    setPendingAttachments((previous) => {
      for (const attachment of previous) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
      return []
    })
    previewUrls.current.clear()
  }, [])

  return { pendingAttachments, isReadingAttachment, addFile, removeAttachment, reset }
}
