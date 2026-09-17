import { useEffect } from 'react'

export function useKeyboardShortcuts({
  isSettingsOpen,
  searchInputRef,
  onNewChat,
  onCloseSettings,
}: {
  isSettingsOpen: boolean
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onNewChat: () => void
  onCloseSettings: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey

      if (isMeta && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        onNewChat()
      }

      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }

      if (event.key === 'Escape') {
        if (isSettingsOpen) {
          onCloseSettings()
          return
        }
        if (document.activeElement === searchInputRef.current) searchInputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSettingsOpen, onCloseSettings, onNewChat, searchInputRef])
}
