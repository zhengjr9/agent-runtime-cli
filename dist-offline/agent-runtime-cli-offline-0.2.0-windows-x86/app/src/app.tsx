import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Newline, Text, useApp, useInput, useStdout } from 'ink'

import { streamMessage } from './a2aClient.js'
import {
  createSessionBundle,
  listSessions,
  loadSessionBundle,
  newMessage,
  saveSessionBundle,
} from './store.js'
import type { AppConfig, MessageRecord, SessionBundle, SessionRecord } from './types.js'

type Props = {
  config: AppConfig
  initialBundle: SessionBundle
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function shortId(id: string): string {
  return id.slice(0, 8)
}

function renderRole(role: MessageRecord['role']): string {
  switch (role) {
    case 'assistant':
      return 'Assistant'
    case 'system':
      return 'System'
    case 'error':
      return 'Error'
    default:
      return 'You'
  }
}

function useSpinner(active: boolean): string {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active) {
      return
    }
    const timer = setInterval(() => {
      setIndex((value) => (value + 1) % SPINNER.length)
    }, 80)
    return () => clearInterval(timer)
  }, [active])
  return SPINNER[index] ?? SPINNER[0]
}

export function App({ config, initialBundle }: Props): React.JSX.Element {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [bundle, setBundle] = useState(initialBundle)
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [status, setStatus] = useState('idle')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [draftAssistant, setDraftAssistant] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const spinner = useSpinner(busy)

  async function refreshSessions(): Promise<void> {
    setSessions(await listSessions(config))
  }

  useEffect(() => {
    void refreshSessions()
  }, [])

  const transcript = useMemo(() => {
    const items = [...bundle.messages]
    if (draftAssistant) {
      items.push({
        id: 'draft',
        role: 'assistant',
        text: draftAssistant,
        createdAt: new Date().toISOString(),
      })
    }
    return items
  }, [bundle.messages, draftAssistant])

  async function persist(next: SessionBundle): Promise<void> {
    await saveSessionBundle(config, next)
    setBundle(next)
    await refreshSessions()
  }

  async function startNewSession(): Promise<void> {
    const next = await createSessionBundle(config)
    setDraftAssistant('')
    setStatus('idle')
    setError(null)
    await persist(next)
  }

  async function resumeSession(id: string): Promise<void> {
    const next = await loadSessionBundle(config, id)
    if (!next) {
      setError(`session not found: ${id}`)
      return
    }
    setDraftAssistant('')
    setStatus('idle')
    setError(null)
    setBundle(next)
    await refreshSessions()
  }

  async function handleCommand(commandLine: string): Promise<void> {
    const [command, ...rest] = commandLine.trim().split(/\s+/)
    switch (command) {
      case '/quit':
      case '/exit':
        exit()
        return
      case '/help':
        await persist({
          ...bundle,
          messages: [
            ...bundle.messages,
            newMessage(
              'system',
              '/new  /resume <id>  /sessions  /help  /quit',
            ),
          ],
        })
        return
      case '/sessions':
      case '/list':
        await refreshSessions()
        await persist({
          ...bundle,
          messages: [
            ...bundle.messages,
            newMessage('system', `${sessions.length} sessions loaded in sidebar`),
          ],
        })
        return
      case '/new':
        await startNewSession()
        return
      case '/resume':
        if (!rest[0]) {
          setError('usage: /resume <session-id>')
          return
        }
        await resumeSession(rest[0])
        return
      default:
        setError(`unknown command: ${command}`)
    }
  }

  async function sendPrompt(prompt: string): Promise<void> {
    const userMessage = newMessage('user', prompt)
    const nextBundle: SessionBundle = {
      session: {
        ...bundle.session,
        updatedAt: new Date().toISOString(),
      },
      messages: [...bundle.messages, userMessage],
    }

    setBusy(true)
    setError(null)
    setStatus('streaming')
    setDraftAssistant('')
    await persist(nextBundle)

    const aborter = new AbortController()
    abortRef.current = aborter

    try {
      const result = await streamMessage(config, {
        prompt,
        session: nextBundle.session,
        signal: aborter.signal,
        onEvent: (event) => {
          if (event.type === 'text-delta') {
            setDraftAssistant((value) => value + event.text)
            return
          }
          if (event.type === 'status') {
            setStatus(event.text)
            return
          }
          if (event.type === 'tool') {
            const prefix =
              event.toolEventType === 'tool_call_started'
                ? 'Tool started'
                : event.toolEventType === 'tool_call_finished'
                  ? 'Tool finished'
                  : 'Tool failed'
            const suffix =
              event.toolEventType === 'tool_call_failed'
                ? event.toolError
                : event.toolEventType === 'tool_call_finished'
                  ? typeof event.toolResult === 'string'
                    ? event.toolResult
                    : ''
                  : typeof event.toolDescribe === 'string'
                    ? event.toolDescribe
                    : ''
            setBundle((current) => ({
              ...current,
              messages: [
                ...current.messages,
                newMessage(
                  'system',
                  `${prefix}: ${event.toolName}${suffix ? `\n${suffix}` : ''}`,
                ),
              ],
            }))
            return
          }
          if (event.type === 'task') {
            setBundle((current) => ({
              ...current,
              session: {
                ...current.session,
                contextId: event.contextId ?? current.session.contextId,
                taskId: event.taskId ?? current.session.taskId,
              },
            }))
            return
          }
          if (event.type === 'done') {
            setStatus(event.status ?? 'completed')
          }
        },
      })

      const assistantText = draftAssistantRef.current.trim() || draftAssistant.trim()
      const finalBundle: SessionBundle = {
        session: {
          ...nextBundle.session,
          contextId: result.contextId ?? nextBundle.session.contextId,
          taskId: result.taskId ?? nextBundle.session.taskId,
          updatedAt: new Date().toISOString(),
        },
        messages: assistantText
          ? [...nextBundle.messages, newMessage('assistant', assistantText)]
          : nextBundle.messages,
      }
      setDraftAssistant('')
      await persist(finalBundle)
      setStatus('idle')
    } catch (streamError) {
      const message =
        streamError instanceof Error ? streamError.message : String(streamError)
      setError(message)
      await persist({
        ...nextBundle,
        messages: [...nextBundle.messages, newMessage('error', message)],
      })
      setStatus('failed')
      setDraftAssistant('')
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  const draftAssistantRef = useRef(draftAssistant)
  useEffect(() => {
    draftAssistantRef.current = draftAssistant
  }, [draftAssistant])

  useInput((value, key) => {
    if (key.ctrl && value === 'c') {
      if (busy) {
        abortRef.current?.abort()
        setBusy(false)
        setStatus('canceled')
        setDraftAssistant('')
        return
      }
      exit()
      return
    }

    if (busy) {
      return
    }

    if (key.return) {
      const submitted = input.trim()
      setInput('')
      if (!submitted) {
        return
      }
      if (submitted.startsWith('/')) {
        void handleCommand(submitted)
        return
      }
      void sendPrompt(submitted)
      return
    }

    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1))
      return
    }

    if (key.escape) {
      setInput('')
      return
    }

    if (!key.ctrl && !key.meta && value) {
      setInput((current) => current + value)
    }
  })

  const terminalWidth = stdout.columns || 120
  const sidebarWidth = Math.min(42, Math.max(28, Math.floor(terminalWidth * 0.28)))
  const mainWidth = Math.max(40, terminalWidth - sidebarWidth - 4)
  const recentMessages = transcript.slice(-18)
  const recentSessions = sessions.slice(0, 12)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyanBright">
        Claude A2A TUI {busy ? spinner : ' '} session:{shortId(bundle.session.id)} status:{' '}
        {status}
      </Text>
      <Box marginTop={1} flexDirection="row">
        <Box
          width={sidebarWidth}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          flexDirection="column"
          marginRight={1}
        >
          <Text color="yellow">Sessions</Text>
          {recentSessions.length === 0 ? (
            <Text dimColor>No sessions</Text>
          ) : (
            recentSessions.map((session) => (
              <Text
                key={session.id}
                color={session.id === bundle.session.id ? 'green' : undefined}
              >
                {session.id === bundle.session.id ? '>' : ' '} {shortId(session.id)}{' '}
                {session.title}
              </Text>
            ))
          )}
          <Newline />
          <Text dimColor>Commands: /new /resume /sessions /quit</Text>
        </Box>

        <Box
          width={mainWidth}
          borderStyle="round"
          borderColor="blue"
          paddingX={1}
          flexDirection="column"
        >
          <Text color="blueBright">{bundle.session.title}</Text>
          <Text dimColor>
            sess:{bundle.session.sessionId} ctx:{bundle.session.contextId}
          </Text>
          <Newline />
          {recentMessages.length === 0 ? (
            <Text dimColor>Type a message and press Enter.</Text>
          ) : (
            recentMessages.map((message) => (
              <Box key={message.id} marginBottom={1} flexDirection="column">
                <Text
                  color={
                    message.role === 'assistant'
                      ? 'magentaBright'
                      : message.role === 'error'
                        ? 'redBright'
                        : message.role === 'system'
                          ? 'yellowBright'
                          : 'greenBright'
                  }
                >
                  {renderRole(message.role)}
                </Text>
                <Text wrap="wrap">{message.text || ' '}</Text>
              </Box>
            ))
          )}
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="greenBright">{'> '}</Text>
        <Text>{input || ' '}</Text>
      </Box>
      <Text dimColor>
        Enter send · Ctrl+C interrupt/quit · Esc clear input
      </Text>
      {error ? <Text color="redBright">Error: {error}</Text> : null}
    </Box>
  )
}
