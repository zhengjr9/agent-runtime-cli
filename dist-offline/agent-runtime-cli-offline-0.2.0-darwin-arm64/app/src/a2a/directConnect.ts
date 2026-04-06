import { errorMessage } from '../utils/errors.js'
import { jsonStringify } from '../utils/slowOperations.js'
import type { DirectConnectConfig } from '../server/directConnectManager.js'
import { connectResponseSchema } from '../server/types.js'

export class A2ADirectConnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'A2ADirectConnectError'
  }
}

export async function createA2ADirectConnectSession({
  serverUrl,
  cwd,
  resumeSessionId,
}: {
  serverUrl: string
  cwd: string
  resumeSessionId?: string
}): Promise<{
  config: DirectConnectConfig
  workDir?: string
}> {
  let resp: Response
  try {
    resp = await fetch(`${serverUrl}/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: jsonStringify({
        cwd,
        ...(resumeSessionId ? { resume_session_id: resumeSessionId } : {}),
      }),
    })
  } catch (error) {
    throw new A2ADirectConnectError(
      `Failed to connect to server at ${serverUrl}: ${errorMessage(error)}`,
    )
  }

  if (!resp.ok) {
    throw new A2ADirectConnectError(
      `Failed to create session: ${resp.status} ${resp.statusText}`,
    )
  }

  const result = connectResponseSchema().safeParse(await resp.json())
  if (!result.success) {
    throw new A2ADirectConnectError(
      `Invalid session response: ${result.error.message}`,
    )
  }

  return {
    config: {
      serverUrl,
      sessionId: result.data.session_id,
      wsUrl: result.data.ws_url,
    },
    workDir: result.data.work_dir,
  }
}
