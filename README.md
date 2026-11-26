# Browser Assistant

A private Chrome MV3 pilot for local browser tasks. Use typed commands or, on
compatible installations, on-device English dictation and intent suggestions.
The extension can search, scroll, inspect pages, navigate tabs, and let you
choose a YouTube result to open.

Requires Node.js 22 and pnpm 10. Run `corepack enable`, then
`pnpm install --frozen-lockfile` and `pnpm build`. Load the generated
`apps/extension/.output/chrome-mv3` folder via **Load unpacked** in
`chrome://extensions`.

[Chrome setup and optional backend deployment](docs/DEPLOYMENT.md) ·
[Architecture](docs/ARCHITECTURE.md) · [Progress](docs/PROGRESS.md)

The local pilot does not require a hosted backend. The separate NestJS service
only provides a health endpoint; cloud planning, public accounts and quotas
are not enabled. Do not commit credentials.
