export type Role = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: Role
  content: string
  timestamp: string
}

export type DemoConversation = {
  id: string
  title: string
  group: 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Older'
  updatedAt: string
  messages: ChatMessage[]
}

export const welcomePrompts = [
  'Explain a complex topic simply',
  'Help me build or debug code',
  'Understand a local document',
  'Generate ideas for my project',
]

export const demoConversations: DemoConversation[] = [
  {
    id: 'welcome',
    title: 'Welcome to PORTABLE.AI',
    group: 'Today',
    updatedAt: '2026-09-16T09:15:00.000Z',
    messages: [
      {
        id: 'welcome-1',
        role: 'assistant',
        content:
          'Welcome to PORTABLE.AI. This is the first UI phase of the application. Future versions will run AI models locally from your USB drive.',
        timestamp: '2026-09-16T09:15:00.000Z',
      },
      {
        id: 'welcome-2',
        role: 'user',
        content: 'What is PORTABLE.AI?',
        timestamp: '2026-09-16T09:16:00.000Z',
      },
      {
        id: 'welcome-3',
        role: 'assistant',
        content:
          'PORTABLE.AI is a private local AI desktop application designed for portable use on USB drives. In this phase, the interface is fully styled and interactive while the local AI engine is still being planned for later phases.',
        timestamp: '2026-09-16T09:17:00.000Z',
      },
    ],
  },
  {
    id: 'react-architecture',
    title: 'React architecture discussion',
    group: 'Yesterday',
    updatedAt: '2026-09-15T18:45:00.000Z',
    messages: [
      {
        id: 'arch-1',
        role: 'user',
        content: 'How should I structure a React + Electron app for a local desktop assistant?',
        timestamp: '2026-09-15T18:40:00.000Z',
      },
      {
        id: 'arch-2',
        role: 'assistant',
        content:
          'Use a small UI shell in React, a secure preload bridge in Electron, and keep the AI workload isolated from the renderer process. This preserves a clean separation between desktop UI, app state, and future local model runtime logic.',
        timestamp: '2026-09-15T18:42:00.000Z',
      },
      {
        id: 'arch-3',
        role: 'assistant',
        content:
          '```ts\nconst AppShell = () => {\n  return <DesktopLayout />\n}\n```\n\nThis keeps the future AI engine decoupled from the interface and makes the app easier to scale later.',
        timestamp: '2026-09-15T18:45:00.000Z',
      },
    ],
  },
  {
    id: 'usb-design',
    title: 'USB application design',
    group: 'Previous 7 Days',
    updatedAt: '2026-09-12T11:30:00.000Z',
    messages: [
      {
        id: 'usb-1',
        role: 'user',
        content: 'What should the future portable storage layout look like?',
        timestamp: '2026-09-12T11:10:00.000Z',
      },
      {
        id: 'usb-2',
        role: 'assistant',
        content:
          'The application should keep a portable folder layout that lives next to the executable, such as runtime, models, data, logs, and attachments. This avoids appdata persistence and keeps the system portable and self-contained.',
        timestamp: '2026-09-12T11:12:00.000Z',
      },
      {
        id: 'usb-3',
        role: 'assistant',
        content:
          '### Future folder layout\n\n- runtime/\n- models/\n- data/\n- logs/\n- attachments/\n\nThis keeps the USB drive portable while staying local-first and privacy friendly.',
        timestamp: '2026-09-12T11:30:00.000Z',
      },
    ],
  },
  {
    id: 'debugging',
    title: 'JavaScript debugging',
    group: 'Previous 7 Days',
    updatedAt: '2026-09-10T15:20:00.000Z',
    messages: [
      {
        id: 'js-1',
        role: 'user',
        content: 'Help me debug a TypeScript issue in a browser app.',
        timestamp: '2026-09-10T15:05:00.000Z',
      },
      {
        id: 'js-2',
        role: 'assistant',
        content:
          'Start by checking the type that the function returns, and verify the call sites against the expected contract. A good debugging flow is to reduce the problem to a minimal case and then inspect the values at each boundary.',
        timestamp: '2026-09-10T15:07:00.000Z',
      },
      {
        id: 'js-3',
        role: 'assistant',
        content:
          '```ts\nconst result = items.map((item) => item.value)\nconsole.log(result)\n```\n\nThis is often enough to reveal whether a data transform or boundary mismatch is causing the bug.',
        timestamp: '2026-09-10T15:20:00.000Z',
      },
    ],
  },
  {
    id: 'planning',
    title: 'Project planning',
    group: 'Older',
    updatedAt: '2026-09-02T08:00:00.000Z',
    messages: [
      {
        id: 'plan-1',
        role: 'user',
        content: 'Outline a clean plan for the next phase of PORTABLE.AI.',
        timestamp: '2026-09-02T07:55:00.000Z',
      },
      {
        id: 'plan-2',
        role: 'assistant',
        content:
          '1. Lock the desktop shell and UI polish.\n2. Define portable local storage paths.\n3. Add local model management and runtime abstraction.\n4. Iterate with offline inference and better UX feedback.\n5. Add settings and file support for future data workflows.',
        timestamp: '2026-09-02T08:00:00.000Z',
      },
    ],
  },
]
