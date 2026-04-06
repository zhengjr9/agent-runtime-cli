import { ProxyAgent, fetch } from 'undici'

import type { AppConfig, SessionRecord, StreamEvent } from './types.js'

type SendOptions = {
  prompt: string
  session: SessionRecord
  onEvent: (event: StreamEvent) => void
  signal?: AbortSignal
}

const INITIAL_ASSISTANT_TIMEOUT_MS = Number(
  process.env.A2A_INITIAL_ASSISTANT_TIMEOUT_MS ?? '0',
)
const POST_TEXT_IDLE_TIMEOUT_MS = Number(
  process.env.A2A_POST_TEXT_IDLE_TIMEOUT_MS ?? '0',
)

function buildHeaders(config: AppConfig, session: SessionRecord): Record<string, string> {
  return {
    'A2A-Version': '1.0',
    Accept: 'text/event-stream',
    'Accept-Language': config.acceptLanguage,
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Content-Type': 'application/json',
    Origin: config.origin,
    Pragma: 'no-cache',
    Referer: `${config.origin}/agentspace?agentId=${session.agentId}&conversationId=${session.sessionId}`,
    'User-Agent': 'agent-runtime-cli/0.2.0',
    'X-User-ID': session.userId,
  }
}

function buildBody(prompt: string, session: SessionRecord): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'message/stream',
    params: {
      message: {
        role: 'ROLE_USER',
        kind: 'message',
        messageId: `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        parts: [{ kind: 'text', text: prompt }],
        contextId: session.contextId,
        metadata: {
          session_id: session.sessionId,
          group_id: session.groupId,
        },
        ...(session.taskId
          ? {
              taskId: session.taskId,
              referenceTaskIds: [session.taskId],
            }
          : {}),
      },
      configuration: {
        acceptedOutputModes: ['text/plain'],
      },
    },
  })
}

function extractTexts(parts: Array<Record<string, unknown>> | undefined): string[] {
  if (!Array.isArray(parts)) {
    return []
  }
  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function parseToolEventType(metadata: Record<string, unknown>): 'tool_call_started' | 'tool_call_finished' | 'tool_call_failed' | null {
  const explicit = metadata.tool_event_type
  if (
    explicit === 'tool_call_started' ||
    explicit === 'tool_call_finished' ||
    explicit === 'tool_call_failed'
  ) {
    return explicit
  }

  const status = metadata.tool_status ?? metadata.tool_status_text ?? metadata.status
  if (status === 'started') {
    return 'tool_call_started'
  }
  if (status === 'finished') {
    return 'tool_call_finished'
  }
  if (status === 'failed') {
    return 'tool_call_failed'
  }
  return null
}

function emitToolEvent(
  artifactUpdate: Record<string, unknown>,
  emit: (event: StreamEvent) => void,
): boolean {
  const metadata =
    asRecord(artifactUpdate.metadata) ??
    asRecord(asRecord(artifactUpdate.artifact)?.metadata)

  if (!metadata || metadata.event_type !== 'tool_call') {
    return false
  }

  const toolEventType = parseToolEventType(metadata)
  const toolName = typeof metadata.tool_name === 'string' ? metadata.tool_name : ''
  if (!toolEventType || !toolName) {
    return false
  }

  emit({
    type: 'tool',
    toolEventType,
    toolName,
    toolCallId:
      typeof metadata.tool_call_id === 'string' ? metadata.tool_call_id : undefined,
    toolStatus:
      typeof metadata.tool_status === 'string' ? metadata.tool_status : undefined,
    toolArgs: metadata.tool_args,
    toolDescribe:
      typeof metadata.tool_describe === 'string' ? metadata.tool_describe : undefined,
    toolResult: metadata.tool_result,
    toolError:
      typeof metadata.tool_error === 'string' ? metadata.tool_error : undefined,
  })

  return true
}

function handleResult(result: Record<string, any>, emit: (event: StreamEvent) => void): void {
  const contextId =
    typeof result.contextId === 'string' ? result.contextId : undefined
  const taskId = typeof result.taskId === 'string' ? result.taskId : undefined

  if (contextId || taskId) {
    emit({ type: 'task', contextId, taskId })
  }

  const directParts = extractTexts(result.parts)
  for (const text of directParts) {
    emit({ type: 'text-delta', text })
  }

  const statusUpdate = result.statusUpdate
  if (statusUpdate && typeof statusUpdate === 'object') {
    const statusText =
      typeof statusUpdate.status?.state === 'string'
        ? statusUpdate.status.state
        : typeof statusUpdate.status === 'string'
          ? statusUpdate.status
          : ''
    if (statusText) {
      emit({ type: 'status', text: statusText })
    }
    const texts = extractTexts(statusUpdate.message?.parts)
    for (const text of texts) {
      emit({ type: 'text-delta', text })
    }
    if (statusUpdate.final) {
      emit({
        type: 'done',
        contextId,
        taskId: typeof statusUpdate.taskId === 'string' ? statusUpdate.taskId : taskId,
        status: statusText,
      })
    }
  }

  const artifactUpdate = result.artifactUpdate
  if (artifactUpdate && typeof artifactUpdate === 'object') {
    if (emitToolEvent(artifactUpdate, emit)) {
      return
    }
    const texts = extractTexts(artifactUpdate.artifact?.parts)
    for (const text of texts) {
      emit({ type: 'text-delta', text })
    }
    if (artifactUpdate.lastChunk) {
      emit({ type: 'done', contextId, taskId, status: 'completed' })
    }
  }

  if (result.task && typeof result.task === 'object') {
    const task = result.task
    emit({
      type: 'task',
      contextId: typeof task.contextId === 'string' ? task.contextId : contextId,
      taskId: typeof task.id === 'string' ? task.id : taskId,
    })
    const taskTexts = extractTexts(task.status?.message?.parts)
    for (const text of taskTexts) {
      emit({ type: 'text-delta', text })
    }
    const taskState =
      typeof task.status?.state === 'string' ? task.status.state : undefined
    if (taskState) {
      emit({ type: 'status', text: taskState })
      if (['completed', 'failed', 'canceled', 'rejected'].includes(taskState)) {
        emit({
          type: 'done',
          contextId: typeof task.contextId === 'string' ? task.contextId : contextId,
          taskId: typeof task.id === 'string' ? task.id : taskId,
          status: taskState,
        })
      }
    }
  }

  if (typeof result.taskId === 'string' && result.status && !result.statusUpdate) {
    const statusText =
      typeof result.status?.state === 'string'
        ? result.status.state
        : typeof result.status === 'string'
          ? result.status
          : ''
    if (statusText) {
      emit({ type: 'status', text: statusText })
    }
    if (result.final) {
      emit({
        type: 'done',
        contextId,
        taskId: result.taskId,
        status: statusText,
      })
    }
  }
}

export async function streamMessage(
  config: AppConfig,
  options: SendOptions,
): Promise<{ contextId?: string; taskId?: string }> {
  const dispatcher = config.proxy ? new ProxyAgent(config.proxy) : undefined
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: buildHeaders(config, options.session),
    body: buildBody(options.prompt, options.session),
    dispatcher,
    signal: options.signal,
  })

  if (!response.ok || !response.body) {
    const body = await response.text()
    throw new Error(`A2A request failed: ${response.status} ${body.slice(0, 300)}`)
  }

  let latestContextId = options.session.contextId
  let latestTaskId = options.session.taskId
  let buffer = ''
  const decoder = new TextDecoder()
  let done = false
  let sawAssistantText = false
  const reader = response.body.getReader()

  const emit = (event: StreamEvent) => {
    if (event.type === 'task') {
      const nextContextId = event.contextId ?? latestContextId
      const nextTaskId = event.taskId ?? latestTaskId
      if (nextContextId === latestContextId && nextTaskId === latestTaskId) {
        return
      }
      latestContextId = nextContextId
      latestTaskId = nextTaskId
    }
    if (event.type === 'text-delta' && event.text) {
      sawAssistantText = true
    }
    if (event.type === 'done') {
      latestContextId = event.contextId ?? latestContextId
      latestTaskId = event.taskId ?? latestTaskId
      done = true
    }
    options.onEvent(event)
  }

  while (!done) {
    const read = reader.read()
    const timeoutMs = sawAssistantText
      ? POST_TEXT_IDLE_TIMEOUT_MS
      : INITIAL_ASSISTANT_TIMEOUT_MS

    const next =
      timeoutMs > 0
        ? await Promise.race([
            read,
            new Promise<{ idle: true }>((resolve) => {
              const timeout = setTimeout(() => resolve({ idle: true }), timeoutMs)
              read.finally(() => clearTimeout(timeout)).catch(() => clearTimeout(timeout))
            }),
          ])
        : await read

    if ('idle' in next) {
      if (sawAssistantText) {
        done = true
        break
      }
      throw new Error(
        `A2A stream timed out before any assistant output after ${timeoutMs}ms`,
      )
    }

    const { done: readerDone, value } = next
    if (readerDone) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const eventName = lines
        .find((line) => line.startsWith('event:'))
        ?.slice(6)
        .trim()
      const dataLines = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
      if (eventName === 'close') {
        done = true
        break
      }
      if (dataLines.length === 0) {
        continue
      }
      const payload = dataLines.join('\n')
      const parsed = JSON.parse(payload) as Record<string, any>
      if (parsed.error) {
        throw new Error(parsed.error.message ?? 'A2A json-rpc error')
      }
      const result = parsed.result ?? parsed
      handleResult(result, emit)
      if (done) {
        break
      }
    }
  }

  return { contextId: latestContextId, taskId: latestTaskId }
}
