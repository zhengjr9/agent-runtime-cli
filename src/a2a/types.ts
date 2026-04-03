export type Role = 'user' | 'assistant' | 'system' | 'error'

export type MessageRecord = {
  id: string
  role: Role
  text: string
  createdAt: string
}

export type SessionRecord = {
  id: string
  title: string
  sessionId: string
  contextId: string
  taskId?: string
  endpoint: string
  proxy?: string
  agentId: string
  userId: string
  groupId: string
  createdAt: string
  updatedAt: string
  messageCount: number
  lastPreview: string
}

export type SessionBundle = {
  session: SessionRecord
  messages: MessageRecord[]
}

export type AppConfig = {
  upstreamBase: string
  endpoint: string
  proxy?: string
  agentId: string
  userId: string
  groupId: string
  origin: string
  acceptLanguage: string
  storeDir: string
}

export type StreamEvent =
  | {
      type: 'text-delta'
      text: string
    }
  | {
      type: 'status'
      text: string
    }
  | {
      type: 'task'
      contextId?: string
      taskId?: string
    }
  | {
      type: 'done'
      contextId?: string
      taskId?: string
      status?: string
    }
