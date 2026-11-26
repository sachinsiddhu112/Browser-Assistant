# Browser Assistant status

**Phase 2 private Chrome pilot.** The built extension uses a deterministic
intent router with explicit browser capabilities. Supported local skills include
inspection, scrolling, history and tab switching, search input without form
submission, Google search, and YouTube result choice. The side panel can offer
a reviewed on-device intent draft and local English dictation when supported.

- YouTube candidates are bounded and drawn only from the active YouTube results.
  Opening a video requires a selection in the trusted side panel. Stale,
  expired, cancelled and out-of-scope choices cannot authorize playback.
- The NestJS API exposes only its health endpoint. Cloud planning, accounts,
  production quotas, arbitrary form operation and Store release are not part
  of this pilot. No hosted deployment is required for unpacked Chrome testing.
- Typecheck, unit tests, extension/build, and local API health were checked.
  The high-severity threshold passed; it does not mean zero advisories.
  The local container could not start Chromium because it blocks the socket
  required for an extension profile. The GitHub Actions Chromium fixture run
  and a live smoke test in the native Chrome side panel remain required.

See [DEPLOYMENT.md](DEPLOYMENT.md) for installation and verification.

## Cloud planner diagnostics

For a cloud test that returns HTTP 502, check the API service's Railway
**Deploy Logs** for `openai_request_failed`. The log includes a fixed failure
kind and either the upstream HTTP status with a validated request ID (if
present) or an allowlisted network error label. No headers, response body,
secrets, model input or page content are logged. Browser-facing errors do not
change. Tests simulate provider responses; they do not incur API usage.

OpenAI JSON mode uses an explicit system message inside the Responses API
`input` conversation, with task data in a separate user message. The planner
still validates the result before sending it to the extension.
## Unified Run task (after the reviewed-actions pilot)

The side panel checks Chrome's Prompt API when it opens and again for free-form
requests. **Run task** always tries the built-in skill router first. Free-form
tasks use the local model when it is ready. When the model is unavailable, still
downloading, or cannot start, Run shows the cloud sharing review; it does not
auto-download the model or send data. With a planner origin and private token
entered, the same button becomes **Approve and continue**. Approval applies to
the current command and page only. Edits, tab changes and navigation clear the
review. A started local task never switches to cloud mid-run.

Cloud still requires a configured backend and preserves its existing action and
page-data limits. Use only public pages and non-confidential commands for cloud
tasks. Built-in actions continue to work without a planner.

The side panel groups the command, approvals, result, and pilot settings. The hosted planner origin is prefilled; a custom host is still available in Advanced connection settings. The pilot token is not persisted.
