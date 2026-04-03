import chalk from 'chalk'
import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { getDirectConnectServerUrl } from '../bootstrap/state.js'
import { Select } from '../components/CustomSelect/select.js'
import { Dialog } from '../components/design-system/Dialog.js'
import { LoadingState } from '../components/design-system/LoadingState.js'
import { MessageResponse } from '../components/MessageResponse.js'
import { setClipboard } from '../ink/termio/osc.js'
import { Box, Text } from '../ink.js'
import type { Command } from '../types/command.js'

import { loadConfig } from './config.js'
import { listSessions } from './store.js'

type SessionOption = {
  id: string
  label: string
  description: string
}

function buildResumeCommand(serverUrl: string, sessionId: string): string {
  return `bun run start -- ${serverUrl} resume ${sessionId}`
}

function ResumePicker({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: 'skip' | 'system' | 'user' }) => void
}): React.ReactNode {
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState<SessionOption[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const sessions = await listSessions(await loadConfig())
        if (cancelled) return
        setOptions(
          sessions.slice(0, 30).map(session => ({
            id: session.id,
            label: `${session.title || session.id}`,
            description: `${session.updatedAt}  ${session.lastPreview || session.id}`,
          })),
        )
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const serverUrl = getDirectConnectServerUrl() ?? 'http://127.0.0.1:4317'
  const selectOptions = useMemo(
    () =>
      options.map(option => ({
        label: option.label,
        value: option.id,
        description: option.description,
      })),
    [options],
  )

  async function handleSelect(sessionId: string): Promise<void> {
    const command = buildResumeCommand(serverUrl, sessionId)
    const raw = await setClipboard(command)
    if (raw) process.stdout.write(raw)
    onDone(
      `Resume command copied to clipboard.\n\nRun:\n${chalk.bold(command)}`,
      { display: 'user' },
    )
  }

  function handleCancel(): void {
    onDone(undefined, { display: 'skip' })
  }

  if (loading) {
    return (
      <Dialog title="Resume Session" onCancel={handleCancel} hideInputGuide>
        <LoadingState message="Loading local sessions…" />
      </Dialog>
    )
  }

  if (error) {
    return (
      <Dialog title="Resume Session" onCancel={handleCancel}>
        <Text color="error">{error}</Text>
      </Dialog>
    )
  }

  if (selectOptions.length === 0) {
    return (
      <Dialog title="Resume Session" onCancel={handleCancel}>
        <Text>No saved sessions found.</Text>
      </Dialog>
    )
  }

  return (
    <Dialog
      title="Resume Session"
      subtitle="Select a local A2A session"
      onCancel={handleCancel}
    >
      <Select
        options={selectOptions}
        onChange={value => {
          void handleSelect(String(value))
        }}
        onCancel={handleCancel}
      />
    </Dialog>
  )
}

export const a2aResumeCommand: Command = {
  type: 'local-jsx',
  name: 'resume',
  description: 'Show locally stored A2A sessions',
  async load() {
    return {
      call: async onDone => <ResumePicker onDone={onDone} />,
    }
  },
}
