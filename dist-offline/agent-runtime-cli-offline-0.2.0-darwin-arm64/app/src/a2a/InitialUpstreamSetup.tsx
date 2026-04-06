import * as React from 'react'
import { useState } from 'react'

import TextInput from '../components/TextInput.js'
import { Dialog } from '../components/design-system/Dialog.js'
import { Box, Text } from '../ink.js'
import { DEFAULT_UPSTREAM_BASE, saveRuntimeUpstreamBase } from './config.js'

export function InitialUpstreamSetup({
  onComplete,
  onCancel,
}: {
  onComplete: (result: { upstreamBase: string; endpoint: string }) => void
  onCancel: () => void
}): React.ReactNode {
  const [value, setValue] = useState(DEFAULT_UPSTREAM_BASE)
  const [cursorOffset, setCursorOffset] = useState(DEFAULT_UPSTREAM_BASE.length)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(input: string): Promise<void> {
    try {
      const result = await saveRuntimeUpstreamBase(input)
      onComplete(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog
      title="Connect Upstream"
      subtitle="First-time setup required before starting Agent Runtime CLI"
      onCancel={onCancel}
    >
      <Box flexDirection="column">
        <Text dimColor>Enter the upstream base URL.</Text>
        <Text dimColor>`/a2a/v1` will be appended automatically.</Text>
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
            placeholder={DEFAULT_UPSTREAM_BASE}
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
