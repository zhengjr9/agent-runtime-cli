export type Role = 'user' | 'assistant' | 'system' | 'error'

export type TextMessageRecord = {
  id: string
  role: Role
  text: string
  createdAt: string
  kind?: 'text'
}

export type ToolUseMessageRecord = {
  id: string
  kind: 'tool_use'
  role: 'assistant'
  createdAt: string
  toolUseId: string
  toolName: string
  toolArgs?: unknown
  toolCallId?: string
  toolDescribe?: string
}

export type ToolResultMessageRecord = {
  id: string
  kind: 'tool_result'
  role: 'user'
  createdAt: string
  toolUseId: string
  sourceAssistantId: string
  text: string
  isError?: boolean
  toolName?: string
}

export type MessageRecord =
  | TextMessageRecord
  | ToolUseMessageRecord
  | ToolResultMessageRecord

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
      type: 'tool'
      toolEventType: 'tool_call_started' | 'tool_call_finished' | 'tool_call_failed'
      toolName: string
      toolCallId?: string
      toolStatus?: string
      toolArgs?: unknown
      toolDescribe?: string
      toolResult?: unknown
      toolError?: string
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
