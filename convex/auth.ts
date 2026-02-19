import GitHub from '@auth/core/providers/github'
import GitLab from '@auth/core/providers/gitlab'
import { convexAuth } from '@convex-dev/auth/server'
import type { GenericMutationCtx } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { DataModel, Id } from './_generated/dataModel'

export const BANNED_REAUTH_MESSAGE = 'Your account has been suspended.'
export const SIGNUP_BLOCKED_MESSAGE = 'New account registration is currently disabled.'

export async function handleSoftDeletedUserReauth(
  ctx: GenericMutationCtx<DataModel>,
  args: { userId: Id<'users'>; existingUserId: Id<'users'> | null },
) {
  if (!args.existingUserId) return

  const user = await ctx.db.get(args.userId)
  if (!user?.deletedAt) return

  const userId = args.userId
  const banRecord = await ctx.db
    .query('auditLogs')
    .withIndex('by_target', (q) => q.eq('targetType', 'user').eq('targetId', userId.toString()))
    .filter((q) => q.eq(q.field('action'), 'user.ban'))
    .first()

  if (banRecord) {
    throw new ConvexError(BANNED_REAUTH_MESSAGE)
  }

  await ctx.db.patch(userId, {
    deletedAt: undefined,
    updatedAt: Date.now(),
  })
}

export function handleSignupRestriction(existingUserId: Id<'users'> | null): void {
  if (existingUserId === null && process.env.AUTH_ALLOW_NEW_SIGNUPS === 'false') {
    throw new ConvexError(SIGNUP_BLOCKED_MESSAGE)
  }
}

export async function resolveProviderFromAccount(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<'users'>,
): Promise<string> {
  // authAccounts table is defined in @convex-dev/auth's authTables (verified in docs)
  const db = ctx.db as unknown as {
    query: (table: string) => {
      filter: (
        fn: (q: {
          eq: (a: unknown, b: unknown) => unknown
          field: (f: string) => unknown
        }) => unknown,
      ) => {
        first: () => Promise<{ provider?: string } | null>
      }
    }
  }
  const account = await db
    .query('authAccounts')
    .filter((q) => q.eq(q.field('userId'), userId))
    .first()
  return account?.provider ?? 'github'
}

const providers: Parameters<typeof convexAuth>[0]['providers'] = []

const githubId = process.env.AUTH_GITHUB_ID
const githubSecret = process.env.AUTH_GITHUB_SECRET
if (githubId && githubSecret) {
  providers.push(
    GitHub({
      clientId: githubId,
      clientSecret: githubSecret,
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.login,
          email: profile.email ?? undefined,
          image: profile.avatar_url,
        }
      },
    }),
  )
}

const gitlabId = process.env.AUTH_GITLAB_ID
const gitlabSecret = process.env.AUTH_GITLAB_SECRET
if (gitlabId && gitlabSecret) {
  const gitlabUrl = process.env.AUTH_GITLAB_URL
  providers.push(
    GitLab({
      clientId: gitlabId,
      clientSecret: gitlabSecret,
      ...(gitlabUrl
        ? {
            authorization: `${gitlabUrl}/oauth/authorize?scope=read_user`,
            token: `${gitlabUrl}/oauth/token`,
            userinfo: `${gitlabUrl}/api/v4/user`,
          }
        : {}),
      profile(profile: Record<string, unknown>) {
        return {
          id: String(profile.id),
          name: String(profile.username ?? profile.name ?? ''),
          email: typeof profile.email === 'string' ? profile.email : undefined,
          image: typeof profile.avatar_url === 'string' ? profile.avatar_url : undefined,
        }
      },
    } as Parameters<typeof GitLab>[0]),
  )
}

const oidcIssuer = process.env.AUTH_OIDC_ISSUER
const oidcClientId = process.env.AUTH_OIDC_CLIENT_ID
const oidcClientSecret = process.env.AUTH_OIDC_CLIENT_SECRET
if (oidcIssuer && oidcClientId && oidcClientSecret) {
  providers.push({
    id: 'oidc',
    name: process.env.AUTH_OIDC_NAME ?? 'SSO',
    type: 'oidc' as const,
    issuer: oidcIssuer,
    clientId: oidcClientId,
    clientSecret: oidcClientSecret,
  } as Parameters<typeof convexAuth>[0]['providers'][number])
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
  callbacks: {
    /**
     * Handle re-authentication of soft-deleted users, enforce signup restrictions,
     * and track which OAuth provider the user authenticated with.
     *
     * Performance note: The audit log query ONLY executes when a soft-deleted
     * user attempts to sign in. For normal active users the only writes are the
     * provider patch (every sign-in) and the deletedAt/updatedAt patch (never,
     * unless the user was soft-deleted and is being restored).
     */
    async afterUserCreatedOrUpdated(ctx, args) {
      handleSignupRestriction(args.existingUserId)
      // args.provider.id is available directly from the callback; avoids a
      // redundant authAccounts query and is reliable on first-time sign-ups.
      const provider = (args.provider as { id: string }).id
      await ctx.db.patch(args.userId, { provider })
      await handleSoftDeletedUserReauth(ctx, args)
    },
  },
})
