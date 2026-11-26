# Phase 3: on-device, goal-driven browsing pilot

The previous browser skills remain fast paths. On a regular HTTPS page, click
the extension icon to give it active-tab access, then type or dictate a goal.
**Run task** uses the local planner when no fixed command matches. For
example, open a long public article and ask, “What topics are covered under the
next heading?” The planner sees a small visible excerpt and chooses whether to
scroll, answer, or ask for clarification. After scrolling it sees a fresh view.

On a form, try, “Draft my name as Sachin.” The result appears in the side panel.
It is a suggestion for review: the extension does not write it into fields,
attach documents, click, or submit. The engine excludes password inputs,
sensitive field markers, and input values. Use non-confidential pages for
testing. Active tab/document changes, timeout, and cancellation stop the task.
The model can still misunderstand or misstate what it sees; review answers.

The planner needs Chrome's **already available** on-device Prompt API. No
model is downloaded automatically and no data is sent to a server by the
planner. When unavailable, typed deterministic commands still work. Dictation
keeps the existing on-device capability check and sends no audio to a server.
These two device capabilities must be checked on the actual target Chrome.
The test suite uses a mock model with the real extension and browser fixture.

The optional server remains health-only. A cloud planner, automatic form
filling, uploads, and submission have not been added. This keeps the preview
pilot safe to try without accounts, secrets, or a backend deployment.
