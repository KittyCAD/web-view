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

The relauncher opens one exact 3840x2160 Chrome app window for each
`wallTile=0..8` in this layout:

```text
0 1 2
3 4 5
6 7 8
```

Tile 4 is the center orchestrator.

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

The wall validates captured frames on a downsampled canvas. A frame with an
insufficient luminance range is treated as blank, not published, and retried.

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
scp scripts/relaunch_zoo_wall.py \
  user@puget-289587:/home/user/web-view-wall-runtime/scripts/
```

Restart Chrome without restarting the orchestration server:

```sh
ssh user@puget-289587 \
  '/home/user/web-view-wall-runtime/scripts/relaunch_zoo_wall.py'
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

After the gate passes, the center live renderer is replaced by the persisted
root snapshot. The complete nested KCL project and `wall-project.json` manifest
are saved under `/home/user/web-view-wall-runtime/logs/projects/`; the browser
then releases its KCL/interface maps. The controller closes the Zookeeper event
stream, all WebRTC renderers, render watchdogs, camera timers, the supervisor,
and the aggregate-time ticker. The final graph, logs, elapsed time, and all CAD
images remain visible.

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
- A disconnected event stream cooperatively cancels its hosted Zookeeper
  workers within the WebSocket polling interval.
- Per-session event queues are bounded at 256 entries by default, with reserved
  capacity for final/error results.
- Zookeeper turns keep frame counts rather than full frame histories and cap
  retained response text at 1 MB per turn.
- `wall-events.jsonl` rotates at 32 MB with three backups, review traces retain
  the newest 200 files within 256 MB, completed projects retain the newest 24
  within 2 GB, snapshots retain the newest 256 files within 512 MB, and the
  Chrome log is truncated on each wall relaunch.

The corresponding environment controls are
`WALL_EVENT_QUEUE_MAX`, `WALL_ZOOKEEPER_TEXT_BUFFER_MAX`,
`WALL_MAX_KCL_CHARS`, `WALL_MAX_WEBSOCKET_MESSAGE_BYTES`,
`WALL_EVENT_LOG_MAX_BYTES`,
`WALL_EVENT_LOG_BACKUPS`, `WALL_TRACE_MAX_FILES`, and
`WALL_TRACE_MAX_TOTAL_BYTES`. Completed-project storage is controlled by
`WALL_PROJECT_DIR`, `WALL_PROJECT_MAX_FILES`, `WALL_PROJECT_MAX_BYTES`, and
`WALL_PROJECT_MAX_TOTAL_BYTES`. `WALL_MAX_REQUEST_BYTES` bounds the largest
JSON request the local wall server will buffer; it defaults to twice the
per-project storage limit. Snapshot retention is controlled by
`WALL_SNAPSHOT_MAX_FILES` and `WALL_SNAPSHOT_MAX_TOTAL_BYTES`.

## Symptom Checklist

| Symptom | First checks |
| --- | --- |
| SSH cannot reach Puget | Codex local-network permission, Tailscale status/ping, then SSH |
| Server responds but screens crash | Chrome GPU/RSS time series, DevTools targets, X11 captures |
| Many `Visual Queued` labels | Count only visible cards; inspect snapshot renderer and persistence logs |
| `Awaiting Zookeeper result` | Check agent status/dialog before treating it as a renderer problem |
| Gray CAD image | Blank-frame log, saved WebP size/color range, assigned tile DOM |
| Center blank but graph active | Root imports/composition status and center renderer reconnect log |
| Some monitors missing | `xrandr --listmonitors`, `wmctrl -lG`, nine DevTools pages |
| Review `500`/broken pipes | Identify whether Chrome disconnected first; verify server PID and memory |
