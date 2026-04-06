import pkg from '../package.json'
import { launchRepl } from './replLauncher.js'
import { createRoot } from './ink/root.js'
import { getBaseRenderOptions } from './utils/renderOptions.js'
import { getDefaultAppState } from './state/AppStateStore.js'
import { getTools } from './tools.js'
import {
  exitWithError,
  renderAndRun,
} from './interactiveHelpers.js'
import { createSystemMessage } from './utils/messages.js'
import {
  setCwdState,
  setDirectConnectServerUrl,
  setOriginalCwd,
} from './bootstrap/state.js'
import { init } from './entrypoints/init.js'
import { loadConfig } from './a2a/config.js'
import {
  A2ADirectConnectError,
  createA2ADirectConnectSession,
} from './a2a/directConnect.js'
import { buildInitialMessages } from './a2a/initialMessages.js'
import { a2aResumeCommand } from './a2a/resumeCommand.js'
import { a2aUpstreamCommand } from './a2a/upstreamCommand.js'
import { listSessions, loadSessionBundle } from './a2a/store.js'
import exit from './commands/exit/index.js'

process.env.DISABLE_INSTALLATION_CHECKS ??= '1'
process.env.CLAUDE_CODE_SIMPLE ??= '1'

type CliArgs = {
  serverUrl: string
  resumeSessionId?: string
}

async function parseArgs(argv: string[]): Promise<CliArgs> {
  const serverUrl = argv[2]
  if (!serverUrl) {
    process.stderr.write(
      'Usage: bun run ./src/a2a-connect.tsx <server-url> [resume [session-id]]\n',
    )
    process.exit(1)
  }

  if (argv[3] !== 'resume') {
    return { serverUrl }
  }

  const explicitId = argv[4]?.trim()
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

async function main(): Promise<void> {
  const { serverUrl, resumeSessionId } = await parseArgs(process.argv)

  await init()
  const root = await createRoot(getBaseRenderOptions(false))
  const initialState = getDefaultAppState()

  try {
    const config = await loadConfig()
    const bundle = resumeSessionId
      ? await loadSessionBundle(config, resumeSessionId)
      : null

    if (resumeSessionId && !bundle) {
      throw new A2ADirectConnectError(`Session ${resumeSessionId} was not found`)
    }

    const session = await createA2ADirectConnectSession({
      serverUrl,
      cwd: process.cwd(),
      resumeSessionId: bundle?.session.id,
    })
    if (session.workDir) {
      setOriginalCwd(session.workDir)
      setCwdState(session.workDir)
    }
    setDirectConnectServerUrl(serverUrl)

    const connectInfoMessage = createSystemMessage(
      resumeSessionId
        ? `Resumed session ${bundle?.session.id}\nServer: ${serverUrl}`
        : `Connected to server at ${serverUrl}\nSession: ${session.config.sessionId}`,
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
        initialTools: getTools(initialState.toolPermissionContext),
        initialMessages: [...buildInitialMessages(bundle), connectInfoMessage],
        mcpClients: [],
        disableSlashCommands: false,
        directConnectConfig: session.config,
        thinkingConfig: { type: 'adaptive' },
      },
      renderAndRun,
    )
  } catch (error) {
    await exitWithError(
      root,
      error instanceof A2ADirectConnectError ? error.message : String(error),
    )
  }
}

await main()
