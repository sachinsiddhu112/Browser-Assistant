# Optional cloud fallback (private pilot)

This guide is for the private preview. The later no-token client uses [the public cloud pilot](PUBLIC-CLOUD-PILOT.md).

The normal **Run task** works as before (built-in commands first, then
Chrome's on-device planner). For a free-form task on a Chrome installation
without the local model, use **Optional cloud planner**. It will never switch
a local task to cloud automatically.

## Run the private API

Set these three server secrets using the host's secret manager:
- `PLANNER_ACCESS_TOKEN`: a random URL-safe token, at least 32 characters;
  give it only to your testers (for example, generate with `openssl rand -hex 32`).
- `OPENAI_API_KEY`: a model provider key, **server only**.
- `OPENAI_MODEL`: a model enabled for your account that supports Responses JSON output.

Use the root Dockerfile on a private pilot host, with HTTPS in front of Nest.
The default `/health` path still works. Without these settings the planner
returns 503 and cannot make a model call. If needed for CORS, set
`PLANNER_EXTENSION_ORIGIN` to the exact `chrome-extension://<id>` in
`chrome://extensions`. Never paste the provider key into the extension. For
local-only API testing, run it on loopback and use `http://localhost:3000`.
Use one API instance during the pilot: limits are per process (12 requests
per minute, 2 concurrent). Public accounts and multi-instance quotas remain
future work. Model usage can incur provider charges; set project limits.

## Run a task

1. Install v0.4.0 unpacked. Open a public HTTPS article and click the extension.
2. Enter a non-confidential goal, such as: "What topic is covered further down?"
3. Open **Optional cloud planner**, enter your server origin and the private
   planner token, consent to sharing for that task, and click **Run with cloud**.
4. Grant Chrome access to the named planner origin if prompted. The extension
   can scroll and read a fresh excerpt, then answer or ask a clarification.
   It does not type, upload, or submit forms.

Cloud mode sends the goal, limited visible text excerpts, scroll availability,
and previous scroll directions. It omits page URLs and form labels/values,
and masks some common sensitive strings, but this is not comprehensive
redaction. Do not use with confidential content. The API asks the provider
not to store the response (`store: false`); provider handling still depends
on your API project terms and settings. The access token is only kept in the
open panel; Chrome may remember the one-origin permission even after closing
it. Disable that permission in Chrome's extension settings when no longer needed.

The same extension-side step limits, cancellation, and tab/document binding
apply. The server returns a proposal, never commands the browser directly.
