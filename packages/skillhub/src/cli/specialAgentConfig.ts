import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import JSON5 from 'json5'

type SpecialAgentConfig = {
  agent?: { workspace?: string }
  agents?: {
    defaults?: { workspace?: string }
    list?: Array<{
      id?: string
      name?: string
      workspace?: string
      default?: boolean
    }>
  }
  routing?: {
    agents?: Record<
      string,
      {
        name?: string
        workspace?: string
      }
    >
  }
  skills?: {
    load?: {
      extraDirs?: string[]
    }
  }
}

export type SpecialAgentSkillRoots = {
  roots: string[]
  labels: Record<string, string>
}

export async function resolveSpecialAgentSkillRoots(): Promise<SpecialAgentSkillRoots> {
  const roots: string[] = []
  const labels: Record<string, string> = {}

  const specialAgentStateDir = resolveSpecialAgentStateDir()
  const specialAgentShared = resolveUserPath(join(specialAgentStateDir, 'skills'))
  pushRoot(roots, labels, specialAgentShared, 'Special Agent: Shared skills')

  const specialAgentConfig = await readSpecialAgentConfig()
  if (!specialAgentConfig) return { roots, labels }

  addConfigRoots(specialAgentConfig, roots, labels, 'Special Agent')

  return { roots, labels }
}

export async function resolveSpecialAgentDefaultWorkspace(): Promise<string | null> {
  const config = await readSpecialAgentConfig()
  if (!config) return null

  const defaultsWorkspace = resolveUserPath(
    config?.agents?.defaults?.workspace ?? config?.agent?.workspace ?? '',
  )
  if (defaultsWorkspace) return defaultsWorkspace

  const listedAgents = config?.agents?.list ?? []
  const defaultAgent =
    listedAgents.find((entry) => entry.default) ?? listedAgents.find((entry) => entry.id === 'main')
  const listWorkspace = resolveUserPath(defaultAgent?.workspace ?? '')
  if (listWorkspace) return listWorkspace

  return null
}

function resolveSpecialAgentStateDir() {
  const override = process.env.SPECIAL_AGENT_STATE_DIR?.trim()
  if (override) return resolveUserPath(override)
  return join(homedir(), '.special-agent')
}

function resolveSpecialAgentConfigPath() {
  const override = process.env.SPECIAL_AGENT_CONFIG_PATH?.trim()
  if (override) return resolveUserPath(override)
  return join(resolveSpecialAgentStateDir(), 'special-agent.json')
}

function resolveUserPath(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('~')) {
    return resolve(trimmed.replace(/^~(?=$|[\\/])/, homedir()))
  }
  return resolve(trimmed)
}

async function readSpecialAgentConfig(): Promise<SpecialAgentConfig | null> {
  return readConfigFile(resolveSpecialAgentConfigPath())
}

async function readConfigFile(path: string): Promise<SpecialAgentConfig | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON5.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as SpecialAgentConfig
  } catch {
    return null
  }
}

function addConfigRoots(
  config: SpecialAgentConfig,
  roots: string[],
  labels: Record<string, string>,
  labelPrefix?: string,
) {
  const prefix = labelPrefix ? `${labelPrefix}: ` : ''

  const mainWorkspace = resolveUserPath(
    config.agents?.defaults?.workspace ?? config.agent?.workspace ?? '',
  )
  if (mainWorkspace) {
    pushRoot(roots, labels, join(mainWorkspace, 'skills'), `${prefix}Agent: main`)
  }

  const listedAgents = config.agents?.list ?? []
  for (const entry of listedAgents) {
    const workspace = resolveUserPath(entry?.workspace ?? '')
    if (!workspace) continue
    const name = entry?.name?.trim() || entry?.id?.trim() || 'agent'
    pushRoot(roots, labels, join(workspace, 'skills'), `${prefix}Agent: ${name}`)
  }

  const agents = config.routing?.agents ?? {}
  for (const [agentId, entry] of Object.entries(agents)) {
    const workspace = resolveUserPath(entry?.workspace ?? '')
    if (!workspace) continue
    const name = entry?.name?.trim() || agentId
    pushRoot(roots, labels, join(workspace, 'skills'), `${prefix}Agent: ${name}`)
  }

  const extraDirs = config.skills?.load?.extraDirs ?? []
  for (const dir of extraDirs) {
    const resolved = resolveUserPath(String(dir))
    if (!resolved) continue
    const label = `${prefix}Extra: ${basename(resolved) || resolved}`
    pushRoot(roots, labels, resolved, label)
  }
}

function pushRoot(roots: string[], labels: Record<string, string>, root: string, label?: string) {
  const resolved = resolveUserPath(root)
  if (!resolved) return
  if (!roots.includes(resolved)) roots.push(resolved)
  if (!label) return
  const existing = labels[resolved]
  if (!existing) {
    labels[resolved] = label
    return
  }
  const parts = existing
    .split(', ')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.includes(label)) return
  labels[resolved] = `${existing}, ${label}`
}
