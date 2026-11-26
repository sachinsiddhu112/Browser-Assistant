# Architecture

## Hybrid on-device intent routing (approved design)

The Chrome MV3 extension is the local client: trusted React side panel, background service worker, content-script DOM snapshot/executor, and floating avatar. The separately deployed NestJS service provides cloud LLM planning, authentication and quotas. Shared Zod schemas define the allowed action contracts.

**Intent-first routing:** voice or typed user command → local intent recognizer → validated intent and slots → deterministic local skill (for known, low-risk tasks) **or** cloud planner fallback for complex, ambiguous or unsupported tasks. On-device intent recognition may use Chrome's built-in Prompt API where available, or an optional bundled/local small model; capability must be checked at runtime. Do not assume Gemini Nano, WebGPU, model download, or usable model performance is universally available. Include a simple deterministic intent router as a baseline and allow cloud fallback with user-visible disclosure and suitable consent. No cloud call is needed for an unambiguous supported local skill, unless authentication/usage policy requires one.

Example: “Play Kesariya on YouTube” → local `youtube.play` intent with `song=Kesariya` → a fixed YouTube search skill navigates to results → content script identifies a candidate → local bounded policy validates clicks → execute and verify playback. If results are ambiguous or the local skill cannot safely decide, ask the user or request cloud reasoning. Never claim playback until verified.

**Untrusted data boundary:** local intent model output and cloud planner output are both untrusted proposals, not permissions. Every browser action passes a deterministic local policy (allowed actions, domains, task scope, snapshot freshness, sensitive fields, high-risk confirmation) before execution. The browser page DOM is untrusted. No arbitrary JavaScript from an LLM is evaluated. Do not transmit sensitive page content to cloud unless necessary, authorized, and sanitized.

**Reliability:** observe → plan → authorize → act → verify with a bounded step count and a kill switch. Persist action lifecycle before execution and reconcile uncertain outcomes after MV3 worker suspension rather than blindly retrying. Keep user-visible progress and explicit confirmation for consequential actions.

**Deployment:** extension is packaged for the Chrome Web Store / installed locally, while NestJS runs independently on a server. Extension code and local model assets must follow MV3 packaging and remote-code restrictions. On-device AI support and actual model selection are implementation decisions for a later phase, not currently implemented.
