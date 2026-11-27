# Install Browser Assistant in Chrome

The extension is installed in Chrome, not served as a frontend website. Its local
skills work without a backend. For a private test, use Load unpacked; publishing
to the Chrome Web Store and hosting the optional planner service are separate.

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

### Guided workflow smoke test

1. Run **Open YouTube in a new tab**. Verify the old tab stays open.
2. Run **Open docs.nestjs.com in a new tab, then find the Guards guide and summarize it**.
   Approve only the named site in Chrome. The planner selects a route automatically after Run. Review the exact URL before
   following any proposed link.
3. On a trusted test form with an empty **Full name** field, run
   `Fill "Full name" with "Example Name"`. Before approval, the field must stay
   empty. After approval, it should contain that value without submitting.
4. Repeat a guided link task and press **Stop task** while the link is waiting for
   approval. The page must not change.

5. Run **Compare NestJS and Fastify docs on request validation**. Select two
   public results, approve access, and check that the comparison includes source
   links and leaves both pages open. Use two direct HTTPS links if Google shows
   a consent page or the results do not match.
6. Turn **Speak results** on and run a task; turn it off while it reads. If no
   device voice is installed, the result remains visible instead.

To make a zip for a private install or future Store submission:
`pnpm --filter @browser-assistant/extension zip`.

## Optional NestJS service

The NestJS service exposes `GET /health` and the optional cloud planner. The
planner proposes bounded read/navigation steps; Chrome executes and verifies
approved actions. The user does not enter a backend URL or token. Run may use the online planner automatically; see [public cloud pilot settings](PUBLIC-CLOUD-PILOT.md).

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

## Saved details and applications

Use dummy contact details on test pages. Set them in **Saved details**, open a
supported HTTPS application form, and use **Fill from my profile**. Verify the
page stays empty until approval. Edit one value, skip another, and check that
nothing is submitted. The application finder additionally supports a command
such as `Apply for the Backend Engineer role at Acme in Noida`; select the
posting and its application link when prompted.
