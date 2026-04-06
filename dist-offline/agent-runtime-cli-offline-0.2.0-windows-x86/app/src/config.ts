import os from 'node:os'
import path from 'node:path'

import type { AppConfig } from './types.js'

export function loadConfig(): AppConfig {
  const endpoint =
    process.env.A2A_ENDPOINT ?? 'http://127.0.0.1:8080/aaa-man/a2a/v1'
  const proxy = process.env.A2A_PROXY ?? 'http://127.0.0.1:9092'
  const agentId = process.env.A2A_AGENT_ID ?? 'aaa-man'
  const userId =
    process.env.A2A_USER_ID ?? '54d0867e-247c-47d3-ae54-1934c5995610'
  const groupId = process.env.A2A_GROUP_ID ?? userId
  const origin = process.env.A2A_ORIGIN ?? 'http://127.0.0.1:54324'
  const acceptLanguage =
    process.env.A2A_ACCEPT_LANGUAGE ?? 'en,zh-CN;q=0.9,zh;q=0.8'
  const storeDir =
    process.env.A2A_STORE_DIR ??
    path.join(process.cwd(), '.local-state', os.userInfo().username)

  return {
    endpoint,
    proxy,
    agentId,
    userId,
    groupId,
    origin,
    acceptLanguage,
    storeDir,
  }
}
