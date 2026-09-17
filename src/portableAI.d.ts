declare global {
  interface Window {
    portableAI: {
      conversations: {
        list: () => Promise<PortableAIConversation[]>
        create: (title?: string) => Promise<PortableAIConversation>
        get: (conversationId: string) => Promise<PortableAIConversation | null>
        rename: (conversationId: string, title: string) => Promise<PortableAIConversation>
        delete: (conversationId: string) => Promise<boolean>
      }
      messages: {
        list: (conversationId: string) => Promise<PortableAIMessage[]>
        create: (conversationId: string, role: PortableAIMessageRole, content: string) => Promise<PortableAIMessage>
        delete: (messageId: string) => Promise<boolean>
        update: (messageId: string, content: string) => Promise<PortableAIMessage>
      }
      hardware: {
        getInfo: () => Promise<PortableAIHardwareInfo>
      }
      attachments: {
        save: (file: File) => Promise<PortableAIAttachment>
      }
      ai: {
        getStatus: () => Promise<PortableAIStatus>
        getModels: () => Promise<PortableAIModel[]>
        selectModel: (modelId: string) => Promise<PortableAIStatus>
        start: () => Promise<PortableAIStatus>
        stop: () => Promise<PortableAIStatus>
        generate: (conversationId: string, attachments?: PortableAIAttachment[]) => Promise<{ text: string; stopped: boolean; error?: string }>
        stopGeneration: () => Promise<PortableAIStatus>
        onStatus: (listener: (status: PortableAIStatus) => void) => () => void
        onStream: (listener: (event: PortableAIStreamEvent) => void) => () => void
      }
    }
  }
}

export type PortableAIMessageRole = 'user' | 'assistant' | 'system'

export type PortableAIConversation = {
  id: string
  title: string
  created_at: number
  updated_at: number
}

export type PortableAIMessage = {
  id: string
  conversation_id: string
  role: PortableAIMessageRole
  content: string
  created_at: number
}

export type PortableAIAttachment = {
  name: string
  mimeType: string
  textContent?: string
  id: string
  size: number
  isImage?: boolean
}

export type PortableAIPerformanceProfile = 'LOW_RAM' | 'BALANCED' | 'HIGH_PERFORMANCE'
export type PortableAIMemoryPressure = 'normal' | 'moderate' | 'high'

export type PortableAIHardwareInfo = {
  platform: string
  platformId: string
  osVersion: string
  architecture: string
  cpuModel: string
  physicalCores: number | null
  logicalCores: number
  totalRamBytes: number
  freeRamBytes: number
  availableRamBytes: number
  performanceProfile: PortableAIPerformanceProfile
  recommendedThreads: number
  memoryPressure: PortableAIMemoryPressure
  recommendedAIConfig: {
    contextLength: number
    maxOutputTokens: number
    temperature: number
    recommendedThreads: number
    gpuLayers: number | 'auto'
  }
}

export type PortableAIModel = {
  id: string
  filename: string
  displayName: string
  size: number
}

export type PortableAIState = 'STOPPED' | 'STARTING' | 'READY' | 'GENERATING' | 'STOPPING' | 'ERROR'

export type PortableAIStatus = {
  state: PortableAIState
  error: string | null
  message: string | null
  port: number | null
  runtimeAvailable: boolean
  modelsAvailable: number
  selectedModel: PortableAIModel | null
}

export type PortableAIStreamEvent = {
  type: 'delta'
  delta: string
}

export {}
