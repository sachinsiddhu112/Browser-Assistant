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

The no-token public preview is gated on server-side limits and persistent storage. See [PUBLIC-CLOUD-PILOT.md](PUBLIC-CLOUD-PILOT.md).

A built-in skill now handles “Open a new tab for YouTube” and “Open YouTube in a new tab.” It opens only the fixed YouTube home page, keeps the original tab, and does not call a model. Plain “Open YouTube” keeps its current-tab behavior.

## Guided navigation and form review

- “Open docs.nestjs.com in a new tab, then find the Guards guide and explain it” opens the literal HTTPS address, asks for that site's Chrome access, and continues using the same new tab. No model can supply an arbitrary address. The original tab remains open. The task is bound to the selected tab and origin.
- The model gets a fresh view after each verified scroll or reviewed same-origin link. Local AI can also propose expanding a native disclosure. Link/disclosure actions pause for review; redirects, stale targets, revisited pages, changing tabs, time/step limits and cancellation stop the workflow.
- “Fill "Full name" with "Sachin"; "Message" with "Hello"” creates a local preview without any AI or network call. Review the origin and each value, then fill eligible empty text controls. Credentials, file uploads, CAPTCHA, arbitrary button clicks and form submission remain manual.
- Required Chrome permissions and the Railway planner API are unchanged. Exact-site Chrome grants are requested at runtime and are revocable in the extension settings. Do not request broad site access at install time.

## Single-click routing

The side panel checks Chrome AI readiness when it opens, without displaying the
model name or a readiness badge. Run task uses a built-in skill when available,
otherwise prefers Chrome AI and uses the online planner if it is not ready or
cannot initialize. The dismissible notice on panel load explains what may leave the device; the
notice comes back when the panel is reopened.
The backend host is fixed and declared at install time; website access and
individual link/form approvals remain separate. Cloud excerpts still exclude
form labels and values, and cloud tasks are blocked in incognito.

## Motion polish

Direct commands and guided tasks use Chrome's native smooth scroll and wait for
movement to settle before reporting success or reading the next viewport. Real
page input interrupts the guided scroll. Reduced-motion preferences switch
scrolling to instant and remove nonessential side-panel and overlay motion.

## Research and spoken results

- Start with “Research …” or “Compare …”. Review up to three public Google
  results before granting access to their exact sites. Alternatively include
  two or three direct public HTTPS links in the command.
- The selected pages open in separate tabs and stay open. The assistant
  ranks bounded page excerpts locally, including headings, lists and table
  rows. The answer refers to numbered source links verified by the extension.
  The assistant skips unreadable or redirected pages instead of treating them
  as evidence. Search and cloud fallback should only be used for public topics.
- Form values are editable in the approval card. No form submission is added.
- The **Speak results** toggle defaults to off and is available next to Task
  result. It uses only an installed on-device voice, cancels on disable, next
  task, or dictation, and leaves written results available with no local voice.

## Saved details and application finder

- **Saved details** stores optional first name, last name, email and phone in
  Chrome extension-local storage. The background worker refuses profile
  operations until storage access is restricted to trusted extension contexts.
  The profile is not available in incognito and is never added to AI requests.
- “Apply for the Backend Engineer role at a company” searches for a posting.
  The user selects the destination; the browser checks the title, employer
  and an optional requested location. If necessary, the user also selects
  a linked application page. This works with standard supported forms, not
  sign-in walls, third-party embeds or arbitrary Apply buttons.
- The extension reviews a bounded set of matching, empty fields on one
  same-origin HTML form. It binds the draft to the document, form, action,
  field identities and labels. Reviewers can edit or skip values before
  filling. Unsupported fields, uploads and final submission stay manual.
- Use **Fill from my profile** on an application form already open. Saving or
  deleting a profile does not fill any site.

### v0.7.1: understand browser commands before reading the page

Fast-path supported commands stay local. For unfamiliar wording, the model first classifies the command without page content (Chrome when available, otherwise the private backend's existing public request budget). The classifier can select a predefined browser skill or point to an HTTPS destination the user supplied. Destinations outside the fixed built-ins still require website review. Page answers and clarification are now distinct from completed actions. No runtime permissions or provider credentials were added.

Deploy the backward-compatible planner update before relying on cloud intent routing. Older backends still support page answers; the explicit YouTube URL repair and on-device intent routing do not require a backend update.
