---
summary: 'Auth overview: GitHub OAuth (web) + API tokens (CLI).'
read_when:
  - Working on login/token flows
  - Debugging 401s
---

# Auth

## Web auth — providers

Three OAuth providers are supported. Each is activated only when its credentials are set. At least one must be configured.

### GitHub OAuth (optional)

- Convex Auth + GitHub OAuth App.
- Env vars: `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `CONVEX_SITE_URL`
- Callback URL: `{CONVEX_SITE_URL}/api/auth/callback/github`
- GitHub users are subject to a 7-day account-age check before they can publish skills.
- Frontend: GitHub sign-in button is shown by default. Set `VITE_AUTH_SHOW_GITHUB=false` to hide it.

Local setup steps are in the repo root `README.md`.

### GitLab OAuth (optional)

Mirrors GitHub OAuth — same account-age check, same flow.

- Env vars: `AUTH_GITLAB_ID`, `AUTH_GITLAB_SECRET`
- Self-hosted GitLab: also set `AUTH_GITLAB_URL=https://gitlab.example.com`
- Callback URL: `{CONVEX_SITE_URL}/api/auth/callback/gitlab`
- Account age is verified via the GitLab Users API (`/api/v4/users?username=<handle>`).
- Frontend: set `VITE_AUTH_GITLAB_NAME=GitLab` (or any label) to show the sign-in button.

### Generic OIDC Provider (optional)

Supports any OIDC-compliant IdP (Authentik, Keycloak, Dex, …).

- Env vars (all three required): `AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`
- Display label: `AUTH_OIDC_NAME` (e.g. `"Authentik"`)
- Callback URL: `{CONVEX_SITE_URL}/api/auth/callback/oidc`
- OIDC users bypass the account-age check — they are managed by an admin-controlled IdP.
- Frontend: set `VITE_AUTH_OIDC_NAME=Authentik` (or any label) to show the sign-in button.

### Signup restriction

Set `AUTH_ALLOW_NEW_SIGNUPS=false` to block new user registrations while allowing existing users to sign in. New users see: "New account registration is currently disabled."

Note: the value must be the exact string `false`; `0`, `FALSE`, and `no` are not treated as false.

## API tokens (CLI)

The CLI uses a long-lived API token (Bearer token) for publish/sync/delete.

### Browser flow (default)

`skillhub login` does:

1. Starts a loopback HTTP server on `127.0.0.1` (random port).
2. Opens `<site>/cli/auth?redirect_uri=http://127.0.0.1:<port>/callback&state=...`.
3. Web UI requires login via one of the configured OAuth providers, then creates a token and redirects back to the loopback server.
4. CLI stores the token in the global config file.

### Headless flow

Create a token in the web UI (Settings → API tokens) and paste it:

```bash
skillhub login --token clh_...
```

### Token storage

Default global config path:

- macOS: `~/Library/Application Support/skillhub/config.json`

Override:

- `SKILLHUB_CONFIG_PATH=/path/to/config.json` (legacy `SKILLHUB_CONFIG_PATH`)

### Revocation

- Tokens can be revoked in the web UI.
- Revoked tokens return `401 Unauthorized` on CLI endpoints.
