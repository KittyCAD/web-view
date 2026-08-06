# Puget Wall Debugging Runbook

This runbook covers the nine-monitor Zoo Web View Wall on
`user@puget-289587`. It documents the techniques used to distinguish network,
server, browser, renderer, orchestration, and visual failures without
unnecessarily restarting the orchestration server.

## Runtime Layout

- Local worktree: `work/web-view`
- Branch: `wall-9-viewers`
- Static bundle on Puget: `/home/user/web-view-wall-static`
- Runtime files on Puget: `/home/user/web-view-wall-runtime`
- Server: `/home/user/web-view-wall-runtime/scripts/wall_server.py`
- Relauncher: `/home/user/web-view-wall-runtime/scripts/relaunch_zoo_wall.py`
- Event log: `/home/user/web-view-wall-runtime/logs/wall-events.jsonl`
- Chrome DevTools: Puget `127.0.0.1:9222`
- Wall URL: `http://127.0.0.1:3000`
- Display: `:0`
- Current X authority: `/run/user/1000/gdm/Xauthority`
- Visible display Chrome DevTools: Puget `127.0.0.1:9222`
- Headless controller Chrome DevTools: Puget `127.0.0.1:9223`
- Controller virtual display: `:88`
- Durable state: `/home/user/web-view-wall-runtime/logs/wall-state.json`
- Resource samples: `/home/user/web-view-wall-runtime/logs/wall-resources.jsonl`

The relauncher opens one exact 3840x2160 Chrome app window for each
`wallTile=0..8` in this layout:

```text
0 1 2
3 4 5
6 7 8
```

Tile 4 is the center orchestrator.

The visible center is not the orchestration process. A separate controller
Chrome process runs on Xvfb `:88` with `wallController=1`. It owns the browser
state machine and checkpoints the complete run to the wall server every two
seconds when dirty. All nine visible pages are disposable clients: they poll
tile-filtered state, rehydrate after reload, and send start/stop commands
through the server.

The user services are:

```sh
systemctl --user status zoo-wall-server
systemctl --user status zoo-wall-supervisor
systemctl --user status zoo-wall-resources
```

The supervisor restarts a stale controller independently from the displays.
A controller restart cancels orphaned Zoo work, restores KCL, interfaces,
agent status, logs, and snapshots from disk, and redispatches only unfinished
agents. A display restart never interrupts the run.

The Xvfb controller must launch with Chrome background throttling disabled.
Without `--disable-background-timer-throttling`,
`--disable-backgrounding-occluded-windows`, and
`--disable-renderer-backgrounding`, Chrome can classify the hidden controller
as occluded after an extended run. Event polling then falls from sub-second
intervals to roughly 30-60 seconds, terminal Zoo events build up, and completed
server work remains displayed as running.

The loopback API must use persistent HTTP/1.1 connections. HTTP/1.0 closes a
TCP connection after every event, eventually leaving hundreds of sockets in
`TIME_WAIT` and wedging Chrome's per-origin network pool even while the page,
controller heartbeat, and CDP remain responsive. The diagnostic signature is
a growing `workEventLastMessageAgeMs`, repeated 30-second fetch aborts, a fresh
browser-side fetch that hangs after the server has logged a 200 response, and
an elevated `ss -s` `timewait` count. `WallHandler.protocol_version` is
therefore `HTTP/1.1`; verify an idle browser-side event probe returns in about
10 seconds and `workEventRecycleCount` remains zero after recovery.

The supervisor uses the freshest lightweight controller-client heartbeat, not
the timestamp from the last full state checkpoint. It waits 60 seconds before
treating that heartbeat as stale and also requires exactly one controller
Chrome process. Full checkpoint timestamps can pause during expensive
aggregate updates and previously caused a false recovery with two competing
controllers. The systemd unit uses `KillMode=process`, so restarting the
supervisor does not kill the controller Chrome process that it launched. The
relauncher also takes `/tmp/zoo-wall-relaunch.lock`, removes duplicate managed
profiles, and verifies exactly one window for every `wallTile=0..8`; this
prevents overlapping manual and supervised relaunches from creating a second
4K wall.

Controller recovery folds every active agent interval into its persisted
elapsed time before redispatching work. The durable `aggregateElapsedMs` value
is a monotonic floor, so the displayed aggregate agent time cannot move
backward after a recovery. The fold stops at the durable state's `updatedAt`
checkpoint, not at browser startup, so a machine power outage does not count
powered-off time as agent work. A restored complete agent whose persisted
snapshot is missing or was only queued/rendering is marked for a fresh final
snapshot; the in-memory render queue is deliberately not assumed to survive a
controller process restart.

Each full state checkpoint has a 30-second browser-side deadline. If a POST
stalls while the lightweight controller heartbeat remains healthy, the request
is aborted and the dirty state is retried. Without this bound, one hung
checkpoint leaves every later checkpoint coalesced behind the unresolved
promise even though orchestration continues.

## Durable State Checks

Check the server, controller heartbeat, and all display heartbeats:

```sh
curl -sS http://127.0.0.1:3000/api/wall-health | jq
```

Inspect the authoritative controller state without loading it into a visible
page:

```sh
curl -sS 'http://127.0.0.1:3000/api/wall-state?controller=1' \
  | jq '{
      revision,
      phase: .run.phase,
      rootStatus: .run.rootStatus,
      agents: (.agents | length),
      files: (.files | length),
      centerSnapshot: .run.centerSnapshotUrl
    }'
```

Inspect one display's filtered state:

```sh
curl -sS 'http://127.0.0.1:3000/api/wall-state?tile=0' \
  | jq '{revision, agents: [.agents[].id]}'
```

The visible center's Start and Stop controls enqueue commands at
`/api/wall-command`. They do not execute orchestration in the display process.

## Snapshot Rendering

Agent and center images use a bounded server-side render pool. Each job gets an
isolated Xvfb display and Chrome profile, then writes a WebP directly under
`public/snapshots`. Browser clients receive a URL, not a base64 image payload.

The default render concurrency is two:

```sh
curl -sS http://127.0.0.1:3000/api/wall-health \
  | jq '.snapshotRenderConcurrency'
```

Do not bring up a second ad hoc wall server for routine snapshot throughput.
The main server owns both bounded lanes and unique X display allocation.

## Resource History

`zoo-wall-resources.service` records a bounded ten-second time series of:

- wall server and wall Chrome process RSS;
- total sampled wall RSS;
- NVIDIA memory and utilization;
- system available memory and swap.

Read recent samples:

```sh
tail -30 /home/user/web-view-wall-runtime/logs/wall-resources.jsonl | jq
```

The log rotates to `.1` at 16 MiB. A monotonically growing visible Chrome RSS
curve is a client leak; controller RSS growth isolated to the controller
profile is a controller leak; temporary snapshot Chrome processes should
disappear after every job.

The controller checkpoint is a large, text-heavy payload. Posting the complete
state every two seconds caused Chrome PartitionAlloc to retain several
gigabytes of anonymous request-buffer arenas even though the JavaScript heap
remained below 100 MiB. Checkpoints are gzip encoded, limited to one every ten
seconds, and omit `lastGoodKcl` when it is identical to the current file.
Confirm the state revision advances about six times per minute during a busy
run and compare `/proc/<controller-renderer-pid>/smaps_rollup` with
`Runtime.getHeapUsage` when diagnosing renewed growth.

Do not use `Memory.forciblyPurgeJavaScriptMemory` or
`Memory.simulatePressureNotification` against the live controller. On Puget's
Chrome build these commands reclaim PartitionAlloc memory but discard the
controller page, stop its heartbeat, and force recovery. The supervisor instead
tracks total controller-profile RSS and performs durable controller recovery
only if RSS remains above 3 GiB.

## Connectivity Preflight

First confirm that the Codex desktop app has macOS local-network permission:

`System Settings -> Privacy & Security -> Local Network -> Codex`

If this permission is disabled, SSH and Tailscale access can fail from Codex
even when Puget is online. This permission has unexpectedly become disabled
before, so check it early when the host was recently reachable.

Then separate Tailscale reachability from SSH reachability:

```sh
'/Applications/Tailscale.app/Contents/MacOS/Tailscale' status \
  | rg -i 'puget|289587|100\.90\.236\.52'

'/Applications/Tailscale.app/Contents/MacOS/Tailscale' ping \
  --c=3 puget-289587.hawk-dinosaur.ts.net

ssh -o BatchMode=yes -o ConnectTimeout=8 user@puget-289587 \
  'hostname; date -u; uptime'
```

Do not assume a LAN hostname or address is a Tailscale peer. Diagnose Tailscale,
LAN routing, DNS, and SSH separately.

## DevTools Tunnel

Use a local SSH tunnel instead of exposing Chrome DevTools:

```sh
ssh -N -L 9223:127.0.0.1:9222 user@puget-289587
```

Keep that process running. Confirm DevTools and list wall pages:

```sh
curl -sS http://127.0.0.1:9223/json/version | jq

curl -sS http://127.0.0.1:9223/json \
  | jq -r '.[] | select(.type == "page") |
      [.title, .url, .webSocketDebuggerUrl] | @tsv'
```

A healthy launch has exactly nine page targets containing `wallTile=0` through
`wallTile=8`.

## DOM State Monitoring

Use `Runtime.evaluate` over the DevTools WebSocket to inspect state. Avoid
`Page.captureScreenshot` for routine monitoring: repeated CDP captures of nine
4K pages allocate large Chrome capture surfaces and can make GPU-memory
diagnostics misleading.

Every wall page maintains global agent state, including cards that are not
assigned to that physical monitor. Count only cards with a visible bounding
rectangle. Counting every `.agent-card` can report stale hidden
`Visual Queued` labels that are not visible on the wall.

The core visibility filter is:

```js
const visibleCards = [...document.querySelectorAll('.agent-card')].filter(card => {
  const rect = card.getBoundingClientRect()
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < innerWidth &&
    rect.top < innerHeight
  )
})
```

Useful values per visible card:

```js
visibleCards.map(card => ({
  name: card.querySelector('.agent-title')?.textContent,
  role: card.querySelector('.agent-role')?.textContent,
  status: card.dataset.status,
  placeholder:
    card.querySelector('.agent-viewer-placeholder')?.textContent?.trim(),
  hasImage: Boolean(card.querySelector('.agent-viewer-slot img')),
}))
```

Interpret the visual states precisely:

- `Awaiting Zookeeper result`: the agent is still generating or reviewing KCL.
- `KCL propagated - visual queued`: KCL exists, but snapshot capture has not
  started.
- `KCL propagated - rendering visual`: the serialized snapshot renderer is
  processing it.
- `Zookeeper result ready`: the assigned monitor has a snapshot.
- `KCL propagated - visual unavailable`: rendering failed after recovery.
- `KCL complete - metadata only`: expected for the reusable component catalog.

Monitor the controller and each display page. A green center status alone does
not prove that the side windows, snapshot queue, or physical window geometry
are healthy.

## Physical Monitor Capture

Use X11 screen capture on Puget for visual verification. This captures the
actual monitor output and does not allocate CDP screenshot surfaces.

On Puget:

```sh
export DISPLAY=:0
export XAUTHORITY=/run/user/1000/gdm/Xauthority
xrandr --listmonitors
```

If the GDM authority path is absent, try `/home/user/.Xauthority`.

Capture the center and one side monitor:

```sh
python3 - <<'PY'
from PIL import ImageGrab

captures = {
    "center": (3840, 2160, 7680, 4320),
    "top-left": (0, 0, 3840, 2160),
}

for name, bounds in captures.items():
    ImageGrab.grab(bbox=bounds, xdisplay=":0").save(
        f"/tmp/puget-wall-{name}.png"
    )
PY
```

Copy them to the local machine:

```sh
mkdir -p /private/tmp/puget-wall-captures/current
scp user@puget-289587:/tmp/puget-wall-center.png \
  /private/tmp/puget-wall-captures/current/
scp user@puget-289587:/tmp/puget-wall-top-left.png \
  /private/tmp/puget-wall-captures/current/
```

For a full audit, capture these nine bounding boxes:

```text
0: (0, 0, 3840, 2160)
1: (3840, 0, 7680, 2160)
2: (7680, 0, 11520, 2160)
3: (0, 2160, 3840, 4320)
4: (3840, 2160, 7680, 4320)
5: (7680, 2160, 11520, 4320)
6: (0, 4320, 3840, 6480)
7: (3840, 4320, 7680, 6480)
8: (7680, 4320, 11520, 6480)
```

Inspect both the image and its UI context. A dark CAD viewport with
`Awaiting Zookeeper result` is not a failed snapshot. A gray image published as
ready is a failed capture and should be investigated.

## Blank Snapshot Diagnosis

The wall validates captured frames on a 192 x 108 downsampled canvas. A frame
with an insufficient luminance range is treated as blank, not published, and
retried. Do not reduce this to 64 x 36: thin wires can disappear during that
downsample and create a false blank result even when the persisted WebP clearly
contains geometry. After repeated render failures, an agent with a prior good
snapshot retains that image instead of reopening KCL solely to repair a visual.

When a pane looks gray:

1. Check whether it contains an `<img>` or only a placeholder.
2. Read the assigned agent's latest log lines.
3. Look for `snapshot renderer returned a blank frame`.
4. Confirm that the pane remains in a waiting/error state instead of displaying
   the rejected image.
5. Inspect the persisted WebP only if an image was actually saved.

Very small WebP files with almost no color or luminance variation are usually
blank engine frames, not valid low-complexity geometry.

## Resource Monitoring

Sample resources every 20-30 seconds during architecture, the first worker
burst, and orchestrator review. Record a time series; one process snapshot does
not show whether memory is stable or accumulating.

Chrome GPU-process RSS:

```sh
ps -eo rss,args \
  | awk '/[c]hrome --type=gpu-process/{sum+=$1}
      END{printf "GPU_RSS_KB=%d\n", sum+0}'
```

Largest Chrome and server processes:

```sh
ps -eo pid,rss,etime,args --sort=-rss \
  | grep -E '[c]hrome|wall_server' \
  | head -n 20
```

NVIDIA memory and utilization:

```sh
nvidia-smi \
  --query-gpu=index,memory.used,memory.total,utilization.gpu \
  --format=csv,noheader
```

System memory:

```sh
free -h
```

Important diagnostic distinction:

- A healthy `wall_server.py` plus rapidly growing Chrome GPU RSS indicates a
  browser/rendering failure, not a server failure.
- Review `500` responses and `BrokenPipeError` after a wall crash are often
  consequences of the browser disconnecting, not the initiating fault.
- Chrome process existence does not prove that all nine pages or windows are
  healthy.

The current launcher uses software video decode and canvas rendering because
the eight side displays show static snapshots and only the center needs a live
stream. This avoids unbounded NVIDIA surface retention in Chrome's shared GPU
process.

## Event Log Review

Inspect recent structured events:

```sh
tail -n 300 /home/user/web-view-wall-runtime/logs/wall-events.jsonl \
  | jq -r '[.ts, .kind, (.agentId // ""), (.revision // ""),
      (.message // .event // .status // "")] | @tsv'
```

Count and group persisted snapshots:

```sh
jq -s '
  map(select(.kind == "snapshot.saved")) |
  {
    count: length,
    agents: (map(.agentId) | unique | length),
    perAgent: (
      group_by(.agentId) |
      map({agent: .[0].agentId, count: length}) |
      sort_by(-.count)
    )
  }
' /home/user/web-view-wall-runtime/logs/wall-events.jsonl
```

Correlate:

1. Agent status and WebSocket dialog.
2. `snapshot.saved` timestamps and revisions.
3. Visible DOM state on the assigned tile.
4. Direct X11 screenshots.
5. Chrome/server resource samples.

Do not infer a rendering failure from KCL propagation alone.

## Rework Diagnosis

A reopen should contain a concrete target, instruction, and reason in a
`review.success` event. Verify that the target resolves by exact agent ID,
role, or file path before relying on fuzzy role matching. Geometry work aimed
at a sub-orchestrator should route to its best-matching descendant worker while
placement work also reopens the sub-orchestrator.

Higher-level reviewers may inspect all descendant files and images, but they
must not directly edit a worker owned by a deeper sub-orchestrator. Look for
`delegate descendant rework through ...` on the higher-level reviewer and
`upstream review directive` on its direct child orchestrator. That child
re-evaluates the finding in its local coordinate frame and decides whether to
dispatch the worker. A worker's direct parent may still dispatch it directly.
Without this rule, a global review and a local review can alternately rewrite
the same route or mate coordinates and create a legitimate-looking rework loop.
The pending-descendant gate applies to the first review after controller
rehydration too; do not bypass it when the in-memory review counter is zero.

Review WebSockets use a 300-second idle timeout because large assembly projects
can spend more than two minutes executing or inspecting without emitting a
frame. `connection interrupted` is retryable alongside closed/reset sockets.
Use the review trace's frame count, response size, and last-frame age to
distinguish a quiet large review from an immediate control-plane disconnect.

Worker WebSockets use a 600-second idle timeout. Complex geometry repair turns
can finish KCL execution and snapshot inspection, then remain quiet for more
than five minutes while preparing the final response. The one-hour total work
timeout remains the outer bound for a genuinely stuck turn.

The browser supervisor allows 180 seconds of missing display heartbeats and 600
seconds of missing controller heartbeats before relaunching a process. Large
KCL execution and snapshot work has been observed blocking the controller main
thread for more than 180 seconds while RSS remains stable; a shorter controller
window repeatedly cancels otherwise viable Zoo turns. The separate 3 GiB
controller RSS limit still provides memory containment.

The in-page agent watchdog also distinguishes a missing final event from a
failed CAD result. After its 15-minute local-work grace period, it may accept a
retained KCL draft only when that exact draft has a persisted nonblank snapshot
and still passes the executable-change, route-rework, and import-frame checks.
Without all of that evidence it keeps the existing retry behavior.

Import-frame repair prompts explicitly override stale requests to preserve a
nonzero parent transform or stale local values for the named failing mates. A
heterogeneous child keeps the semantic mate identities and unrelated
interfaces, but authors the named coordinates in the parent frame so identity
placement is executable.

For flattened exports, the acceptance parser independently requires the
`parent_interface` line to state `identity`, `zero translation`, and `zero
rotation`. The natural wording `zero translation and zero rotation` is valid.

The route-change acceptance check excludes mandatory route waypoints from its
stale-coordinate heuristic. A target coordinate can already exist in an old
interface comment even when the old executable centerline never traversed it;
preserving that required waypoint in corrected KCL is not a failed rework.
Decimal points inside target vectors must not be treated as sentence endings
when extracting those positive waypoints.

Only one review may run for a parent at a time. After a successful review, the
controller records the parent's latest settled input revision rather than only
the revision captured when the request started. This discards a queued copy
caused solely by snapshot persistence or deterministic import reconciliation;
real KCL rework changes the revision again and still schedules a fresh review.

For a geometry-changing review request, the controller fingerprints executable
KCL before and after the Zoo turn. A response that only reformats comments or
returns the prior executable body is retried instead of being marked complete
and sent back into the same review. Review measurements for the named defect
override stale interface comments, and an explicit request to remove a
redundant child overrides the generic placement rule to place every available
import; the alias may remain unused or hidden when the graph still owns it.
Placement prompts put that mandatory instruction before the potentially large
child KCL and interface context so request-size clipping cannot silently turn a
targeted review into a generic synchronization pass.

Before an orchestrator has authored placement KCL, the controller may append a
`ZOOKEEPER_WALL_DIRECT_CHILDREN` block so every ready direct child remains
visible in a partial assembly. Once Zookeeper returns an orchestrator result,
the controller persists `ZOOKEEPER_WALL_PLACEMENT_AUTHORED` and stops adding
that temporary block. If a supposedly removed or redundant component reappears
at the origin, inspect the persisted KCL for both markers. A direct-children
block after the authored-placement marker means the running controller bundle
is stale and should be rebuilt, deployed, and relaunched.

An in-flight review is intentionally not restored after a controller recycle.
If its retries failed immediately before recovery and the completed
orchestrator still needs inspection, requeue that exact review through the
controller CDP tunnel:

```sh
node scripts/monitor_wall_cdp.mjs --force-review=sub-orchestrator-0015
```

The command refuses non-orchestrators, a non-running wall, and orchestrators
without a renderable direct child. Confirm a matching `review.start` event
after using it.

If the same parent repeatedly reopens despite corrected child KCL, inspect its
persisted entry file. The wall's temporary direct-child composition must combine
solid and array-valued aggregates with `flatten([...])`; `clone(...)` is not
valid for heterogeneous aggregate arrays and can create an integration-caused
execution loop that looks like ordinary CAD rework.

KCL's array helpers (`flatten`, `concat`, `map`, and `reduce`) return `[any]`.
An assembly imported from a file whose final aggregate uses one of those helpers
therefore cannot be passed directly to `translate`, `rotate`, `scale`, `clone`,
or `appearance`, which require `Solid`, `[Solid; 1+]`, or `ImportedGeometry`.
Keep an already parent-framed heterogeneous child at identity, or send a local
frame correction to that child; do not let the parent retry the same `[any; N]`
transform error.

Snapshot projects at or above 160 KiB use a 240-second KCL-submit timeout and a
260-second renderer timeout. Smaller worker snapshots retain the shorter bounds,
while center snapshots retain their separate longer limits. A repeating
`isolated snapshot KCL submit timed out after 85s` on a large subassembly is a
timeout classification problem, not evidence that its geometry is blank.

Also inspect persisted rework size. Queue coalescing must split and deduplicate
the `Additional pending rework:` blocks instead of appending an already merged
instruction back into itself. Recursive growth presents as repeated reopens,
a rapidly growing `wall-state.json`, and controller RSS pressure. The runtime
caps each agent's persisted pending instruction at 256,000 characters. It also
keeps only the newest full placement request for a given orchestrator: that
request already contains the latest direct-child files and interfaces, so older
full copies are redundant.

```sh
python3 -c 'import json; s=json.load(open("logs/wall-state.json")); v=[(len(a.get("pendingWorkInstruction") or ""),a["id"]) for a in s["agents"]]; print("total",sum(n for n,_ in v),"max",max(v))'
```

When repairing an existing oversized checkpoint, stop the supervisor and
controller before rewriting it so the old browser cannot immediately restore
the oversized value. Back up the state, compact only
`pendingWorkInstruction`, then relaunch the controller from the preserved
checkpoint. Do not discard KCL, interfaces, snapshots, or agent status.

## Window and Server Verification

Verify the Python server separately:

```sh
pgrep -af wall_server.py
curl -fsS http://127.0.0.1:3000/ >/dev/null
```

Verify exactly nine physical Chrome windows:

```sh
DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  wmctrl -lG | grep 'Zoo Web View Wall'
```

Verify geometry and display discovery:

```sh
DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  xrandr --listmonitors
```

The expected wall bounds are 11520x6480 with nine 3840x2160 windows and no
desktop-panel gaps.

## Build, Deploy, and Relaunch

Validate locally:

```sh
npx tsc --noEmit
npx esbuild --bundle src/example.ts --outdir=public
npm run build
git diff --check
```

Deploy only the relevant wall artifacts:

```sh
scp public/example.js \
  user@puget-289587:/home/user/web-view-wall-static/example.js
scp scripts/wall_server.py \
  user@puget-289587:/home/user/web-view-wall-runtime/scripts/
scp scripts/relaunch_zoo_wall.py \
  user@puget-289587:/home/user/web-view-wall-runtime/scripts/
```

Restart Chrome without restarting the orchestration server:

```sh
ssh user@puget-289587 \
  'python3 /home/user/web-view-wall-runtime/scripts/relaunch_zoo_wall.py'
```

After relaunch, verify:

1. DevTools lists `wallTile=0..8`.
2. `wmctrl -lG` lists nine correctly positioned windows.
3. The center controller is connected.
4. Direct X11 captures match the intended layout.
5. Visible card counts and placeholders are coherent.
6. Chrome RSS is stable across several samples.
7. The Python server PID remains healthy.

## Completion and Perpetual Idle Verification

The controller exposes its lifecycle on the center page:

- `document.querySelector('.wall-root')?.dataset.runPhase`
- `document.querySelector('.wall-root')?.dataset.rootStatus`
- `document.querySelector('.wall-root')?.dataset.completionBlockers`

A successful run progresses through `architecting`, `running`, `finalizing`,
and `complete`. Do not call a run complete solely because the workers say
`complete`. The controller requires all of the following:

1. Every worker and sub-orchestrator has complete, renderable KCL.
2. Every direct child and explicit shared import appears in its parent assembly
   and has a visible placement expression.
3. Every renderable agent has a nonblank persisted CAD snapshot.
4. Work streams, BOM planners, reviews, placement debounce timers, render
   queues, snapshot queues, and snapshot persistence are empty.
5. The final root assembly submits successfully and produces a nonblank image.

The wall controller and all eight display pages are snapshot-only. KCL preview
jobs run in a serialized, one-job Chrome process on an isolated Xvfb display;
that process exits after returning each WebP. Chrome 149 stalls before loading
loopback HTTP pages on Puget when a normal X11 browser is launched with
`--no-sandbox`; keep Chrome's normal sandbox enabled and provide the desktop
session's XDG/DBus environment. Normal sandboxed Chrome under Xvfb is reliable.
This keeps Zoo WebRTC, video decoding, and GPU resources outside the long-lived
wall browser, so a renderer crash or leak cannot stall the orchestration event
loop. Snapshot isolation is logged as `snapshot.rendered` or
`snapshot.render_error`. Agent snapshots use the limits controlled by
`WALL_SNAPSHOT_SUBMIT_TIMEOUT` and `WALL_SNAPSHOT_RENDER_TIMEOUT`.

Large aggregate KCL projects can take longer than a part file to submit. The
disposable child renderer uses an 85-second KCL submission window while its
server request remains bounded at 100 seconds. Center-assembly snapshots use
separate 600-second submission and 660-second process limits, controlled by
`WALL_SNAPSHOT_CENTER_SUBMIT_TIMEOUT` and
`WALL_SNAPSHOT_CENTER_RENDER_TIMEOUT`. The controller request allows 780
seconds because that deadline includes time waiting for one of the bounded
server renderer lanes. This keeps malformed individual parts from occupying a
renderer lane for several minutes while allowing a large, valid root assembly
enough time to load without client disconnects, broken pipes, and duplicate
retries.

Live root projects larger than 900,000 KCL characters retain the last
successful center image instead of occupying a renderer lane on every child
update. The controller makes one full root-render attempt during finalization.
If Zoo still cannot submit that aggregate within the center limit, the complete
multi-file KCL artifact is persisted and the wall retains the last successful
assembly frame rather than retrying forever.

An empty or imports-only Zookeeper result is rejected before it can overwrite a
validated part. If a controller recovery or failed update finds an empty
current file with `lastGoodKcl`, the controller restores that KCL, interface
manifest, and persisted snapshot before redispatching the worker.

The temporary direct-child composition block is only added for aliases that do
not appear in the orchestrator body. When it is needed, it clones the existing
final aggregate together with the missing children; it must never replace or
hide the orchestrator's already placed assembly result.

Recursive BOM planning has a hierarchy safety depth but no global component
count cap. The deepest orchestrator level must delegate to physical-part
workers. This prevents malformed plans from producing an infinite chain or
exponential fan-out of sub-orchestrators. Border displays retain only agents
assigned to their own monitor; the center remains the authoritative full graph.
The layout routine must bucket cards by each agent's persisted `tileIndex`.
Re-bucketing a display-only page by its local map order hides seven out of every
eight cards in inactive monitor containers.

After the gate passes, the final persisted root snapshot remains in the center.
The complete nested KCL project and `wall-project.json` manifest
are saved under `/home/user/web-view-wall-runtime/logs/projects/`; the browser
then releases its KCL/interface maps. The controller closes the Zookeeper event
stream, render queues, watchdogs, camera timers, the supervisor, and the
aggregate-time ticker. The final graph, logs, elapsed time, and all CAD images
remain visible.

The same lifecycle transitions are written to `wall-events.jsonl` as
`kind="wall.runtime"`. Inspect the durable completion evidence with:

```sh
jq -c 'select(.kind == "wall.runtime")' \
  /home/user/web-view-wall-runtime/logs/wall-events.jsonl | tail -20
```

For a perpetual-idle check, take process samples immediately after
`runPhase=complete`, then again after 10, 30, and 60 minutes. Chrome RSS and
NVIDIA VRAM may fluctuate slightly, but they must not show monotonic growth.
There should be no new work/review/snapshot log events after the two
`run complete` and `runtime quiesced` messages.

The runtime also enforces these bounds:

- Browser reset/completion aborts run-scoped HTTP requests and closes the
  server session.
- A disconnected event stream leaves its hosted Zookeeper workers running.
  The controller reconnects with exponential backoff; only an explicit stop,
  reset, or completed run closes the server-side session.
- Per-session event queues are bounded at 2048 entries by default, with reserved
  capacity for final/error results.
- Zookeeper turns keep frame counts rather than full frame histories and cap
  retained response text at 1 MB per turn.
- `wall-events.jsonl` rotates at 32 MB with three backups, review traces retain
  the newest 200 files within 256 MB, completed projects retain the newest 24
  within 2 GB, snapshots retain the newest 256 files within 512 MB, and the
  Chrome log is truncated on each wall relaunch.

The corresponding environment controls are
`WALL_EVENT_QUEUE_MAX`, `WALL_ZOOKEEPER_TEXT_BUFFER_MAX`,
`WALL_ZOOKEEPER_WORK_TIMEOUT`, `WALL_ZOOKEEPER_WORK_IDLE_TIMEOUT`,
`WALL_ZOOKEEPER_REVIEW_TIMEOUT`, `WALL_ZOOKEEPER_REVIEW_IDLE_TIMEOUT`,
`WALL_MAX_KCL_CHARS`, `WALL_MAX_WEBSOCKET_MESSAGE_BYTES`,
`WALL_EVENT_LOG_MAX_BYTES`,
`WALL_EVENT_LOG_BACKUPS`, `WALL_TRACE_MAX_FILES`, and
`WALL_TRACE_MAX_TOTAL_BYTES`. Completed-project storage is controlled by
`WALL_PROJECT_DIR`, `WALL_PROJECT_MAX_FILES`, `WALL_PROJECT_MAX_BYTES`, and
`WALL_PROJECT_MAX_TOTAL_BYTES`. `WALL_MAX_REQUEST_BYTES` bounds the largest
JSON request the local wall server will buffer; it defaults to twice the
per-project storage limit. Snapshot retention is controlled by
`WALL_SNAPSHOT_MAX_FILES` and `WALL_SNAPSHOT_MAX_TOTAL_BYTES`.

Worker turns use separate absolute and idle limits. The defaults are 3600
seconds total and 600 seconds without a frame. Review turns default to 1200
seconds total and 600 seconds without a frame because large assembly reviews
can pause for more than five minutes after producing substantial context. The
idle limit remains the primary stalled-turn guard and still interrupts a socket
that stops producing frames. Do not lower the worker absolute limit to five or
15 minutes: doing so can discard valid work even when `lastFrameAgeMs` is near
zero.

## Symptom Checklist

| Symptom | First checks |
| --- | --- |
| SSH cannot reach Puget | Codex local-network permission, Tailscale status/ping, then SSH |
| Server responds but screens crash | Chrome GPU/RSS time series, DevTools targets, X11 captures |
| Many `Visual Queued` labels | Count only visible cards; inspect `snapshot.rendered`, `snapshot.render_error`, and persistence logs |
| `Awaiting Zookeeper result` | Check agent status/dialog before treating it as a renderer problem |
| Gray CAD image | Blank-frame log, saved WebP size/color range, assigned tile DOM |
| Center blank but graph active | Root imports/composition status, isolated snapshot logs, and saved root WebP |
| Some monitors missing | `xrandr --listmonitors`, `wmctrl -lG`, nine DevTools pages |
| Review `500`/broken pipes | Identify whether Chrome disconnected first; verify server PID and memory |
