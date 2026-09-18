import type { PortableAIHardwareInfo, PortableAIStatus } from '../portableAI'

export const formatMemory = (bytes: number) => {
  if (!bytes) return 'Unknown'
  const gigabytes = bytes / (1024 ** 3)
  return `${gigabytes >= 10 ? gigabytes.toFixed(0) : gigabytes.toFixed(1)} GB`
}

export const formatProfile = (profile: PortableAIHardwareInfo['performanceProfile']) => profile.replace('_', ' ')

export const formatAIStatus = (status: PortableAIStatus | null) => {
  if (!status) return 'Starting...'
  if (status.state === 'READY') return 'AI Ready Made by Avinash'
  if (status.state === 'GENERATING') return 'Generating...'
  if (status.state === 'STARTING') return 'Loading Model...'
  if (status.state === 'STOPPING') return 'Stopping...'
  if (status.message) return status.message
  return 'Local AI unavailable'
}
