# `skillhub`

SkillHub CLI — install, update, search, and publish agent skills as folders.

## Install

```bash
# From this repo (shortcut script at repo root)
bun skillhub --help

# Once published to npm
# npm i -g skillhub
```

## Auth (publish)

```bash
skillhub login
# or
skillhub auth login

# Headless / token paste
# or (token paste / headless)
skillhub login --token clh_...
```

Notes:

- Browser login opens `https://skillhub.ai/cli/auth` and completes via a loopback callback.
- Token stored in `~/Library/Application Support/skillhub/config.json` on macOS (override via `SKILLHUB_CONFIG_PATH`, legacy `SKILLHUB_CONFIG_PATH`).

## Examples

```bash
skillhub search "postgres backups"
skillhub install my-skill-pack
skillhub update --all
skillhub update --all --no-input --force
skillhub publish ./my-skill-pack --slug my-skill-pack --name "My Skill Pack" --version 1.2.0 --changelog "Fixes + docs"
```

## Sync (upload local skills)

```bash
# Start anywhere; scans workdir first, then legacy Special Agent locations.
skillhub sync

# Explicit roots + non-interactive dry-run
skillhub sync --root ../special-agent/skills --all --dry-run
```

## Defaults

- Site: `https://skillhub.ai` (override via `--site` or `SKILLHUB_SITE`, legacy `SKILLHUB_SITE`)
- Registry: discovered from `/.well-known/skillhub.json` on the site (legacy `/.well-known/skillhub.json`; override via `--registry` or `SKILLHUB_REGISTRY`)
- Workdir: current directory (falls back to Special Agent workspace if configured; override via `--workdir` or `SKILLHUB_WORKDIR`)
- Install dir: `./skills` under workdir (override via `--dir`)
