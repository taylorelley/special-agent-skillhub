import { ConvexError } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import type { ActionCtx } from '../_generated/server'
import { requireGitHubAccountAge } from './githubAccount'
import { requireGitLabAccountAge } from './gitlabAccount'

export async function requireProviderAccountAge(ctx: ActionCtx, userId: Id<'users'>) {
  const user = await ctx.runQuery(internal.users.getByIdInternal, { userId })
  if (!user || user.deletedAt) throw new ConvexError('User not found')

  const provider = user.provider ?? 'github' // undefined = legacy GitHub user

  if (provider === 'github') {
    await requireGitHubAccountAge(ctx, userId)
  } else if (provider === 'gitlab') {
    await requireGitLabAccountAge(ctx, userId)
  }
  // OIDC users: managed by admin-controlled IdP, no age check needed
}
