import * as React from 'react'
import { useState } from 'react'

import TextInput from '../components/TextInput.js'
import { Dialog } from '../components/design-system/Dialog.js'
import { MessageResponse } from '../components/MessageResponse.js'
import { Box, Text } from '../ink.js'
import type { Command } from '../types/command.js'

import { loadConfig, saveRuntimeUpstreamBase } from './config.js'

function UpstreamDialog({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: 'skip' | 'system' | 'user' }) => void
}): React.ReactNode {
  const [value, setValue] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(rawValue: string): Promise<void> {
    try {
      const saved = await saveRuntimeUpstreamBase(rawValue)
      onDone(
        `Upstream updated.\n\nBase: ${saved.upstreamBase}\nEndpoint: ${saved.endpoint}`,
        { display: 'user' },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleCancel(): void {
    onDone(undefined, { display: 'skip' })
  }

  return (
    <Dialog
      title="Set Upstream"
      subtitle="Enter the base URL; /a2a/v1 will be appended automatically"
      onCancel={handleCancel}
    >
      <Box flexDirection="column">
        <Text dimColor>Example: http://127.0.0.1:8080/aaa-man/</Text>
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Text>&gt;</Text>
          <TextInput
            value={value}
            onChange={next => {
              setValue(next)
              setCursorOffset(next.length)
              if (error) setError(null)
            }}
            onSubmit={submitted => {
              void handleSubmit(submitted)
            }}
            focus
            showCursor
            columns={80}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            placeholder="http://127.0.0.1:8080/aaa-man/"
          />
        </Box>
        {error ? (
          <Box marginTop={1}>
            <Text color="error">{error}</Text>
          </Box>
        ) : null}
      </Box>
    </Dialog>
  )
}

export const a2aUpstreamCommand: Command = {
  type: 'local-jsx',
  name: 'upstream',
  description: 'Set the A2A upstream base URL',
  argumentHint: '<base-url>',
  async load() {
    return {
      call: async (onDone, _context, args) => {
        const nextValue = args.trim()
        if (nextValue) {
          try {
            const saved = await saveRuntimeUpstreamBase(nextValue)
            onDone(
              `Upstream updated.\n\nBase: ${saved.upstreamBase}\nEndpoint: ${saved.endpoint}`,
              { display: 'user' },
            )
            return null
          } catch (err) {
            return (
              <MessageResponse>
                <Text color="error">
                  {err instanceof Error ? err.message : String(err)}
                </Text>
              </MessageResponse>
            )
          }
        }

        const config = await loadConfig()
        return <UpstreamDialog key={config.upstreamBase} onDone={onDone} />
      },
    }
  },
}
