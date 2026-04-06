import * as React from 'react'
import { Box, Text } from 'src/ink.js'
import { Clawd } from './Clawd.js'

const WELCOME_V2_WIDTH = 58

export function WelcomeV2() {
  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column" alignItems="center">
      <Text>
        <Text color="claude">Welcome to Agent Runtime CLI </Text>
        <Text dimColor>v{MACRO.VERSION}</Text>
      </Text>
      <Box marginTop={1} marginBottom={1}>
        <Clawd />
      </Box>
      <Text dimColor>Pikachu edition</Text>
    </Box>
  )
}
