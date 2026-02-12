/* @vitest-environment node */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveSpecialAgentDefaultWorkspace, resolveSpecialAgentSkillRoots } from './specialAgentConfig.js'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('resolveSpecialAgentSkillRoots', () => {
  it('reads JSON5 config and resolves per-agent + shared skill roots', async () => {
    const base = await mkdtemp(join(tmpdir(), 'skillhub-special-agent-'))
    const home = join(base, 'home')
    const stateDir = join(base, 'state')
    const configPath = join(base, 'special-agent.json')
    const specialAgentStateDir = join(base, 'special-agent-state')

    process.env.HOME = home
    process.env.SPECIAL_AGENT_STATE_DIR = stateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = configPath
    process.env.SPECIAL_AGENT_STATE_DIR = specialAgentStateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = join(specialAgentStateDir, 'special-agent.json')

    const config = `{
      // JSON5 comments + trailing commas supported
      agents: {
        defaults: { workspace: '~/special-agent-main', },
        list: [
          { id: 'work', name: 'Work Bot', workspace: '~/special-agent-work', },
          { id: 'family', workspace: '~/special-agent-family', },
        ],
      },
      // legacy entries still supported
      agent: { workspace: '~/special-agent-legacy', },
      routing: {
        agents: {
          work: { name: 'Work Bot', workspace: '~/special-agent-work', },
          family: { workspace: '~/special-agent-family' },
        },
      },
      skills: {
        load: { extraDirs: ['~/shared/skills', '/opt/skills',], },
      },
    }`
    await writeFile(configPath, config, 'utf8')

    const { roots, labels } = await resolveSpecialAgentSkillRoots()

    const expectedRoots = [
      resolve(stateDir, 'skills'),
      resolve(specialAgentStateDir, 'skills'),
      resolve(home, 'special-agent-main', 'skills'),
      resolve(home, 'special-agent-work', 'skills'),
      resolve(home, 'special-agent-family', 'skills'),
      resolve(home, 'shared', 'skills'),
      resolve('/opt/skills'),
    ]

    expect(roots).toEqual(expect.arrayContaining(expectedRoots))
    expect(labels[resolve(stateDir, 'skills')]).toBe('Shared skills')
    expect(labels[resolve(specialAgentStateDir, 'skills')]).toBe('Special Agent: Shared skills')
    expect(labels[resolve(home, 'special-agent-main', 'skills')]).toBe('Agent: main')
    expect(labels[resolve(home, 'special-agent-work', 'skills')]).toBe('Agent: Work Bot')
    expect(labels[resolve(home, 'special-agent-family', 'skills')]).toBe('Agent: family')
    expect(labels[resolve(home, 'shared', 'skills')]).toBe('Extra: skills')
    expect(labels[resolve('/opt/skills')]).toBe('Extra: skills')
  })

  it('resolves default workspace from agents.defaults and agents.list', async () => {
    const base = await mkdtemp(join(tmpdir(), 'skillhub-special-agent-default-'))
    const home = join(base, 'home')
    const stateDir = join(base, 'state')
    const configPath = join(base, 'special-agent.json')
    const workspaceMain = join(base, 'workspace-main')
    const workspaceList = join(base, 'workspace-list')
    const specialAgentStateDir = join(base, 'special-agent-state')

    process.env.HOME = home
    process.env.SPECIAL_AGENT_STATE_DIR = stateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = configPath
    process.env.SPECIAL_AGENT_STATE_DIR = specialAgentStateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = join(specialAgentStateDir, 'special-agent.json')

    const config = `{
      agents: {
        defaults: { workspace: "${workspaceMain}", },
        list: [
          { id: 'main', workspace: "${workspaceList}", default: true },
        ],
      },
    }`
    await writeFile(configPath, config, 'utf8')

    const workspace = await resolveSpecialAgentDefaultWorkspace()
    expect(workspace).toBe(resolve(workspaceMain))
  })

  it('falls back to default agent in agents.list when defaults missing', async () => {
    const base = await mkdtemp(join(tmpdir(), 'skillhub-special-agent-list-'))
    const home = join(base, 'home')
    const configPath = join(base, 'special-agent.json')
    const workspaceMain = join(base, 'workspace-main')
    const workspaceWork = join(base, 'workspace-work')
    const specialAgentStateDir = join(base, 'special-agent-state')

    process.env.HOME = home
    process.env.SPECIAL_AGENT_CONFIG_PATH = configPath
    process.env.SPECIAL_AGENT_STATE_DIR = specialAgentStateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = join(specialAgentStateDir, 'special-agent.json')

    const config = `{
      agents: {
        list: [
          { id: 'main', workspace: "${workspaceMain}", default: true },
          { id: 'work', workspace: "${workspaceWork}" },
        ],
      },
    }`
    await writeFile(configPath, config, 'utf8')

    const workspace = await resolveSpecialAgentDefaultWorkspace()
    expect(workspace).toBe(resolve(workspaceMain))
  })

  it('respects SPECIAL_AGENT_STATE_DIR and SPECIAL_AGENT_CONFIG_PATH overrides', async () => {
    const base = await mkdtemp(join(tmpdir(), 'skillhub-special-agent-override-'))
    const home = join(base, 'home')
    const stateDir = join(base, 'custom-state')
    const configPath = join(base, 'config', 'special-agent.json')
    const specialAgentStateDir = join(base, 'special-agent-state')

    process.env.HOME = home
    process.env.SPECIAL_AGENT_STATE_DIR = stateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = configPath
    process.env.SPECIAL_AGENT_STATE_DIR = specialAgentStateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = join(specialAgentStateDir, 'special-agent.json')

    const config = `{
      agent: { workspace: "${join(base, 'workspace-main')}" },
    }`
    await mkdir(join(base, 'config'), { recursive: true })
    await writeFile(configPath, config, 'utf8')

    const { roots, labels } = await resolveSpecialAgentSkillRoots()

    expect(roots).toEqual(
      expect.arrayContaining([
        resolve(stateDir, 'skills'),
        resolve(specialAgentStateDir, 'skills'),
        resolve(join(base, 'workspace-main'), 'skills'),
      ]),
    )
    expect(labels[resolve(stateDir, 'skills')]).toBe('Shared skills')
    expect(labels[resolve(specialAgentStateDir, 'skills')]).toBe('Special Agent: Shared skills')
    expect(labels[resolve(join(base, 'workspace-main'), 'skills')]).toBe('Agent: main')
  })

  it('returns shared skills root when config is missing', async () => {
    const base = await mkdtemp(join(tmpdir(), 'skillhub-special-agent-missing-'))
    const stateDir = join(base, 'state')
    const configPath = join(base, 'missing', 'special-agent.json')
    const specialAgentStateDir = join(base, 'special-agent-state')

    process.env.SPECIAL_AGENT_STATE_DIR = stateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = configPath
    process.env.SPECIAL_AGENT_STATE_DIR = specialAgentStateDir
    process.env.SPECIAL_AGENT_CONFIG_PATH = join(specialAgentStateDir, 'special-agent.json')

    const { roots, labels } = await resolveSpecialAgentSkillRoots()

    expect(roots).toEqual([resolve(stateDir, 'skills'), resolve(specialAgentStateDir, 'skills')])
    expect(labels[resolve(stateDir, 'skills')]).toBe('Shared skills')
    expect(labels[resolve(specialAgentStateDir, 'skills')]).toBe('Special Agent: Shared skills')
  })

  it('supports Special Agent configuration files', async () => {
    const base = await mkdtemp(join(tmpdir(), 'skillhub-special-agent-'))
    const stateDir = join(base, 'special-agent-state')
    const workspace = join(base, 'special-agent-main')
    const configPath = join(stateDir, 'special-agent.json')

    process.env.SPECIAL_AGENT_STATE_DIR = stateDir

    await mkdir(stateDir, { recursive: true })
    const config = `{
      agents: {
        defaults: { workspace: "${workspace}", },
      },
    }`
    await writeFile(configPath, config, 'utf8')

    const { roots, labels } = await resolveSpecialAgentSkillRoots()
    expect(roots).toEqual(
      expect.arrayContaining([resolve(stateDir, 'skills'), resolve(workspace, 'skills')]),
    )
    expect(labels[resolve(stateDir, 'skills')]).toBe('Special Agent: Shared skills')
    expect(labels[resolve(workspace, 'skills')]).toBe('Special Agent: Agent: main')
  })
})
