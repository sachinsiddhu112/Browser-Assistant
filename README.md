# Browser Assistant

A Chrome MV3 preview for local browser tasks. Use typed commands or, on
compatible installations, on-device English dictation and intent suggestions.
The extension can search, scroll, inspect pages, navigate tabs, and let you
choose a YouTube result to open. Guided tasks can continue after approved
same-site links. Form drafts can be reviewed and filled locally; the extension
does not submit forms.

Requires Node.js 22 and pnpm 10. Run `corepack enable`, then
`pnpm install --frozen-lockfile` and `pnpm build`. Load the generated
`apps/extension/.output/chrome-mv3` folder via **Load unpacked** in
`chrome://extensions`.

[Chrome setup and optional backend deployment](docs/DEPLOYMENT.md) ·
[Architecture](docs/ARCHITECTURE.md) · [Progress](docs/PROGRESS.md)

The extension’s built-in commands and explicit form drafts do not require a
backend. Free-form tasks prefer on-device processing and fall back automatically to the
online planner after you run a task. Use public pages and non-confidential commands. The optional NestJS service provides the bounded planner and its
health endpoint. See [the public cloud pilot](docs/PUBLIC-CLOUD-PILOT.md) for
budget and deployment settings. Do not commit credentials.
