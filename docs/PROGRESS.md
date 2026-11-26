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
