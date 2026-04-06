import fs from 'node:fs/promises'
import path from 'node:path'

import type {
  AppConfig,
  MessageRecord,
  SessionBundle,
  SessionRecord,
} from './types.js'

type SessionIndex = {
  sessions: SessionRecord[]
}

const INDEX_FILE = 'sessions.json'

function sessionFilePath(storeDir: string, id: string): string {
  return path.join(storeDir, 'sessions', `${id}.json`)
}

async function ensureStore(config: AppConfig): Promise<void> {
  await fs.mkdir(path.join(config.storeDir, 'sessions'), { recursive: true })
}

async function readIndex(config: AppConfig): Promise<SessionIndex> {
  await ensureStore(config)
  const file = path.join(config.storeDir, INDEX_FILE)
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as SessionIndex
    return { sessions: parsed.sessions ?? [] }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { sessions: [] }
    }
    throw error
  }
}

async function writeIndex(config: AppConfig, index: SessionIndex): Promise<void> {
  await ensureStore(config)
  await fs.writeFile(
    path.join(config.storeDir, INDEX_FILE),
    `${JSON.stringify(index, null, 2)}\n`,
    'utf8',
  )
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function newSessionRecord(config: AppConfig): SessionRecord {
  const now = new Date().toISOString()
  return {
    id: createId('local'),
    title: `Session ${new Date().toLocaleString()}`,
    sessionId: createId('sess'),
    contextId: createId('ctx'),
    endpoint: config.endpoint,
    proxy: config.proxy,
    agentId: config.agentId,
    userId: config.userId,
    groupId: config.groupId,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    lastPreview: '',
  }
}

export async function listSessions(config: AppConfig): Promise<SessionRecord[]> {
  const index = await readIndex(config)
  return [...index.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function saveSessionBundle(
  config: AppConfig,
  bundle: SessionBundle,
): Promise<void> {
  await ensureStore(config)
  const index = await readIndex(config)
  const updated = {
    ...bundle.session,
    messageCount: bundle.messages.length,
    updatedAt: new Date().toISOString(),
    lastPreview: bundle.messages.at(-1)?.text.slice(0, 120) ?? '',
  }
  const next = index.sessions.filter((item) => item.id !== updated.id)
  next.unshift(updated)
  await writeIndex(config, { sessions: next })
  await fs.writeFile(
    sessionFilePath(config.storeDir, updated.id),
    `${JSON.stringify({ session: updated, messages: bundle.messages }, null, 2)}\n`,
    'utf8',
  )
}

export async function loadSessionBundle(
  config: AppConfig,
  id: string,
): Promise<SessionBundle | null> {
  await ensureStore(config)
  const sessions = await listSessions(config)
  const match =
    sessions.find((item) => item.id === id) ??
    sessions.find((item) => item.id.startsWith(id))
  if (!match) {
    return null
  }
  const raw = await fs.readFile(sessionFilePath(config.storeDir, match.id), 'utf8')
  return JSON.parse(raw) as SessionBundle
}

export async function createSessionBundle(
  config: AppConfig,
): Promise<SessionBundle> {
  const bundle = {
    session: newSessionRecord(config),
    messages: [] as MessageRecord[],
  }
  await saveSessionBundle(config, bundle)
  return bundle
}

export function newMessage(role: MessageRecord['role'], text: string): MessageRecord {
  return {
    id: createId('msg'),
    role,
    text,
    createdAt: new Date().toISOString(),
  }
}
