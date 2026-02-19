import { ConvexError } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import type { ActionCtx } from '../_generated/server'

const MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000
const FETCH_TTL_MS = 24 * 60 * 60 * 1000

type GitLabUser = {
  created_at?: string
}

export async function requireGitLabAccountAge(ctx: ActionCtx, userId: Id<'users'>) {
  const user = await ctx.runQuery(internal.users.getByIdInternal, { userId })
  if (!user || user.deletedAt) throw new ConvexError('User not found')

  const handle = user.handle?.trim()
  if (!handle) throw new ConvexError('GitLab handle required')

  const gitlabBase = process.env.AUTH_GITLAB_URL ?? 'https://gitlab.com'
  const now = Date.now()
  let createdAt = user.gitlabCreatedAt ?? null
  const fetchedAt = user.gitlabFetchedAt ?? 0
  const stale = !createdAt || now - fetchedAt > FETCH_TTL_MS

  if (stale) {
    const url = `${gitlabBase}/api/v4/users?username=${encodeURIComponent(handle)}`
    const response = await fetch(url, { headers: { 'User-Agent': 'skillhub' } })
    if (!response.ok) throw new ConvexError('GitLab account lookup failed')

    const payload = (await response.json()) as GitLabUser[]
    const user0 = payload[0]
    const parsed = user0?.created_at ? Date.parse(user0.created_at) : Number.NaN
    if (!Number.isFinite(parsed)) throw new ConvexError('GitLab account lookup failed')

    createdAt = parsed
    await ctx.runMutation(internal.users.updateGitlabMetaInternal, {
      userId,
      gitlabCreatedAt: createdAt,
      gitlabFetchedAt: now,
    })
  }

  // createdAt is always non-null here: stale=false means it was non-null to
  // begin with; stale=true means the block above either set it or threw.
  const ageMs = now - createdAt
  if (ageMs < MIN_ACCOUNT_AGE_MS) {
    const remainingMs = MIN_ACCOUNT_AGE_MS - ageMs
    const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
    throw new ConvexError(
      `GitLab account must be at least 7 days old to upload skills. Try again in ${remainingDays} day${
        remainingDays === 1 ? '' : 's'
      }.`,
    )
  }
}
