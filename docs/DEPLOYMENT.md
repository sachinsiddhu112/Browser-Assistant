# Install the Phase 2 pilot in Chrome

The extension is installed in Chrome, not served as a frontend website. Its local
skills work without a backend. For a private test, use Load unpacked; publishing
to the Chrome Web Store and hosting the optional health service are separate.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

1. Open `chrome://extensions`, turn on Developer mode, and use **Load unpacked**
   on `apps/extension/.output/chrome-mv3`. Do not use the CI-only
   `chrome-mv3-test` build, which has fixture-only site access.
2. Open an HTTPS tab and click the extension icon to open its actual Chrome side
   panel and grant temporary access to the active tab.
3. Check **Inspect page**, **Scroll down**, **Search Google for NestJS**, and
   **Play Kesariya on YouTube**. The last command lists up to four results and
   opens only the one selected in the side panel. If Chrome or YouTube blocks
   autoplay, the extension reports that playback was not verified.
4. Stop a task while it is waiting for a video choice. Nothing should open.
   Reopen the panel and check that it still shows the cancelled state.

To make a zip for a private install or future Store submission:
`pnpm --filter @browser-assistant/extension zip`.

## Optional NestJS service

The pilot's NestJS service only exposes `GET /health`. It does not receive
browser data, execute browser actions, or provide cloud planning yet. A
front-end deployment or API URL is not needed for this Chrome test.

```sh
docker build -t browser-assistant-api .
docker run --rm -p 127.0.0.1:3000:3000 browser-assistant-api
curl --fail http://127.0.0.1:3000/health
```

On a container host, set the platform's port to `PORT` (default 3000), use
`GET /health` for its health check, and configure HTTPS at the host. The app
defaults to loopback when run outside Docker. No service or Store submission is
created by these commands alone.

## Optional on-device features

The panel can turn a phrase into a supported command using Chrome's Prompt API
when the model is already available. It produces an editable draft, never
executes it. The **Dictate locally (English)** button only uses installed
on-device English recognition, asks Chrome for microphone access on use, and
does not switch to remote speech recognition. Neither feature silently installs
a model. Both leave normal typed commands available on unsupported devices.
