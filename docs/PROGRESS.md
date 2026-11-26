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
