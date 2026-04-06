import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

import type { AppConfig } from './types.js'

type RuntimeConfig = {
  upstreamBase?: string
}

export const DEFAULT_UPSTREAM_BASE = 'http://127.0.0.1:8080/aaa-man/'

function getDefaultStoreDir(): string {
  return (
    process.env.A2A_STORE_DIR ??
    path.join(process.cwd(), '.local-state', os.userInfo().username)
  )
}

function getRuntimeConfigPath(storeDir: string): string {
  return path.join(storeDir, 'a2a-runtime.json')
}

async function readRuntimeConfig(storeDir: string): Promise<RuntimeConfig> {
  try {
    const raw = await fs.readFile(getRuntimeConfigPath(storeDir), 'utf8')
    const parsed = JSON.parse(raw) as RuntimeConfig
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export async function hasStoredUpstreamBase(
  storeDir = getDefaultStoreDir(),
): Promise<boolean> {
  const runtimeConfig = await readRuntimeConfig(storeDir)
  return (
    typeof runtimeConfig.upstreamBase === 'string' &&
    runtimeConfig.upstreamBase.trim().length > 0
  )
}

function normalizeUpstreamBase(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Upstream base cannot be empty')
  }
  const url = new URL(trimmed)
  return url.toString().replace(/\/?$/, '/')
}

export function buildEndpointFromUpstream(upstreamBase: string): string {
  const normalized = normalizeUpstreamBase(upstreamBase)
  if (normalized.endsWith('/a2a/v1/')) {
    return normalized.slice(0, -1)
  }
  return new URL('a2a/v1', normalized).toString()
}

export async function getRuntimeUpstreamBase(
  storeDir = getDefaultStoreDir(),
): Promise<string> {
  const runtimeConfig = await readRuntimeConfig(storeDir)
  const configured =
    runtimeConfig.upstreamBase ??
    process.env.A2A_UPSTREAM ??
    process.env.A2A_ENDPOINT ??
    DEFAULT_UPSTREAM_BASE

  if (/\/a2a\/v1\/?$/.test(configured)) {
    return configured.replace(/\/?$/, '/').replace(/a2a\/v1\/$/, '')
  }

  return normalizeUpstreamBase(configured)
}

export async function saveRuntimeUpstreamBase(
  upstreamBase: string,
  storeDir = getDefaultStoreDir(),
): Promise<{ upstreamBase: string; endpoint: string }> {
  const normalized = getNormalizedRuntimeUpstreamBase(upstreamBase)
  await fs.mkdir(storeDir, { recursive: true })
  await fs.writeFile(
    getRuntimeConfigPath(storeDir),
    JSON.stringify({ upstreamBase: normalized }, null, 2),
    'utf8',
  )
  return {
    upstreamBase: normalized,
    endpoint: buildEndpointFromUpstream(normalized),
  }
}

function getNormalizedRuntimeUpstreamBase(value: string): string {
  if (/\/a2a\/v1\/?$/.test(value.trim())) {
    return value.trim().replace(/\/?$/, '/').replace(/a2a\/v1\/$/, '')
  }
  return normalizeUpstreamBase(value)
}

export async function loadConfig(): Promise<AppConfig> {
  const storeDir = getDefaultStoreDir()
  const upstreamBase = await getRuntimeUpstreamBase(storeDir)
  const endpoint = buildEndpointFromUpstream(upstreamBase)
  const proxy = process.env.A2A_PROXY ?? 'http://127.0.0.1:9092'
  const agentId = process.env.A2A_AGENT_ID ?? 'aaa-man'
  const userId =
    process.env.A2A_USER_ID ?? '54d0867e-247c-47d3-ae54-1934c5995610'
  const groupId = process.env.A2A_GROUP_ID ?? userId
  const origin = process.env.A2A_ORIGIN ?? 'http://127.0.0.1:54324'
  const acceptLanguage =
    process.env.A2A_ACCEPT_LANGUAGE ?? 'en,zh-CN;q=0.9,zh;q=0.8'

  return {
    upstreamBase,
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
