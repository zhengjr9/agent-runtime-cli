import http from 'node:http'
import { randomUUID } from 'node:crypto'

import { WebSocketServer, type RawData, type WebSocket } from 'ws'

import { loadConfig } from './config.js'
import { streamMessage } from './a2aClient.js'
import {
  createSessionBundle,
  loadSessionBundle,
  newMessage,
  newToolResultMessage,
  newToolUseMessage,
  saveSessionBundle,
} from './store.js'
import type { SessionBundle } from './types.js'

type BridgeSession = {
  id: string
  bundle: SessionBundle
  sockets: Set<WebSocket>
  abortController?: AbortController
  toolCallMap: Map<
    string,
    {
      assistantUuid: string
      toolUseId: string
      toolName: string
    }
  >
}

type DirectContentBlock = {
  type: string
  text?: string
  [key: string]: unknown
}

const host = process.env.CLAUDE_A2A_BRIDGE_HOST ?? '127.0.0.1'
const port = Number(process.env.CLAUDE_A2A_BRIDGE_PORT ?? '4317')
const sessions = new Map<string, BridgeSession>()

function nowIso(): string {
  return new Date().toISOString()
}

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function broadcast(session: BridgeSession, payload: Record<string, unknown>): void {
  for (const socket of session.sockets) {
    sendJson(socket, payload)
  }
}

async function persistSession(session: BridgeSession): Promise<void> {
  const config = await loadConfig()
  await saveSessionBundle(config, session.bundle)
}

function buildAssistantMessage(text: string): Record<string, unknown> {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: nowIso(),
    message: {
      id: randomUUID(),
      role: 'assistant',
      content: [
        {
          type: 'text',
          text,
        },
      ],
    },
  }
}

function normalizeToolInput(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (Array.isArray(value)) {
    return { items: value }
  }
  if (value == null) {
    return {}
  }
  return { value }
}

function buildAssistantToolUseMessage(
  toolUseId: string,
  toolName: string,
  toolArgs: unknown,
  assistantUuid: string,
): Record<string, unknown> {
  return {
    type: 'assistant',
    uuid: assistantUuid,
    timestamp: nowIso(),
    message: {
      id: randomUUID(),
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: toolName,
          input: normalizeToolInput(toolArgs),
        },
      ],
    },
  }
}

function buildUserToolResultMessage(
  toolUseId: string,
  assistantUuid: string,
  content: string,
  isError: boolean,
): Record<string, unknown> {
  return {
    type: 'user',
    uuid: randomUUID(),
    timestamp: nowIso(),
    parent_tool_use_id: null,
    tool_use_result: content,
    source_tool_assistant_uuid: assistantUuid,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content,
          is_error: isError,
        },
      ],
    },
  }
}

function buildResultSuccess(text: string): Record<string, unknown> {
  return {
    type: 'result',
    uuid: randomUUID(),
    subtype: 'success',
    result: text,
    session_id: '',
    timestamp: nowIso(),
  }
}

function buildResultError(message: string): Record<string, unknown> {
  return {
    type: 'result',
    uuid: randomUUID(),
    subtype: 'error',
    errors: [message],
    timestamp: nowIso(),
  }
}

function buildStreamEvent(event: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'stream_event',
    uuid: randomUUID(),
    timestamp: nowIso(),
    event,
  }
}

function initMessage(): Record<string, unknown> {
  return {
    type: 'system',
    subtype: 'init',
    uuid: randomUUID(),
    timestamp: nowIso(),
    model: 'agent-runtime-a2a',
    slash_commands: ['exit', 'resume', 'upstream'],
  }
}

function statusMessage(status: string): Record<string, unknown> {
  return {
    type: 'system',
    subtype: 'status',
    uuid: randomUUID(),
    timestamp: nowIso(),
    status,
  }
}

function summarizeValue(value: unknown, maxLength = 240): string {
  if (value == null) {
    return ''
  }
  const text =
    typeof value === 'string'
      ? value
      : (() => {
          try {
            return JSON.stringify(value)
          } catch {
            return String(value)
          }
        })()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function ensureToolUseStarted(
  session: BridgeSession,
  event: {
    toolName: string
    toolCallId?: string
    toolArgs?: unknown
    toolDescribe?: string
  },
): {
  toolUseId: string
  assistantUuid: string
} {
  const key = event.toolCallId || `synthetic-${randomUUID()}`
  const existing = session.toolCallMap.get(key)
  if (existing) {
    return {
      toolUseId: existing.toolUseId,
      assistantUuid: existing.assistantUuid,
    }
  }

  const assistantUuid = randomUUID()
  const toolUseId = event.toolCallId || `toolu_${randomUUID()}`
  session.toolCallMap.set(key, {
    assistantUuid,
    toolUseId,
    toolName: event.toolName,
  })
  session.bundle = {
    ...session.bundle,
    messages: [
      ...session.bundle.messages,
      newToolUseMessage({
        id: assistantUuid,
        createdAt: nowIso(),
        toolUseId,
        toolName: event.toolName,
        toolArgs: event.toolArgs,
        toolCallId: event.toolCallId,
        toolDescribe: event.toolDescribe,
      }),
    ],
  }
  void persistSession(session)
  broadcast(
    session,
    buildAssistantToolUseMessage(
      toolUseId,
      event.toolName,
      event.toolArgs,
      assistantUuid,
    ),
  )
  return { toolUseId, assistantUuid }
}

function extractPrompt(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .flatMap((block) => {
      const item = block as DirectContentBlock
      if (item.type === 'text' && typeof item.text === 'string') {
        return [item.text]
      }
      if (item.type === 'image') {
        return ['[image omitted]']
      }
      return []
    })
    .join('\n')
    .trim()
}

function createTextStreamStart(index: number): Record<string, unknown> {
  return buildStreamEvent({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'text',
      text: '',
    },
  })
}

function createTextStreamDelta(index: number, text: string): Record<string, unknown> {
  return buildStreamEvent({
    type: 'content_block_delta',
    index,
    delta: {
      type: 'text_delta',
      text,
    },
  })
}

function createTextStreamStop(index: number): Record<string, unknown> {
  return buildStreamEvent({
    type: 'content_block_stop',
    index,
  })
}

function createMessageStop(): Record<string, unknown> {
  return buildStreamEvent({
    type: 'message_stop',
  })
}

function upsertSession(session: BridgeSession): void {
  sessions.set(session.id, session)
}

async function getOrCreateSession(id?: string): Promise<BridgeSession> {
  const config = await loadConfig()
  if (id) {
    const existing = sessions.get(id)
    if (existing) {
      return existing
    }
    const bundle = await loadSessionBundle(config, id)
    if (bundle) {
      const restored = {
        id: bundle.session.id,
        bundle,
        sockets: new Set<WebSocket>(),
        toolCallMap: new Map(),
      }
      sessions.set(restored.id, restored)
      return restored
    }
  }

  const bundle = await createSessionBundle(config)
  const created = {
    id: bundle.session.id,
    bundle,
    sockets: new Set<WebSocket>(),
    toolCallMap: new Map(),
  }
  sessions.set(created.id, created)
  return created
}

async function handleUserMessage(
  session: BridgeSession,
  rawMessage: Record<string, unknown>,
): Promise<void> {
  const prompt = extractPrompt((rawMessage.message as { content?: unknown } | undefined)?.content)
  if (!prompt) {
    broadcast(session, buildResultError('empty prompt'))
    return
  }

  session.bundle = {
    ...session.bundle,
    messages: [...session.bundle.messages, newMessage('user', prompt)],
  }
  await persistSession(session)

  session.abortController?.abort()
  const abortController = new AbortController()
  session.abortController = abortController

  let assistantText = ''
  let started = false

  broadcast(session, statusMessage('working'))

  try {
    const config = await loadConfig()
    const result = await streamMessage(config, {
      prompt,
      session: {
        ...session.bundle.session,
        endpoint: config.endpoint,
      },
      signal: abortController.signal,
      onEvent: (event) => {
        if (event.type === 'task') {
          session.bundle = {
            ...session.bundle,
            session: {
              ...session.bundle.session,
              contextId: event.contextId ?? session.bundle.session.contextId,
              taskId: event.taskId ?? session.bundle.session.taskId,
              updatedAt: nowIso(),
            },
          }
          return
        }

        if (event.type === 'status' && event.text) {
          broadcast(session, statusMessage(event.text))
          return
        }

        if (event.type === 'tool') {
          const { toolUseId, assistantUuid } = ensureToolUseStarted(session, event)
          if (event.toolEventType === 'tool_call_started') {
            return
          }

          const resultText =
            event.toolEventType === 'tool_call_failed'
              ? event.toolError || 'Tool execution failed'
              : summarizeValue(event.toolResult, 2000) || 'Tool execution completed'

          session.bundle = {
            ...session.bundle,
            messages: [
              ...session.bundle.messages,
              newToolResultMessage({
                createdAt: nowIso(),
                toolUseId,
                sourceAssistantId: assistantUuid,
                text: resultText,
                isError: event.toolEventType === 'tool_call_failed',
                toolName: event.toolName,
              }),
            ],
          }
          void persistSession(session)
          broadcast(
            session,
            buildUserToolResultMessage(
              toolUseId,
              assistantUuid,
              resultText,
              event.toolEventType === 'tool_call_failed',
            ),
          )
          if (event.toolCallId) {
            session.toolCallMap.delete(event.toolCallId)
          }
          return
        }

        if (event.type === 'text-delta' && event.text) {
          if (!started) {
            broadcast(session, createTextStreamStart(0))
            started = true
          }
          assistantText += event.text
          broadcast(session, createTextStreamDelta(0, event.text))
        }
      },
    })

    if (started) {
      broadcast(session, createTextStreamStop(0))
      broadcast(session, createMessageStop())
    }

    session.bundle = {
      session: {
        ...session.bundle.session,
        endpoint: config.endpoint,
        contextId: result.contextId ?? session.bundle.session.contextId,
        taskId: result.taskId ?? session.bundle.session.taskId,
        updatedAt: nowIso(),
      },
      messages: assistantText
        ? [...session.bundle.messages, newMessage('assistant', assistantText)]
        : session.bundle.messages,
    }
    await persistSession(session)

    if (assistantText) {
      broadcast(session, buildAssistantMessage(assistantText))
    }
    broadcast(session, buildResultSuccess(assistantText))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    session.bundle = {
      ...session.bundle,
      messages: [...session.bundle.messages, newMessage('error', message)],
    }
    await persistSession(session)
    broadcast(session, buildResultError(message))
  } finally {
    if (session.abortController === abortController) {
      session.abortController = undefined
    }
  }
}

export function startBridgeServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`)

    if (req.method === 'POST' && url.pathname === '/sessions') {
      let resumeSessionId: string | undefined
      let body = ''
      for await (const chunk of req) {
        body += String(chunk)
      }
      if (body) {
        try {
          const parsed = JSON.parse(body) as { resume_session_id?: unknown }
          if (typeof parsed.resume_session_id === 'string' && parsed.resume_session_id.trim()) {
            resumeSessionId = parsed.resume_session_id.trim()
          }
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid json' }))
          return
        }
      }

      const session = await getOrCreateSession(resumeSessionId)
      const wsProtocol = host === '127.0.0.1' || host === 'localhost' ? 'ws' : 'ws'
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          session_id: session.id,
          ws_url: `${wsProtocol}://${host}:${port}/ws/${session.id}`,
          work_dir: process.cwd(),
        }),
      )
      return
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(404)
    res.end('not found')
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`)
    const match = url.pathname.match(/^\/ws\/(.+)$/)
    if (!match) {
      socket.destroy()
      return
    }
    const session = await getOrCreateSession(match[1])
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      session.sockets.add(ws)
      upsertSession(session)
      sendJson(ws, initMessage())

      ws.on('message', async (data: RawData) => {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(String(data)) as Record<string, unknown>
        } catch {
          sendJson(ws, buildResultError('invalid json'))
          return
        }

        if (parsed.type === 'user') {
          await handleUserMessage(session, parsed)
          return
        }

        if (parsed.type === 'control_request') {
          const request = parsed.request as { subtype?: string } | undefined
          if (request?.subtype === 'interrupt') {
            session.abortController?.abort()
            broadcast(session, buildResultError('Interrupted'))
          }
        }
      })

      ws.on('close', () => {
        session.sockets.delete(ws)
      })
    })
  })

  server.listen(port, host, () => {
    console.log(`Agent Runtime bridge listening on http://${host}:${port}`)
    console.log(`Connect agent-runtime-cli with: agent-cli`)
  })

  return server
}

if (import.meta.main) {
  startBridgeServer()
}
