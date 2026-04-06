import {
  createAssistantMessage,
  createSystemMessage,
  createUserMessage,
} from '../utils/messages.js'
import type { Message } from '../types/message.js'
import type { MessageRecord, SessionBundle } from './types.js'

function buildToolUseMessage(message: Extract<MessageRecord, { kind: 'tool_use' }>): Message {
  return {
    ...createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: message.toolUseId,
          name: message.toolName,
          input:
            typeof message.toolArgs === 'object' &&
            message.toolArgs !== null &&
            !Array.isArray(message.toolArgs)
              ? message.toolArgs
              : message.toolArgs == null
                ? {}
                : { value: message.toolArgs },
        } as never,
      ],
    }),
    uuid: message.id,
    timestamp: message.createdAt,
  }
}

function buildToolResultMessage(
  message: Extract<MessageRecord, { kind: 'tool_result' }>,
): Message {
  return createUserMessage({
    content: [
      {
        type: 'tool_result',
        tool_use_id: message.toolUseId,
        content: message.text,
        is_error: message.isError ?? false,
      },
    ],
    toolUseResult: message.text,
    sourceToolAssistantUUID: message.sourceAssistantId as `${string}-${string}-${string}-${string}-${string}`,
    uuid: message.id,
    timestamp: message.createdAt,
  })
}

export function buildInitialMessages(bundle: SessionBundle | null): Message[] {
  if (!bundle) {
    return []
  }

  return bundle.messages.map(message => {
    if (message.kind === 'tool_use') {
      return buildToolUseMessage(message)
    }
    if (message.kind === 'tool_result') {
      return buildToolResultMessage(message)
    }
    if (message.role === 'user') {
      return createUserMessage({
        content: message.text,
        uuid: message.id,
        timestamp: message.createdAt,
      })
    }
    if (message.role === 'assistant') {
      return {
        ...createAssistantMessage({ content: message.text }),
        uuid: message.id,
        timestamp: message.createdAt,
      }
    }
    return createSystemMessage(
      message.text,
      message.role === 'error' ? 'error' : 'info',
    )
  })
}
