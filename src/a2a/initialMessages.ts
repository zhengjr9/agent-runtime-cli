import {
  createAssistantMessage,
  createSystemMessage,
  createUserMessage,
} from '../utils/messages.js'
import type { Message } from '../types/message.js'
import type { SessionBundle } from './types.js'

export function buildInitialMessages(bundle: SessionBundle | null): Message[] {
  if (!bundle) {
    return []
  }

  return bundle.messages.map(message => {
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
