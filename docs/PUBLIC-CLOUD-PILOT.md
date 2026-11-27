# No-token cloud pilot

The extension has a fixed public HTTPS planner origin and sends no
Authorization header or cookies. Chrome declares the exact planner host, and
the panel displays a dismissible privacy note whenever it opens. Local commands do not need an account
or the cloud. The public endpoint is not extension-authenticated: anyone
who can reach it can make requests. CORS is not an anti-abuse control.

## Controls

- 10 admitted OpenAI requests per client IP per rolling 60 seconds. A single
  guided task can take more than one request. Shared networks can share a quota;
  changing networks can change the IP. Railway uses the public edge's
  X-Real-IP header on this direct public service, never X-Forwarded-For.
  Do not expose the app over a second ingress that can set X-Real-IP.
- A global count per UTC day caps OpenAI calls independently of IP. The
  limiter reserves a slot before each call; failed calls still count.
  SQLite reservations survive service restarts on the attached volume. No raw
  IP, commands, or page content are stored there. Only the recent minute of
  keyed address buckets is needed and expired rows are pruned on admission.
- No new provider call if the quota store is absent or unavailable. Two
  provider requests in flight per process at most. This is a call cap, not
  an exact dollar cap. OpenAI usage is still billed to the operator. The
  deployment should use one replica; do not point replicas at separate stores.

## Railway activation (not enabled by a code deploy alone)

1. Keep `OPENAI_API_KEY` sealed and `OPENAI_MODEL` unchanged. Attach one small
   persistent volume to the API service at `/data`. This is a storage volume,
   not a separate database service. Its resource usage counts toward Railway
   credits. Railway sets `RAILWAY_VOLUME_MOUNT_PATH` automatically.
2. Set `RAILWAY_RUN_UID=0` for volume initialization. The Docker startup
   script creates a directory on the attached volume for the SQLite ledger
   and drops to the unprivileged `node` user before starting the HTTP server.
3. Set `PLANNER_DAILY_CALL_CAP` (start at 100; accepts 1–1000).
   Set `PLANNER_PUBLIC_ENABLED=true` only when ready to open the pilot.
   Keep the old sealed pilot token only for a deliberate private rollback;
   when public mode is enabled even a bearer token cannot bypass the quota.
4. Deploy and check health; test one public task with the new extension.
   Omit or set `PLANNER_PUBLIC_ENABLED=false` and deploy to close anonymous
   access. This restores the existing private-token behavior for old builds.
   Disabling the flag keeps the usage ledger.

For local backend testing, set `PLANNER_BUDGET_DIR` to a writable absolute
directory; no live inference is needed for the automated test suite.
