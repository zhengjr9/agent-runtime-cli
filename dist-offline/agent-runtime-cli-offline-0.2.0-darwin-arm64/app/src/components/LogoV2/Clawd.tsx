import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { env } from '../../utils/env.js'

export type ClawdPose =
  | 'default'
  | 'arms-up'
  | 'look-left'
  | 'look-right'

type Props = {
  pose?: ClawdPose
}

type PikachuRows = {
  ears: string
  face: string
  body: string
}

const POSES: Record<ClawdPose, PikachuRows> = {
  default: {
    ears: '  /V\\ /V\\  ',
    face: ' /(o   o)\\\\ ',
    body: ' V=  w  =V ',
  },
  'arms-up': {
    ears: ' \\\\V/ /V// ',
    face: ' /(o   o)\\\\ ',
    body: ' /== w ==\\\\ ',
  },
  'look-left': {
    ears: '  /V\\ /V\\  ',
    face: ' /(o   ^)\\\\ ',
    body: ' V=  w  =V ',
  },
  'look-right': {
    ears: '  /V\\ /V\\  ',
    face: ' /(^   o)\\\\ ',
    body: ' V=  w  =V ',
  },
}

function renderRows(rows: PikachuRows): React.ReactNode {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color="clawd_background">{rows.ears}</Text>
      <Text color="clawd_body">{rows.face}</Text>
      <Text color="clawd_body">{rows.body}</Text>
    </Box>
  )
}

export function Clawd({ pose = 'default' }: Props) {
  const rows = POSES[pose]

  if (env.terminal === 'Apple_Terminal') {
    return renderRows(rows)
  }

  return renderRows(rows)
}
