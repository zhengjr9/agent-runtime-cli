#!/usr/bin/env bun

import { spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

import pkg from '../package.json'
import { launchRepl } from './replLauncher.js'
import { createRoot } from './ink/root.js'
import { getBaseRenderOptions } from './utils/renderOptions.js'
import { getDefaultAppState } from './state/AppStateStore.js'
import { getTools } from './tools.js'
import { exitWithError, renderAndRun, showSetupDialog } from './interactiveHelpers.js'
import { createSystemMessage } from './utils/messages.js'
import {
  setCwdState,
  setDirectConnectServerUrl,
  setOriginalCwd,
} from './bootstrap/state.js'
import { init } from './entrypoints/init.js'
import {
  hasStoredUpstreamBase,
  loadConfig,
} from './a2a/config.js'
import { InitialUpstreamSetup } from './a2a/InitialUpstreamSetup.js'
import {
  A2ADirectConnectError,
  createA2ADirectConnectSession,
} from './a2a/directConnect.js'
import { buildInitialMessages } from './a2a/initialMessages.js'
import { a2aResumeCommand } from './a2a/resumeCommand.js'
import { a2aUpstreamCommand } from './a2a/upstreamCommand.js'
import { listSessions, loadSessionBundle } from './a2a/store.js'
import { startBridgeServer } from './a2a/bridgeServer.js'
import exit from './commands/exit/index.js'

process.env.DISABLE_INSTALLATION_CHECKS ??= '1'
process.env.CLAUDE_CODE_SIMPLE ??= '1'

const STARTUP_DEBUG = process.env.AGENT_CLI_DEBUG_STARTUP === '1'

function debugStartup(message: string): void {
  if (STARTUP_DEBUG) {
    process.stderr.write(`[agent-cli] ${message}\n`)
  }
}

type CliArgs = {
  serverUrl: string
  resumeSessionId?: string
  bridgeMode?: boolean
}

const DEFAULT_BRIDGE_URL = `http://127.0.0.1:${process.env.CLAUDE_A2A_BRIDGE_PORT ?? '4317'}`

if (!('MACRO' in globalThis)) {
  ;(
    globalThis as typeof globalThis & {
      MACRO: {
        VERSION: string
        BUILD_TIME: string
        PACKAGE_URL: string
        NATIVE_PACKAGE_URL: string
        VERSION_CHANGELOG: string
        ISSUES_EXPLAINER: string
        FEEDBACK_CHANNEL: string
      }
    }
  ).MACRO = {
    VERSION: pkg.version,
    BUILD_TIME: '',
    PACKAGE_URL: pkg.name,
    NATIVE_PACKAGE_URL: pkg.name,
    VERSION_CHANGELOG: '',
    ISSUES_EXPLAINER: 'file an issue',
    FEEDBACK_CHANNEL: 'github',
  }
}

async function parseArgs(argv: string[]): Promise<CliArgs> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      [
        'Usage: agent-cli [resume [session-id]]',
        '',
        'Commands:',
        '  agent-cli                 Start interactive chat',
        '  agent-cli bridge         Start local bridge only',
        '  agent-cli resume          Resume latest local session',
        '  agent-cli resume <id>     Resume a specific local session',
        '',
        'Behavior:',
        '  - Starts local A2A bridge automatically if needed',
        '  - Prompts for upstream setup on first launch',
        '  - Default bridge URL: http://127.0.0.1:4317',
        '',
      ].join('\n'),
    )
    process.exit(0)
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${pkg.version}\n`)
    process.exit(0)
  }

  const explicitServerUrl =
    argv[2] && /^https?:\/\//.test(argv[2]) ? argv[2] : undefined
  const serverUrl = explicitServerUrl ?? DEFAULT_BRIDGE_URL
  const offset = explicitServerUrl ? 3 : 2
  const command = argv[offset]

  if (command === 'bridge') {
    return { serverUrl, bridgeMode: true }
  }

  if (command !== 'resume') {
    return { serverUrl }
  }

  const explicitId = argv[offset + 1]?.trim()
  if (explicitId) {
    return { serverUrl, resumeSessionId: explicitId }
  }

  const latest = (await listSessions(await loadConfig()))[0]
  if (!latest) {
    throw new A2ADirectConnectError('No saved sessions found to resume')
  }

  return {
    serverUrl,
    resumeSessionId: latest.id,
  }
}

async function isBridgeHealthy(serverUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${serverUrl}/health`)
    return resp.ok
  } catch {
    return false
  }
}

async function isPortFree(host: string, port: number): Promise<boolean> {
  return await new Promise(resolve => {
    const tester = net.createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => {
      tester.close(() => resolve(true))
    })
    tester.listen(port, host)
  })
}

async function chooseBridgeUrl(serverUrl: string): Promise<string> {
  const parsed = new URL(serverUrl)
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    return serverUrl
  }

  const basePort = Number(parsed.port || '80')
  for (let offset = 0; offset < 20; offset += 1) {
    const candidatePort = basePort + offset
    if (await isPortFree(parsed.hostname, candidatePort)) {
      parsed.port = String(candidatePort)
      return parsed.toString().replace(/\/$/, '')
    }
  }

  return serverUrl
}

async function ensureBridge(serverUrl: string): Promise<string> {
  if (await isBridgeHealthy(serverUrl)) {
    return serverUrl
  }

  const actualServerUrl = await chooseBridgeUrl(serverUrl)
  const isBunScript =
    process.execPath.includes('/.bun/') &&
    typeof process.argv[1] === 'string' &&
    /\.(tsx|ts|js|mjs|cjs)$/.test(process.argv[1])
  const childCwd = isBunScript
    ? fileURLToPath(new URL('../', import.meta.url))
    : process.cwd()
  const command = isBunScript
    ? [process.execPath, 'run', process.argv[1], 'bridge']
    : [process.execPath, 'bridge']
  const child = spawn(command[0]!, command.slice(1), {
    detached: true,
    stdio: 'ignore',
    cwd: childCwd,
    env: {
      ...process.env,
      CLAUDE_A2A_BRIDGE_PORT: new URL(actualServerUrl).port,
      PATH: `${process.env.HOME ? `${process.env.HOME}/.bun/bin:` : ''}${process.env.PATH ?? ''}`,
    },
  })
  child.unref()

  for (let i = 0; i < 50; i += 1) {
    if (await isBridgeHealthy(actualServerUrl)) {
      return actualServerUrl
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new A2ADirectConnectError(`Failed to start local bridge at ${actualServerUrl}`)
}

async function ensureInitialUpstream(root: Awaited<ReturnType<typeof createRoot>>): Promise<void> {
  if (await hasStoredUpstreamBase()) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    void showSetupDialog<void>(root, done => (
      <InitialUpstreamSetup
        onComplete={() => {
          resolve()
          void done()
        }}
        onCancel={() => {
          reject(new A2ADirectConnectError('Upstream setup was cancelled'))
        }}
      />
    )).catch(reject)
  })
}

async function main(): Promise<void> {
  const { serverUrl, resumeSessionId, bridgeMode } = await parseArgs(process.argv)
  debugStartup(`parsed args server=${serverUrl} resume=${resumeSessionId ?? '<new>'}`)

  if (bridgeMode) {
    startBridgeServer()
    await new Promise(() => {})
  }

  await init()
  debugStartup('init complete')
  const root = await createRoot(getBaseRenderOptions(false))
  debugStartup('createRoot complete')
  const initialState = getDefaultAppState()

  try {
    await ensureInitialUpstream(root)
    debugStartup('ensureInitialUpstream complete')
    const actualServerUrl = await ensureBridge(serverUrl)
    debugStartup(`ensureBridge complete server=${actualServerUrl}`)

    const config = await loadConfig()
    debugStartup(`loadConfig complete endpoint=${config.endpoint}`)
    const bundle = resumeSessionId
      ? await loadSessionBundle(config, resumeSessionId)
      : null
    debugStartup(`loadSessionBundle complete found=${bundle ? 'yes' : 'no'}`)

    if (resumeSessionId && !bundle) {
      throw new A2ADirectConnectError(`Session ${resumeSessionId} was not found`)
    }

    const session = await createA2ADirectConnectSession({
      serverUrl: actualServerUrl,
      cwd: process.cwd(),
      resumeSessionId: bundle?.session.id,
    })
    debugStartup(`createA2ADirectConnectSession complete session=${session.config.sessionId}`)
    const targetEndpoint = config.endpoint

    if (session.workDir) {
      setOriginalCwd(session.workDir)
      setCwdState(session.workDir)
    }
    setDirectConnectServerUrl(targetEndpoint)

    const connectInfoMessage = createSystemMessage(
      resumeSessionId
        ? `Resumed session ${bundle?.session.id}\nUpstream: ${targetEndpoint}`
        : `Connected to upstream ${targetEndpoint}\nSession: ${session.config.sessionId}`,
      'info',
    )

    await launchRepl(
      root,
      {
        getFpsMetrics: () => undefined,
        initialState,
      },
      {
        debug: false,
        commands: [exit, a2aResumeCommand, a2aUpstreamCommand],
        initialTools: [...getTools(initialState.toolPermissionContext)],
        initialMessages: [...buildInitialMessages(bundle), connectInfoMessage],
        mcpClients: [],
        disableSlashCommands: false,
        directConnectConfig: session.config,
        thinkingConfig: { type: 'adaptive' },
      },
      renderAndRun,
    )
    debugStartup('launchRepl returned')
  } catch (error) {
    debugStartup(`error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    await exitWithError(
      root,
      error instanceof A2ADirectConnectError ? error.message : String(error),
    )
  }
}

await main()
