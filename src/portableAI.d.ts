declare global {
  interface Window {
    portableAI: {
      conversations: {
        list: () => Promise<PortableAIConversation[]>
        create: (title?: string) => Promise<PortableAIConversation>
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
        generate: (conversationId: string, attachments?: PortableAIAttachment[], webSearchEnabled?: boolean) => Promise<{ text: string; stopped: boolean; error?: string; usedWebSearch?: boolean }>
        stopGeneration: () => Promise<PortableAIStatus>
        onStatus: (listener: (status: PortableAIStatus) => void) => () => void
        onStream: (listener: (event: PortableAIStreamEvent) => void) => () => void
      }
      agent: {
        selectFolder: () => Promise<string | null>
        getInfo: () => Promise<PortableAIAgentInfo>
        clearFolder: () => Promise<null>
        setAutoApply: (value: boolean) => Promise<boolean>
        run: (conversationId: string | null, problem: string) => Promise<{ conversationId: string }>
        approveDiff: () => Promise<boolean>
        rejectDiff: () => Promise<boolean>
        stop: () => Promise<boolean>
        onEvent: (listener: (event: PortableAIAgentEvent) => void) => () => void
        onConversationStarted: (listener: (payload: { conversationId: string }) => void) => () => void
      }
      agentConversations: {
        list: () => Promise<PortableAIAgentConversation[]>
        rename: (conversationId: string, title: string) => Promise<PortableAIAgentConversation>
        delete: (conversationId: string) => Promise<boolean>
      }
      agentSteps: {
        list: (conversationId: string) => Promise<PortableAIAgentStep[]>
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

export type PortableAIAgentInfo = {
  repoRoot: string | null
  autoApply: boolean
}

export type PortableAIDiffRow = {
  type: 'context' | 'add' | 'remove'
  line: string
}

export type PortableAIAgentEvent =
  | { type: 'thinking' }
  | { type: 'tool-call'; name: string; args: Record<string, unknown> }
  | { type: 'tool-result'; name: string; result: string }
  | { type: 'diff-pending'; path: string; rows: PortableAIDiffRow[] }
  | { type: 'diff-applied'; path: string; rows: PortableAIDiffRow[]; auto: boolean }
  | { type: 'diff-rejected'; path: string }
  | { type: 'final'; message: string }
  | { type: 'error'; message: string }

export type PortableAIAgentConversation = {
  id: string
  title: string
  repo_root: string | null
  created_at: number
  updated_at: number
}

export type PortableAIAgentStep = {
  id: string
  conversation_id: string
  event: PortableAIAgentEvent | { type: 'user-message'; message: string } | { type: 'run-divider' }
  created_at: number
}

export {}
