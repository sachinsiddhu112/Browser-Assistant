CI run 25 passed for 466a991. Added explicit search-input typing, restricted to one visible search input, no implicit submit, same-origin non-POST form only. Added Chromium fixture checks for observation and typing. Generic click and select remain denied until trusted confirmation design; live YouTube and native side panel acceptance pending. Latest changes await CI. No deployment yet.

Pilot updates: YouTube selection is explicit in the trusted side panel. Choices
expire, bind to the active results tab, and cannot be supplied by the page as
approval. The extension reports successful playback only if it observes a
playing video; an opened but paused video is reported separately. See
[deployment instructions](DEPLOYMENT.md) for the private Chrome pilot and optional
health service. Cloud planning and generic click/submit stay outside this pilot. Optional on-device voice and intent suggestions require compatible Chrome capabilities.
