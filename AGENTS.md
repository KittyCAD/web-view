# Wall Run Instructions

These instructions apply only to the Zoo Web View Wall multi-agent runs.

- Read `docs/puget-wall-debugging.md` before diagnosing Puget connectivity,
  monitor layout, renderer memory, blank snapshots, or `Visual Queued` states.
  Check the Codex app's macOS Local Network permission when Puget unexpectedly
  becomes unreachable. Use DevTools `Runtime.evaluate` for DOM state and direct
  X11/PIL monitor captures for visuals; do not repeatedly use CDP
  `Page.captureScreenshot` on the nine 4K pages because its capture surfaces can
  distort Chrome GPU-memory diagnostics.
- Do not model screw/fastener threads, helical thread geometry, or cosmetic
  thread grooves unless the user's wall-run prompt explicitly asks for threads.
  Use simplified cylindrical shafts, holes, and fastener bodies by default.
- If a fastener, nut, or threaded hole needs to communicate thread intent,
  describe the nominal thread in the interface notes instead of generating
  detailed thread geometry.
- Treat the reusable component library as a BOM/catalog registry only. Do not
  visualize it as a placed assembly and do not spend Zookeeper work arranging
  all reusable parts together. Render reusable components individually, and let
  consuming orchestrators import and place those shared component files.
- Repetition, symmetry, mirroring, and arrays belong in orchestrator assembly
  files, not worker part files. Workers should model one canonical left/right or
  reusable physical part unless the part must be handed/chiral; orchestrators
  should clone and place copies using explicit translate/rotate/scale transforms,
  including bilateral mirrors, radial bolt circles, and linear patterns.
- For patterned or mirrored placements, orchestrators must document the pattern
  source, count, spacing/angle, mirror plane or symmetry axis, and target mate
  points in the assembly interface/BOM comments so reviewers can reason about
  placement without visually guessing.
- For moderately complex assemblies, prefer a real hierarchy:
  root orchestrator -> top-level sub-assembly orchestrators -> leaf
  sub-assembly orchestrators -> individual part workers. Direct part workers
  should live under leaf orchestrators, not under broad top-level assemblies.
- Keep each leaf sub-assembly narrow enough that its renderer shows a focused
  subsystem. Broad orchestrators may import their child sub-assemblies for an
  assembly view, but workers should not blend unrelated neighboring parts into
  their own KCL files.
- Every orchestrator/sub-assembly KCL file must return a renderable aggregate
  as its final expression. Parent assemblies should place that aggregate, not
  reach through and place the sub-assembly's child part files directly.
- If a sub-assembly import evaluates to no return value or `none`, repair that
  sub-assembly file so it returns an aggregate. Do not work around it by adding
  grandchild imports to the parent assembly.
- A wall run is complete only when every agent is complete, every parent
  assembly composes all direct children, every renderable agent has a persisted
  nonblank snapshot, the final root render succeeds, and all work/review/render
  queues are empty. Once complete, keep the final static wall visible and stop
  all WebRTC sessions, event streams, watchdogs, supervisors, and timers.
