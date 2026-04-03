import React from 'react'
import { render } from 'ink'

import { App } from './app.js'
import { loadConfig } from './config.js'
import {
  createSessionBundle,
  listSessions,
  loadSessionBundle,
} from './store.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const [command, arg] = process.argv.slice(2)

  if (command === 'list') {
    const sessions = await listSessions(config)
    if (sessions.length === 0) {
      console.log('No saved sessions')
      return
    }
    for (const session of sessions) {
      console.log(
        `${session.id}\t${session.updatedAt}\t${session.messageCount}\t${session.title}`,
      )
    }
    return
  }

  let bundle =
    command === 'resume' && arg
      ? await loadSessionBundle(config, arg)
      : null

  if (!bundle) {
    if (command === 'resume' && arg) {
      console.error(`session not found: ${arg}`)
      process.exitCode = 1
      return
    }
    bundle = await createSessionBundle(config)
  }

  render(<App config={config} initialBundle={bundle} />)
}

await main()
