/* @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { internal } from '../_generated/api'
import { requireGitLabAccountAge } from './gitlabAccount'

vi.mock('../_generated/api', () => ({
  internal: {
    users: {
      getByIdInternal: Symbol('getByIdInternal'),
      updateGitlabMetaInternal: Symbol('updateGitlabMetaInternal'),
    },
  },
}))

const ONE_DAY_MS = 24 * 60 * 60 * 1000

describe('requireGitLabAccountAge', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses cached gitlabCreatedAt when fresh', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-02-02T12:00:00Z')
    vi.setSystemTime(now)
    const runQuery = vi.fn().mockResolvedValue({
      _id: 'users:1',
      handle: 'steipete',
      gitlabCreatedAt: now.getTime() - 10 * ONE_DAY_MS,
      gitlabFetchedAt: now.getTime() - ONE_DAY_MS + 1000,
    })
    const runMutation = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await requireGitLabAccountAge({ runQuery, runMutation } as never, 'users:1' as never)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(runMutation).not.toHaveBeenCalled()
    expect(runQuery).toHaveBeenCalledWith(internal.users.getByIdInternal, { userId: 'users:1' })

    vi.useRealTimers()
  })

  it('rejects accounts younger than 7 days', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-02-02T12:00:00Z')
    vi.setSystemTime(now)
    const runQuery = vi.fn().mockResolvedValue({
      _id: 'users:1',
      handle: 'newbie',
      gitlabCreatedAt: now.getTime() - 2 * ONE_DAY_MS,
      gitlabFetchedAt: now.getTime() - ONE_DAY_MS / 2,
    })
    const runMutation = vi.fn()

    await expect(
      requireGitLabAccountAge({ runQuery, runMutation } as never, 'users:1' as never),
    ).rejects.toThrow(/GitLab account must be at least 7 days old/i)

    vi.useRealTimers()
  })

  it('fetches from GitLab API when cache is stale', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-02-02T12:00:00Z')
    vi.setSystemTime(now)

    const runQuery = vi.fn().mockResolvedValue({
      _id: 'users:1',
      handle: 'steipete',
      gitlabCreatedAt: undefined,
      gitlabFetchedAt: now.getTime() - 2 * ONE_DAY_MS,
    })
    const runMutation = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ created_at: '2020-01-01T00:00:00Z' }],
    })
    vi.stubGlobal('fetch', fetchMock)

    await requireGitLabAccountAge({ runQuery, runMutation } as never, 'users:1' as never)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/users?username=steipete',
      expect.objectContaining({ headers: { 'User-Agent': 'skillhub' } }),
    )
    expect(runMutation).toHaveBeenCalledWith(internal.users.updateGitlabMetaInternal, {
      userId: 'users:1',
      gitlabCreatedAt: Date.parse('2020-01-01T00:00:00Z'),
      gitlabFetchedAt: now.getTime(),
    })

    vi.useRealTimers()
  })

  it('throws when GitLab lookup fails (non-ok response)', async () => {
    const runQuery = vi.fn().mockResolvedValue({
      _id: 'users:1',
      handle: 'steipete',
      gitlabCreatedAt: undefined,
      gitlabFetchedAt: 0,
    })
    const runMutation = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      requireGitLabAccountAge({ runQuery, runMutation } as never, 'users:1' as never),
    ).rejects.toThrow(/GitLab account lookup failed/i)
  })

  it('throws when GitLab returns empty user array', async () => {
    const runQuery = vi.fn().mockResolvedValue({
      _id: 'users:1',
      handle: 'nobody',
      gitlabCreatedAt: undefined,
      gitlabFetchedAt: 0,
    })
    const runMutation = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    )

    await expect(
      requireGitLabAccountAge({ runQuery, runMutation } as never, 'users:1' as never),
    ).rejects.toThrow(/GitLab account lookup failed/i)
  })
})
