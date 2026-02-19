import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from './_generated/dataModel'
import {
  BANNED_REAUTH_MESSAGE,
  handleSignupRestriction,
  handleSoftDeletedUserReauth,
  SIGNUP_BLOCKED_MESSAGE,
} from './auth'

function makeCtx({
  user,
  banRecord,
}: {
  user: { deletedAt?: number } | null
  banRecord?: Record<string, unknown> | null
}) {
  const query = {
    withIndex: vi.fn().mockReturnValue({
      filter: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(banRecord ?? null),
      }),
    }),
  }
  const ctx = {
    db: {
      get: vi.fn().mockResolvedValue(user),
      patch: vi.fn().mockResolvedValue(null),
      query: vi.fn().mockReturnValue(query),
    },
  }
  return { ctx, query }
}

describe('handleSoftDeletedUserReauth', () => {
  const userId = 'users:1' as Id<'users'>

  it('skips when no existing user', async () => {
    const { ctx } = makeCtx({ user: null })

    await handleSoftDeletedUserReauth(ctx as never, { userId, existingUserId: null })

    expect(ctx.db.get).not.toHaveBeenCalled()
  })

  it('skips active users', async () => {
    const { ctx } = makeCtx({ user: { deletedAt: undefined } })

    await handleSoftDeletedUserReauth(ctx as never, { userId, existingUserId: userId })

    expect(ctx.db.query).not.toHaveBeenCalled()
    expect(ctx.db.patch).not.toHaveBeenCalled()
  })

  it('restores soft-deleted users when not banned', async () => {
    const { ctx } = makeCtx({ user: { deletedAt: 123 }, banRecord: null })

    await handleSoftDeletedUserReauth(ctx as never, { userId, existingUserId: userId })

    expect(ctx.db.patch).toHaveBeenCalledWith(userId, {
      deletedAt: undefined,
      updatedAt: expect.any(Number),
    })
  })

  it('blocks banned users with a custom message', async () => {
    const { ctx } = makeCtx({ user: { deletedAt: 123 }, banRecord: { action: 'user.ban' } })

    await expect(
      handleSoftDeletedUserReauth(ctx as never, { userId, existingUserId: userId }),
    ).rejects.toThrow(BANNED_REAUTH_MESSAGE)

    expect(ctx.db.patch).not.toHaveBeenCalled()
  })
})

describe('handleSignupRestriction', () => {
  afterEach(() => {
    delete process.env.AUTH_ALLOW_NEW_SIGNUPS
  })

  it('allows new user when env var is not set', () => {
    expect(() => handleSignupRestriction(null)).not.toThrow()
  })

  it('allows new user when AUTH_ALLOW_NEW_SIGNUPS=true', () => {
    process.env.AUTH_ALLOW_NEW_SIGNUPS = 'true'
    expect(() => handleSignupRestriction(null)).not.toThrow()
  })

  it('blocks new user when AUTH_ALLOW_NEW_SIGNUPS=false', () => {
    process.env.AUTH_ALLOW_NEW_SIGNUPS = 'false'
    expect(() => handleSignupRestriction(null)).toThrow(SIGNUP_BLOCKED_MESSAGE)
  })

  it('allows existing user to sign in even when signups are blocked', () => {
    process.env.AUTH_ALLOW_NEW_SIGNUPS = 'false'
    const existingUserId = 'users:1' as Id<'users'>
    expect(() => handleSignupRestriction(existingUserId)).not.toThrow()
  })
})
