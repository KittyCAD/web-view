import * as zoo from '@kittycad/lib'
import { ZooWebView } from '.'

declare global {
  interface Window {
    ZOO_API_TOKEN?: string
  }
}

type Size = {
  width: number,
  height: number,
}

type AgentKind = 'orchestrator' | 'worker'
type AgentStatus = 'queued' | 'starting' | 'running' | 'reviewing' | 'complete' | 'error'
type SnapshotState = 'queued' | 'rendering' | 'persisting' | 'ready' | 'error'
type RunPhase = 'idle' | 'architecting' | 'running' | 'finalizing' | 'complete'

type Agent = {
  id: string,
  parentId: string,
  kind: AgentKind,
  scope?: 'assembly' | 'part' | 'shared_part',
  name: string,
  role: string,
  instruction: string,
  color: string,
  status: AgentStatus,
  filePath: string,
  imports?: string[],
  source: 'openai' | 'fallback',
  element?: HTMLElement,
  graphElement?: HTMLElement,
  logElement?: HTMLElement,
  statusElement?: HTMLElement,
  viewerSlot?: HTMLElement,
  viewPlaceholder?: HTMLElement,
  view?: ZooWebView,
  viewStarted?: boolean,
  viewerQueuedLogged?: boolean,
  viewerReloadTimer?: number,
  viewerReloadAttempts?: number,
  viewerHealthTimer?: number,
  snapshotUrl?: string,
  snapshotObjectUrl?: string,
  snapshotLoadId?: number,
  snapshotState?: SnapshotState,
  snapshotMessage?: string,
  snapshotRecoveryCount?: number,
  lastSnapshotRecoveryAtMs?: number,
  lastGoodKcl?: string,
  lastGoodSnapshotUrl?: string,
  reviewRounds?: number,
  activeStartedAtMs?: number,
  elapsedMs?: number,
  lastActivityAtMs?: number,
  supervisorRecoveryCount?: number,
  lastSupervisorRecoveryAtMs?: number,
}

type AgentSeed = Pick<Agent, 'id' | 'parentId' | 'kind' | 'scope' | 'name' | 'role' | 'instruction' | 'filePath' | 'imports' | 'source'>

type RenderProject = {
  files: Map<string, string>,
  mainFilePath: string,
}

type OrchestrationResponse = {
  sessionId: string,
  source: 'openai' | 'fallback',
  prompt: string,
  root: {
    instruction: string,
    filePath: string,
  },
  agents: AgentSeed[],
  files: Record<string, string>,
  notes?: string[],
}

type OrchestrationStreamEvent = {
  type: 'started' | 'status' | 'dialog' | 'bom',
  message: string,
} | {
  type: 'final',
  plan: OrchestrationResponse,
} | {
  type: 'error',
  summary: string,
}

type AgentWorkResponse = {
  source: 'zookeeper' | 'fallback',
  summary: string,
  kcl: string,
  dialog?: string[],
  frames?: number,
  drafts?: number,
  mode?: string,
  streamed?: boolean,
}

type AgentBomChildSeed = {
  key: string,
  kind: AgentKind,
  scope: 'assembly' | 'part' | 'shared_part',
  role: string,
  instruction: string,
  imports?: string[],
}

type AgentBomResponse = {
  source: 'zookeeper' | 'openai_fallback' | 'fallback',
  summary: string,
  children: AgentBomChildSeed[],
  dialog?: string[],
  frames?: number,
  mode?: string,
  streamed?: boolean,
}

type AgentStreamResponse = AgentWorkResponse | AgentBomResponse

type AgentWorkStreamEvent = {
  type: 'dialog',
  workId?: string,
  line: string,
} | {
  type: 'draft',
  workId?: string,
  draftIndex: number,
  kcl: string,
  summary?: string,
} | {
  type: 'final',
  workId?: string,
  update: AgentStreamResponse,
} | {
  type: 'started' | 'ping',
  workId?: string,
} | {
  type: 'error',
  workId?: string,
  summary: string,
} | {
  type: 'review-queued' | 'review-started',
  workId?: string,
} | {
  type: 'review-dialog',
  workId?: string,
  line: string,
} | {
  type: 'review-final',
  workId?: string,
  review: AgentReviewResponse,
} | {
  type: 'review-error',
  workId?: string,
  summary: string,
}

type AgentWorkWaiter = {
  agent: Agent,
  currentRun: number,
  workRevision?: number,
  resolve: (update: AgentStreamResponse) => void,
  reject: (error: Error) => void,
}

type AgentWorkQueueWaiter = {
  resolve: () => void,
  reject: (error: Error) => void,
}

type AgentWorkQueueRequest = {
  agent: Agent,
  currentRun: number,
  renderError: string,
  repairAttempt: number,
  reviewInstruction: string,
  zooRetryAttempt: number,
  workRevision: number,
  waiters: AgentWorkQueueWaiter[],
}

type ReviewWaiter = {
  parent: Agent,
  currentRun: number,
  resolve: (review: AgentReviewResponse) => void,
  reject: (error: Error) => void,
}

type QueuedReview = {
  parent: Agent,
  changedChild: Agent,
  currentRun: number,
  revision: string,
}

type ReworkRequest = {
  target: string,
  reason: string,
  instruction: string,
}

type BomSharedComponentRequest = {
  role: string,
  reason: string,
  instruction: string,
  consumers: string[],
}

type BomImportRequest = {
  component: string,
  consumer: string,
  reason: string,
}

type BomReviewResponse = {
  sharedComponents?: BomSharedComponentRequest[],
  importUpdates?: BomImportRequest[],
}

type AgentReviewResponse = {
  source: 'zookeeper' | 'fallback',
  summary: string,
  rework: ReworkRequest[],
  bom?: BomReviewResponse,
  dialog?: string[],
  frames?: number,
  mode?: string,
}

type RenderResult = {
  ok: boolean,
  message?: string,
}

type SnapshotJob = {
  agentId: string,
  currentRun: number,
  project: RenderProject,
  label: string,
  kind: 'draft' | 'final',
  attempt: number,
  sourceKcl: string,
}

type SnapshotPersistenceJob = {
  agentId: string,
  currentRun: number,
  dataUrl: string,
  sourceKcl: string,
}

type CenterRenderWaiter = {
  resolve: () => void,
  reject: (error: Error) => void,
}

type CenterRenderRequest = {
  project: RenderProject,
  label: string,
  waiters: CenterRenderWaiter[],
}

type RankedAgent = {
  candidate: Agent,
  score: number,
}

type GraphEdge = {
  from: string,
  to: string,
  kind: 'child' | 'import',
}

type BomUsage = {
  agent: Agent,
  quantity: number,
}

type WallBroadcastMessage = {
  type: 'reset',
} | {
  type: 'run:complete',
} | {
  type: 'plan',
  sessionId: string,
  source: 'openai' | 'fallback',
  rootInstruction: string,
  plannedAgentCount: number,
  files: Record<string, string>,
} | {
  type: 'agent:add',
  agent: AgentSeed & Pick<Agent, 'color' | 'status'>,
} | {
  type: 'agent:update',
  agentId: string,
  parentId?: string,
  imports?: string[],
  instruction?: string,
  role?: string,
} | {
  type: 'project:file',
  filePath: string,
  kcl: string,
} | {
  type: 'agent:status',
  agentId: string,
  status: AgentStatus,
} | {
  type: 'agent:log',
  agentId: string,
  line: string,
  direction: 'in' | 'out' | 'sys',
} | {
  type: 'root:log',
  line: string,
  direction: 'in' | 'out' | 'sys',
} | {
  type: 'agent:draft',
  agentId: string,
  kcl: string,
  draftIndex: number,
} | {
  type: 'agent:final',
  agentId: string,
  kcl: string,
  manifest?: string,
} | {
  type: 'agent:snapshot',
  agentId: string,
  snapshotUrl: string,
} | {
  type: 'agent:snapshot-status',
  agentId: string,
  state: SnapshotState,
  message?: string,
}

const rows = 3
const cols = 3
const centerIndex = 4
const rootAgentId = 'zookeeper-orchestrator-root'
const perimeterOrder = [0, 1, 2, 5, 8, 7, 6, 3]
const maxWallAgents = 48
const maxLiveAgentViews = 24
const maxAgentRepairAttempts = 2
const maxZooFallbackRetries = 3
const zooFallbackRetryBackoffMs = 2200
const maxConcurrentReviews = 2
const maxViewerReloadAttempts = 5
const supervisorSweepIntervalMs = 15000
const supervisorSummaryIntervalMs = 60000
const supervisorQueuedWakeMs = 45000
const supervisorRecoveryCooldownMs = 20000
const snapshotRecoveryCooldownMs = 15000
const snapshotRetriesBeforeKclRepair = 2
const runCompletionSettleMs = 5000
const runCompletionRetryMs = 3000
const viewerHealthPollMs = 10000
const viewerStalledReloadMs = 45000
const useAgentCadSnapshots = true
const snapshotViewerSize: Size = { width: 1280, height: 720 }
const maxQueuedDraftSnapshots = 4
const snapshotFrameWaitMs = 900
const snapshotSubmitTimeoutMs = 35000
const snapshotCaptureTimeoutMs = 12000
const snapshotPersistTimeoutMs = 120000
const snapshotImageFetchTimeoutMs = 30000
const snapshotDisposeTimeoutMs = 5000
const maxSnapshotSubmissionsPerRenderer = 4
const centerRendererSubmitTimeoutMs = 90000
const maxCenterSubmissionsPerRenderer = 6
const maxRootDraftVisualizations = 1
const defaultPrompt = 'A terminator robot endoskeleton display assembly. Build a metallic humanoid inspection robot with roughly 28-40 concrete parts organized through nested sub-orchestrators: skull/head, neck/spine, ribcage/torso, pelvis/hips, left arm, right arm, left leg, right leg, hands/feet, exposed actuator links, and cable routing. Workers should each own one physical part file, not a set: individual skull plate, eye lens, jaw link, vertebra, rib hoop, shoulder yoke, upper-arm bone, forearm piston, finger segment, hip bracket, thigh strut, shin strut, foot plate, etc. Use shared reusable components for repeated hardware such as bolts, pins, bushings, bearings, washers, spacers, cable clips, and small actuator clevises; model each reusable component once and have orchestrators clone/place the required counts. For mirrored limbs, paired brackets, repeated ribs, bolt circles, and other arrays, create one canonical part when possible and have orchestrators apply the mirrored, radial, or linear placement transforms with BOM comments. Every sub-orchestrator should place only direct child/subassembly imports and explicit shared reusable imports, add BOM comments for reused parts, align by named mate points/local axes/dimensions, and return one renderable aggregate so parent assemblies can place it. Avoid weapons; focus on the mechanical robot body, exposed structure, and assembled presentation.'
const rootFilePath = 'main.kcl'
const interfaceBlockStart = 'ZOOKEEPER_INTERFACE'
const interfaceBlockEnd = '/ZOOKEEPER_INTERFACE'
const wallParams = new URLSearchParams(window.location.search)
const requestedWallTile = Number(wallParams.get('wallTile'))
const wallTileIndex = Number.isInteger(requestedWallTile) && requestedWallTile >= 0 && requestedWallTile < rows * cols
  ? requestedWallTile
  : undefined
const isWallTileMode = wallTileIndex !== undefined
const isControllerWindow = !isWallTileMode || wallTileIndex === centerIndex
const shouldRenderAgentViews = !isWallTileMode || !isControllerWindow
const wallBroadcastChannelName = 'zookeeper-wall-v1'

const agentColors = [
  '#00A3FF',
  '#FF4F8B',
  '#F5C542',
  '#44D07B',
  '#C084FC',
  '#FF8A3D',
  '#2DD4BF',
  '#94A3B8',
  '#F97316',
  '#22C55E',
  '#38BDF8',
  '#E879F9',
]

const installWorkerWebSocketSendQueuePatch = () => {
  const nativeWorker = window.Worker
  window.Worker = class WorkerWithZooWebSocketQueue extends nativeWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      const scriptUrlString = scriptURL.toString()
      if (!scriptUrlString.startsWith('blob:')) {
        super(scriptURL, options)
        return
      }

      const request = new XMLHttpRequest()
      request.open('GET', scriptUrlString, false)
      request.send()

      let source = request.responseText
      if (
        source.includes('new WebSocket(yn.urlConstructFrom') &&
        source.includes('case"websocket":return void dr?.[t.payload.type](...t.payload.data);')
      ) {
        source = source
          .replace(
            'async e=>{await fetch(new URL("/kcl_wasm_lib_bg.wasm",location.origin))',
            'async e=>{postMessage({from:"debug",payload:{status:"worker-start",origin:location.origin}});await fetch(new URL("/kcl_wasm_lib_bg.wasm",location.origin))',
          )
          .replace(
            'then((e=>hr({module_or_path:e}))),dr=new WebSocket',
            'then((e=>hr({module_or_path:e}))),postMessage({from:"debug",payload:{status:"wasm-ready"}}),dr=new WebSocket',
          )
          .replace(
            'dr=new WebSocket(yn.urlConstructFrom({webrtc:!0,...e})),dr.addEventListener("open"',
            'dr=new WebSocket(yn.urlConstructFrom({webrtc:!0,...e})),postMessage({from:"debug",payload:{status:"ws-created",url:String(yn.urlConstructFrom({webrtc:!0,...e}))}}),dr.addEventListener("open"',
          )
          .replace(
            'let dr;const wr=',
            'let dr;const _zooWsQueue=[];const _zooFlushWs=()=>{if(dr?.readyState!==WebSocket.OPEN)return;for(const e of _zooWsQueue.splice(0))dr[e.type](...e.data)};const wr=',
          )
          .replace(
            'dr.addEventListener("open",(()=>{yn.authenticate({client:e.client},dr)}),{once:!0})',
            'dr.addEventListener("open",(()=>{postMessage({from:"debug",payload:{status:"ws-open"}}),yn.authenticate({client:e.client},dr),_zooFlushWs()}),{once:!0})',
          )
          .replace(
            'dr.addEventListener("message",(e=>{postMessage({from:"websocket",payload:{type:"message",data:e.data}})}))',
            'dr.addEventListener("message",(e=>{postMessage({from:"debug",payload:{status:"ws-message"}}),postMessage({from:"websocket",payload:{type:"message",data:e.data}})})),dr.addEventListener("error",(()=>{postMessage({from:"debug",payload:{status:"ws-error"}})})),dr.addEventListener("close",(e=>{postMessage({from:"debug",payload:{status:`ws-close ${e.code} ${e.reason||\"\"}`}})}))',
          )
          .replace(
            'case"websocket":return void dr?.[t.payload.type](...t.payload.data);',
            'case"websocket":return void (dr?.readyState===WebSocket.OPEN?dr[t.payload.type](...t.payload.data):_zooWsQueue.push(t.payload));',
          )
      }

      const patchedUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
      super(patchedUrl, options)
      URL.revokeObjectURL(patchedUrl)
    }
  } as typeof Worker
}

const tileSize = (): Size => ({
  width: isWallTileMode ? window.innerWidth : window.innerWidth / cols,
  height: isWallTileMode ? window.innerHeight : window.innerHeight / rows,
})

const paneViewerSize = (agentCount = 1): Size => {
  const size = tileSize()
  const maxAgentsPerMonitor = Math.max(1, Math.ceil(agentCount / perimeterOrder.length))
  const columns = maxAgentsPerMonitor <= 1 ? 1 : Math.ceil(Math.sqrt(maxAgentsPerMonitor))
  const rows = Math.ceil(maxAgentsPerMonitor / columns)
  return {
    width: Math.min(1280, Math.max(480, Math.floor(size.width / columns))),
    height: Math.min(720, Math.max(270, Math.floor(size.height / rows))),
  }
}

const rootViewerSize = (): Size => {
  const size = tileSize()
  return {
    width: Math.floor(size.width),
    height: Math.floor(size.height),
  }
}

const errorToMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return String(error)
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => (
  new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.ceil(timeoutMs / 1000)}s`)), timeoutMs)
    void promise.then(
      value => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      error => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
)

const httpErrorFromResponse = async (response: Response, label: string) => {
  let bodyText = ''
  try {
    bodyText = await response.text()
  } catch {
    bodyText = ''
  }
  let detail = bodyText.trim()
  let errorId = ''
  try {
    const payload = JSON.parse(bodyText) as { error?: unknown, errorId?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      detail = payload.error.trim()
    }
    if (typeof payload.errorId === 'string' && payload.errorId.trim().length > 0) {
      errorId = ` id=${payload.errorId.trim()}`
    }
  } catch {
    // Keep the raw body text if the server did not return JSON.
  }
  return new Error(`${label} ${response.status}${errorId}${detail ? `: ${detail.slice(0, 700)}` : ''}`)
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const isRetryableZooFallback = (update: AgentWorkResponse) => (
  update.source === 'fallback' &&
  /\b(websocket closed|closed while reading frame|timed out|timeout|without an EditKclCode output|socket|connection reset|connection closed)\b/i
    .test(update.summary)
)

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

const titleCase = (value: string) => value
  .replace(/\w\S*/g, word => word[0]!.toUpperCase() + word.slice(1))

const slugLabel = (value: string) => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'component'
)

const sequenceFromId = (id: string) => id.match(/(\d{4})$/)?.[1]

const graphPrimaryLabel = (agent: Agent) => {
  if (agent.id === rootAgentId) return 'Zookeeper Orchestrator'
  return titleCase(agent.role)
}

const graphSecondaryLabel = (agent: Agent) => {
  if (agent.id === rootAgentId) return ''
  const sequence = sequenceFromId(agent.id)
  const agentLabel = agent.kind === 'orchestrator' ? 'Sub-Orchestrator' : 'Worker'
  return `${agentLabel}${sequence === undefined ? '' : ` ${sequence}`} / ${agent.status}`
}

const truncateLabel = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

const greatestCommonDivisor = (left: number, right: number): number => {
  if (right === 0) return left
  return greatestCommonDivisor(right, left % right)
}

const leastCommonMultiple = (left: number, right: number) => {
  if (left === 0 || right === 0) return Math.max(left, right)
  return Math.abs(left * right) / greatestCommonDivisor(left, right)
}

const columnItemCounts = (layoutCount: number, columnCount: number) => {
  if (layoutCount === 0) return Array.from({ length: columnCount }, () => 0)
  const fullColumnCount = Math.floor(layoutCount / columnCount)
  const remainder = layoutCount % columnCount
  return Array.from({ length: columnCount }, (_, columnIndex) => (
    fullColumnCount + (columnIndex < remainder ? 1 : 0)
  ))
}

const randomId = () => {
  if (window.crypto?.randomUUID !== undefined) return window.crypto.randomUUID()
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`
}

const sendInitialCameraCommands = (webView: ZooWebView) => {
  webView.rtc?.send(JSON.stringify({
    type: 'modeling_cmd_batch_req',
    requests: [
      {
        cmd: {
          type: 'edge_lines_visible',
          hidden: false,
        },
        cmd_id: '00000000-0000-0000-0000-000000000000',
      },
      {
        // Keep persisted agent snapshots consistently isometric. The fit command
        // that follows preserves this orientation while framing each KCL result.
        cmd: {
          type: 'default_camera_look_at',
          center: { x: 0, y: 0, z: 0 },
          sequence: 1,
          up: { x: 0, y: 0, z: 1 },
          vantage: { x: 9, y: -9, z: 9 },
        },
        cmd_id: randomId(),
      },
      {
        cmd: {
          type: 'zoom_to_fit',
          object_ids: [],
          padding: 0,
        },
        cmd_id: '00000000-0000-0000-0000-000000000000',
      },
    ],
    batch_id: '00000000-0000-0000-0000-000000000000',
    responses: true,
  }))
}

const sendInspectionCameraCommand = (webView: ZooWebView, agentIndex: number, step: number) => {
  if (webView.rtc === undefined) return

  const angle = step * 0.82 + agentIndex * 0.47
  const radius = 6.2 + (agentIndex % 5) * 0.35
  const z = 2.6 + (step % 4) * 0.24 + (agentIndex % 3) * 0.18
  const request = webView.rtc.send(JSON.stringify({
    type: 'modeling_cmd_batch_req',
    requests: [
      {
        cmd: {
          type: 'default_camera_look_at',
          center: { x: 0, y: 0, z: 0.85 },
          sequence: step,
          up: { x: 0, y: 0, z: 1 },
          vantage: {
            x: Number((Math.cos(angle) * radius).toFixed(4)),
            y: Number((Math.sin(angle) * radius).toFixed(4)),
            z: Number(z.toFixed(4)),
          },
        },
        cmd_id: randomId(),
      },
      {
        cmd: {
          type: 'zoom_to_fit',
          object_ids: [],
          padding: 0,
        },
        cmd_id: randomId(),
      },
    ],
    batch_id: randomId(),
    responses: true,
  }))
  void request.catch(() => {})
}

const sendRootCameraCommand = (webView: ZooWebView) => {
  if (webView.rtc === undefined) return
  const request = webView.rtc.send(JSON.stringify({
    type: 'modeling_cmd_batch_req',
    requests: [
      {
        cmd: {
          type: 'default_camera_look_at',
          center: { x: 0, y: 0, z: 1.1 },
          sequence: 1,
          up: { x: 0, y: 0, z: 1 },
          vantage: { x: 10.5, y: -11.5, z: 6.4 },
        },
        cmd_id: randomId(),
      },
      {
        cmd: {
          type: 'zoom_to_fit',
          object_ids: [],
          padding: 0,
        },
        cmd_id: randomId(),
      },
    ],
    batch_id: randomId(),
    responses: true,
  }))
  void request.catch(() => {})
}

const createWorkerProject = (index: number, color: string) => {
  const width = 1.6 + (index % 4) * 0.34
  const height = 1.2 + (index % 3) * 0.28
  const length = 1.1 + index * 0.18

  return `
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [${-width / 2}, ${-height / 2}])
  |> line(end = [${width}, 0])
  |> line(end = [0, ${height}])
  |> line(end = [${-width}, 0])
  |> close()
extrude001 = extrude(profile001, length = ${length})
  |> appearance(color="${color}")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [${-width / 4}, ${height / 3}])
  |> line(end = [${width / 2}, 0])
  |> line(end = [0, ${height / 5}])
  |> line(end = [${-width / 2}, 0])
  |> close()
extrude002 = extrude(profile002, length = ${length + 0.35})
  |> appearance(color="#FFFFFF")
`
}

const createSubAssemblyProject = (index: number, color: string) => {
  const offset = 1.2 + index * 0.14
  return `
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [-2.6, -1.4])
  |> line(end = [5.2, 0])
  |> line(end = [0, 2.8])
  |> line(end = [-5.2, 0])
  |> close()
extrude001 = extrude(profile001, length = 0.6)
  |> appearance(color="${color}")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [${-offset}, -0.75])
  |> line(end = [0.9, 0])
  |> line(end = [0, 1.5])
  |> line(end = [-0.9, 0])
  |> close()
extrude002 = extrude(profile002, length = ${1.5 + index * 0.25})
  |> appearance(color="#F8FAFC")

sketch003 = startSketchOn(XY)
profile003 = startProfile(sketch003, at = [${offset - 0.9}, -0.75])
  |> line(end = [0.9, 0])
  |> line(end = [0, 1.5])
  |> line(end = [-0.9, 0])
  |> close()
extrude003 = extrude(profile003, length = ${1.2 + index * 0.2})
  |> appearance(color="${color}")
`
}

const createRootAssemblyProject = () => {
  return `
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [-4.4, -2.1])
  |> line(end = [8.8, 0])
  |> line(end = [0, 4.2])
  |> line(end = [-8.8, 0])
  |> close()
extrude001 = extrude(profile001, length = 0.5)
  |> appearance(color="#F8FAFC")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [-3.5, -1.25])
  |> line(end = [1.15, 0])
  |> line(end = [0, 2.5])
  |> line(end = [-1.15, 0])
  |> close()
extrude002 = extrude(profile002, length = 2.3)
  |> appearance(color="#00A3FF")

sketch003 = startSketchOn(XY)
profile003 = startProfile(sketch003, at = [-0.55, -1.35])
  |> line(end = [1.1, 0])
  |> line(end = [0, 2.7])
  |> line(end = [-1.1, 0])
  |> close()
extrude003 = extrude(profile003, length = 3.4)
  |> appearance(color="#44D07B")

sketch004 = startSketchOn(XY)
profile004 = startProfile(sketch004, at = [2.35, -1.05])
  |> line(end = [1.3, 0])
  |> line(end = [0, 2.1])
  |> line(end = [-1.3, 0])
  |> close()
extrude004 = extrude(profile004, length = 2.8)
  |> appearance(color="#FF4F8B")
`
}

const aliasForFilePath = (filePath: string) => {
  const basename = filePath.replace(/\.kcl$/i, '').split('/').pop() ?? 'part'
  const words = basename.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'part'
  const alias = `${words[0]!.toLowerCase()}${words.slice(1).map(word => `${word[0]!.toUpperCase()}${word.slice(1)}`).join('')}`
  return /^\d/.test(alias) ? `part${alias}` : alias
}

const renderPathForFilePath = (filePath: string) => (
  filePath === rootFilePath ? rootFilePath : (filePath.split('/').pop() ?? filePath)
)

const mainFileFor = (filePaths: string[]) => (
  `${filePaths.map(filePath => `import "${renderPathForFilePath(filePath)}" as ${aliasForFilePath(filePath)}`).join('\n')}\n`
)

const objectFromMap = (files: Map<string, string>) => (
  Object.fromEntries(files.entries()) as Record<string, string>
)

const stripImportLines = (source: string) => source
  .split('\n')
  .filter(line => !line.trim().startsWith('import '))
  .join('\n')

const directAssemblyBlockStart = '// ZOOKEEPER_WALL_DIRECT_CHILDREN_START'
const directAssemblyBlockEnd = '// ZOOKEEPER_WALL_DIRECT_CHILDREN_END'

const stripDirectAssemblyBlock = (source: string) => {
  const start = source.indexOf(directAssemblyBlockStart)
  if (start < 0) return source
  const end = source.indexOf(directAssemblyBlockEnd, start)
  if (end < 0) return source.slice(0, start)
  return `${source.slice(0, start)}${source.slice(end + directAssemblyBlockEnd.length)}`
}

const cleanInterfaceLine = (line: string) => line
  .replace(/^\s*\/\/\s?/, '')
  .replace(/^\s*#\s?/, '')
  .trim()

const extractInterfaceManifest = (source: string) => {
  const lines = source.split('\n')
  const startIndex = lines.findIndex(line => line.includes(interfaceBlockStart) && !line.includes(interfaceBlockEnd))
  if (startIndex === -1) return ''
  const endIndex = lines.findIndex((line, index) => index > startIndex && line.includes(interfaceBlockEnd))
  const rawLines = lines
    .slice(startIndex + 1, endIndex === -1 ? Math.min(lines.length, startIndex + 18) : endIndex)
    .map(cleanInterfaceLine)
    .filter(Boolean)
  return rawLines.join('\n').slice(0, 1800)
}

const fallbackInterfaceManifest = (agent: Agent) => [
  'interface: missing',
  `role: ${agent.role}`,
  'placement_warning: inspect the child KCL before choosing axes, distances, or mate points.',
].join('\n')

const namespaceForFile = (filePath: string, index: number) => (
  `f${index}_${filePath.replace(/[^A-Za-z0-9_]/g, '_')}`
)

const namespaceKcl = (source: string, namespace: string) => {
  const body = stripImportLines(source)
  const declarations = Array.from(body.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/gm))
    .map(match => match[1]!)
  return declarations.reduce((next, identifier) => (
    next.replace(new RegExp(`\\b${identifier}\\b`, 'g'), `${namespace}_${identifier}`)
  ), body)
}

const createZooClient = () => {
  const zooApiToken = window.ZOO_API_TOKEN ?? window.localStorage.getItem('ZOO_API_TOKEN') ?? undefined
  const zooClient = zooApiToken === undefined
    ? new zoo.Client({
      baseUrl: 'https://api.zoo.dev',
      clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      redirectUrl: 'http://localhost:3000',
      scopes: ['modeling'],
    })
    : new zoo.Client({
      token: zooApiToken,
      baseUrl: 'https://api.zoo.dev',
    })

  if (zooApiToken === undefined) {
    void zooClient.isReturningFromAuthServer()
      .then(async (hasAuthCode) => {
        if (!hasAuthCode) return
        const data = await zooClient.getAccessToken()
        if (data?.token?.value === undefined) return
        zooClient.token = data.token.value
      })
  }

  return zooClient
}

document.addEventListener('DOMContentLoaded', () => {
  installWorkerWebSocketSendQueuePatch()

  const zooClient = createZooClient()
  const wallChannel = typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel(wallBroadcastChannelName)
  const root = document.createElement('main')
  root.classList.add('wall-root')
  if (isWallTileMode) {
    document.title = `Zoo Web View Wall ${wallTileIndex}`
    document.body.classList.add('wall-tile-mode')
    root.classList.add('wall-root-tile-mode')
    root.dataset.wallTile = String(wallTileIndex)
  }
  if (!isControllerWindow) {
    document.body.classList.add('wall-display-only')
  }
  document.body.append(root)

  // One off-screen Zoo view turns KCL updates into images for every border tile.
  // Keeping this serial prevents a many-agent run from allocating many engines.
  const snapshotCaptureHost = document.createElement('div')
  snapshotCaptureHost.classList.add('snapshot-capture-host')
  if (isControllerWindow && useAgentCadSnapshots) document.body.append(snapshotCaptureHost)

  const monitorElements = new Map<number, HTMLElement>()
  const agents = new Map<string, Agent>()
  const timers = new Set<number>()
  const cameraTimers = new Set<number>()
  const reviewTimers = new Map<string, number>()
  const placementTimers = new Map<string, number>()
  const draftRenderChains = new Map<string, Promise<void>>()
  const agentWorkRevisions = new Map<string, number>()
  const activeAgentWorkIds = new Set<string>()
  const pendingAgentWorkRequests = new Map<string, AgentWorkQueueRequest>()
  const snapshotJobs = new Map<string, SnapshotJob>()
  const workWaiters = new Map<string, AgentWorkWaiter>()
  const reviewWaiters = new Map<string, ReviewWaiter>()
  const reviewQueue = new Map<string, QueuedReview>()
  const activeReviewRevisions = new Map<string, string>()
  const completedReviewRevisions = new Map<string, string>()
  const bomPlanningAgentIds = new Set<string>()
  const activeReviewRequests = new Set<string>()
  const supervisorReviewAtMs = new Map<string, number>()
  let workEventAbort: AbortController | undefined
  let runRequestAbort: AbortController | undefined
  let rootRenderTimer: number | undefined
  let graphRenderTimer: number | undefined
  let layoutTimer: number | undefined
  let aggregateTimeTimer: number | undefined
  let supervisorTimer: number | undefined
  let supervisorLastSummaryAtMs = 0
  let workEventSessionId = ''
  let runId = 0
  let startInProgress = false
  let active = false
  let runPhase: RunPhase = 'idle'
  let rootStatus: AgentStatus = 'queued'
  let completionCheckTimer: number | undefined
  let completionCandidateAtMs: number | undefined
  let finalizationPromise: Promise<void> | undefined
  let plannedAgentCount = 0
  let activeSessionId = ''
  let rootActiveStartedAtMs: number | undefined
  let rootElapsedMs = 0
  let activeSource: 'openai' | 'fallback' = 'fallback'
  let rootReviewRounds = 0
  let rootInstruction = 'Coordinate the complete assembly and merge child KCL into the root view.'
  let kclFiles = new Map<string, string>()
  let interfaceManifests = new Map<string, string>()
  let rootImports = new Set<string>()
  let snapshotView: ZooWebView | undefined
  let snapshotViewStarting: Promise<ZooWebView> | undefined
  let snapshotViewDisposing: Promise<void> | undefined
  let snapshotViewSubmissionCount = 0
  let snapshotDrainPromise: Promise<void> | undefined
  const snapshotPersistenceJobs = new Map<string, SnapshotPersistenceJob>()
  let snapshotPersistenceDrainPromise: Promise<void> | undefined
  const snapshotCanvas = document.createElement('canvas')
  const snapshotValidationCanvas = document.createElement('canvas')
  snapshotValidationCanvas.width = 64
  snapshotValidationCanvas.height = 36
  let capacityWarningRun = -1

  const broadcastWall = (message: WallBroadcastMessage) => {
    if (!isControllerWindow) return
    wallChannel?.postMessage(message)
  }

  const centerTile = document.createElement('section')
  centerTile.classList.add('wall-tile', 'orchestrator-tile')

  const createCenterView = () => {
    const view = new ZooWebView({
      zooClient,
      size: rootViewerSize(),
      allowConcurrentViews: true,
      showStartLogo: true,
    })
    view.el.classList.add('wall-view', 'orchestrator-view')
    return view
  }

  let centerView = createCenterView()
  let centerViewerReloadTimer: number | undefined
  let centerViewerReloadAttempts = 0
  let centerViewerHealthTimer: number | undefined
  let centerRenderPending: CenterRenderRequest | undefined
  let centerRenderDrainPromise: Promise<void> | undefined
  let centerRebuildPromise: Promise<void> | undefined
  let centerCoalescedRenderCount = 0
  let centerViewSubmissionCount = 0
  let lastGoodCenterProject: RenderProject | undefined

  const centerStatus = document.createElement('div')
  centerStatus.classList.add('center-status')
  centerStatus.textContent = 'Zookeeper ready'

  const reportRuntimeEvent = (event: string) => {
    if (!isControllerWindow) return
    const statuses = Array.from(agents.values()).reduce((counts, agent) => {
      counts.set(agent.status, (counts.get(agent.status) ?? 0) + 1)
      return counts
    }, new Map<AgentStatus, number>())
    void fetch('/api/runtime-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event,
        phase: runPhase,
        rootStatus,
        blockers: root.dataset.completionBlockers ?? '',
        agents: agents.size,
        complete: statuses.get('complete') ?? 0,
        error: statuses.get('error') ?? 0,
        activeWork: workWaiters.size + bomPlanningAgentIds.size,
        activeReviews: activeReviewRequests.size,
        queuedReviews: reviewQueue.size,
        snapshotJobs: snapshotJobs.size,
        persistenceJobs: snapshotPersistenceJobs.size,
      }),
    }).catch(() => {})
  }

  const closeActiveSession = (reason: string) => {
    const sessionId = activeSessionId
    if (sessionId.length === 0) return
    void fetch('/api/zookeeper/session-close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, reason }),
      keepalive: true,
    }).catch(() => {})
  }

  const runFetch = (input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, {
    ...init,
    signal: runRequestAbort?.signal,
  })

  const runFetchWithTimeout = async (
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number,
    label: string,
  ) => {
    const controller = new AbortController()
    const runSignal = runRequestAbort?.signal
    let timedOut = false
    const abortFromRun = () => controller.abort()
    if (runSignal?.aborted) controller.abort()
    else runSignal?.addEventListener('abort', abortFromRun, { once: true })
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } catch (error: unknown) {
      if (timedOut) {
        throw new Error(`${label} timed out after ${Math.ceil(timeoutMs / 1000)}s`)
      }
      throw error
    } finally {
      window.clearTimeout(timeout)
      runSignal?.removeEventListener('abort', abortFromRun)
    }
  }

  const setRunPhase = (phase: RunPhase, status: AgentStatus = rootStatus) => {
    runPhase = phase
    rootStatus = status
    root.dataset.runPhase = phase
    root.dataset.rootStatus = status
    renderAllGraphs()
    reportRuntimeEvent('phase')
  }

  const aggregateTime = document.createElement('div')
  aggregateTime.classList.add('aggregate-time')
  aggregateTime.textContent = 'Aggregate Agent Time: 0s'

  const promptInput = document.createElement('textarea')
  promptInput.classList.add('orchestrator-prompt')
  promptInput.value = defaultPrompt
  promptInput.spellcheck = false

  const startButton = document.createElement('button')
  startButton.type = 'button'
  startButton.classList.add('orchestrator-start')
  startButton.textContent = 'Start Zookeeper'

  const stopButton = document.createElement('button')
  stopButton.type = 'button'
  stopButton.classList.add('orchestrator-stop')
  stopButton.textContent = 'Stop'

  const rootLog = document.createElement('div')
  rootLog.classList.add('websocket-log')

  const rootGraph = document.createElement('div')
  rootGraph.classList.add('orchestrator-graph')

  const orchestratorConsole = document.createElement('section')
  orchestratorConsole.classList.add('orchestrator-console')
  orchestratorConsole.innerHTML = `
    <div class="orchestrator-heading">
      <div>
        <h1>Zookeeper Orchestrator</h1>
      </div>
      <div class="orchestrator-badges">
        <div class="mode-pill">live</div>
      </div>
    </div>
    <label class="prompt-label">Prompt</label>
  `
  orchestratorConsole.querySelector('.orchestrator-badges')?.prepend(aggregateTime)
  const controls = document.createElement('div')
  controls.classList.add('orchestrator-controls')
  controls.append(startButton, stopButton)

  const graphPanel = document.createElement('section')
  graphPanel.classList.add('graph-panel')
  graphPanel.innerHTML = `
    <div class="graph-heading">
      <div>
        <h2>Live Agent Graph</h2>
      </div>
      <div class="graph-count">0 agents</div>
    </div>
  `
  graphPanel.appendChild(rootGraph)

  const assemblyPanel = document.createElement('section')
  assemblyPanel.classList.add('assembly-section')
  assemblyPanel.innerHTML = `
    <div class="graph-heading">
      <div>
        <h2>Assembly View</h2>
      </div>
      <div class="graph-count">center</div>
    </div>
  `
  const assemblyRenderer = document.createElement('div')
  assemblyRenderer.classList.add('assembly-renderer')
  assemblyRenderer.append(centerView.el)
  assemblyPanel.appendChild(assemblyRenderer)
  orchestratorConsole.append(promptInput, controls, centerStatus, assemblyPanel, rootLog)

  const centerOverlay = document.createElement('div')
  centerOverlay.classList.add('orchestrator-overlay')
  centerOverlay.append(orchestratorConsole, graphPanel)

  centerTile.append(centerOverlay)

  const writeLog = (
    target: HTMLElement,
    line: string,
    direction: 'in' | 'out' | 'sys' = 'sys',
    maxRows = 56,
  ) => {
    const row = document.createElement('div')
    row.classList.add('log-row', `log-${direction}`)
    row.textContent = line
    target.appendChild(row)
    while (target.childElementCount > maxRows) target.firstElementChild?.remove()
    target.scrollTop = target.scrollHeight
  }

  const rootLogLine = (line: string, direction: 'in' | 'out' | 'sys' = 'sys') => {
    writeLog(rootLog, line, direction, 160)
    broadcastWall({ type: 'root:log', line, direction })
  }

  const formatAggregateAgentTime = (elapsedMs: number) => {
    const totalSeconds = Math.floor(elapsedMs / 1000)
    if (totalSeconds < 60) return `${totalSeconds}s`
    const totalMinutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (totalMinutes < 60) return `${totalMinutes}m ${String(seconds).padStart(2, '0')}s`
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  const aggregateAgentTimeMs = () => {
    const now = Date.now()
    const rootActiveElapsed = rootActiveStartedAtMs === undefined ? 0 : now - rootActiveStartedAtMs
    return Array.from(agents.values()).reduce((total, agent) => {
      const elapsed = agent.elapsedMs ?? 0
      const activeElapsed = agent.activeStartedAtMs === undefined ? 0 : now - agent.activeStartedAtMs
      return total + elapsed + activeElapsed
    }, rootElapsedMs + rootActiveElapsed)
  }

  const updateAggregateTime = () => {
    aggregateTime.textContent = `Aggregate Agent Time: ${formatAggregateAgentTime(aggregateAgentTimeMs())}`
  }

  const startAggregateTimeTicker = () => {
    if (aggregateTimeTimer !== undefined) return
    updateAggregateTime()
    aggregateTimeTimer = window.setInterval(updateAggregateTime, 1000)
  }

  const graphNode = (id: string): Agent | undefined => {
    if (id === rootAgentId) {
      return {
        id: rootAgentId,
        parentId: '',
        kind: 'orchestrator',
        name: 'Zookeeper Orchestrator',
        role: 'root assembly planner',
        instruction: rootInstruction,
        color: '#FFFFFF',
        status: rootStatus,
        filePath: rootFilePath,
        imports: Array.from(rootImports),
        source: activeSource,
      }
    }
    return agents.get(id)
  }

  const graphChildren = (id: string) => Array.from(agents.values())
    .filter(agent => agent.parentId === id)
    .sort((a, b) => a.id.localeCompare(b.id))

  const isReusableLibraryAgent = (agent: Agent) => (
    agent.kind === 'orchestrator' &&
    /\b(reusable|shared|library|catalog|standard)\b/i.test(agent.role)
  )

  const agentTileIndex = (agent: Agent) => {
    const agentIndex = Array.from(agents.keys()).indexOf(agent.id)
    if (agentIndex < 0) return undefined
    return perimeterOrder[agentIndex % perimeterOrder.length]
  }

  const shouldRenderAgentLocally = (agent: Agent) => {
    if (isReusableLibraryAgent(agent)) return false
    if (!shouldRenderAgentViews) return false
    if (!isWallTileMode) return true
    return agentTileIndex(agent) === wallTileIndex
  }

  const renderGraphFor = (container: HTMLElement, startId: string, compact: boolean) => {
    const edges: GraphEdge[] = []
    const points = new Map<string, { x: number, y: number, depth: number }>()
    const visited = new Set<string>()
    const nodeMetricsAtDepth = (depth: number) => {
      const baseWidth = compact ? 250 : 340
      const baseHeight = compact ? 76 : 86
      const floor = compact ? 0.58 : 0.46
      const scale = Math.max(floor, Math.pow(compact ? 0.82 : 0.83, depth))
      return {
        width: Math.round(baseWidth * scale),
        height: Math.round(baseHeight * Math.max(0.62, scale)),
        scale,
      }
    }
    const columnGap = compact ? 38 : 50
    const rowGap = compact ? 18 : 24
    const paddingX = compact ? 20 : 28
    const paddingY = compact ? 24 : 34
    const rowHeight = nodeMetricsAtDepth(0).height + rowGap
    let row = 0
    let maxDepth = 0

    const layoutTree = (id: string, depth: number): number => {
      if (visited.has(id)) {
        return points.get(id)?.y ?? paddingY
      }
      visited.add(id)
      maxDepth = Math.max(maxDepth, depth)

      const children = graphChildren(id)
      let y: number

      if (children.length === 0) {
        y = paddingY + row * rowHeight
        row += 1
      } else {
        const childYs = children.map((child) => {
          edges.push({ from: id, to: child.id, kind: 'child' })
          return layoutTree(child.id, depth + 1)
        })
        y = (childYs[0]! + childYs[childYs.length - 1]!) / 2
      }

      points.set(id, {
        x: 0,
        y,
        depth,
      })

      return y
    }

    layoutTree(startId, 0)

    const resolveDepthCollisions = () => {
      const pointsByDepth = new Map<number, Array<{ x: number, y: number, depth: number }>>()
      points.forEach((point) => {
        const level = pointsByDepth.get(point.depth) ?? []
        level.push(point)
        pointsByDepth.set(point.depth, level)
      })
      pointsByDepth.forEach((level) => {
        let nextY = paddingY
        level.sort((left, right) => left.y - right.y).forEach((point) => {
          point.y = Math.max(point.y, nextY)
          nextY = point.y + rowHeight
        })
      })
    }

    const centerParentsOnChildren = (id: string): number => {
      const point = points.get(id)
      if (point === undefined) return paddingY
      const children = graphChildren(id).filter(child => points.has(child.id))
      if (children.length === 0) return point.y
      const childYs = children.map(child => centerParentsOnChildren(child.id))
      point.y = (childYs[0]! + childYs[childYs.length - 1]!) / 2
      return point.y
    }

    resolveDepthCollisions()
    centerParentsOnChildren(startId)
    resolveDepthCollisions()

    points.forEach((_point, id) => {
      const agent = graphNode(id)
      if (agent === undefined) return
      const childIds = new Set(graphChildren(id).map(child => child.id))
      importedAgentsFor(agent)
        .filter(imported => points.has(imported.id) && !childIds.has(imported.id))
        .forEach(imported => edges.push({ from: id, to: imported.id, kind: 'import' }))
    })

    const columnXs: number[] = []
    let nextColumnX = paddingX
    for (let depth = 0; depth <= maxDepth; depth += 1) {
      columnXs[depth] = nextColumnX
      nextColumnX += nodeMetricsAtDepth(depth).width + columnGap
    }
    const contentWidth = nextColumnX - columnGap + paddingX
    const contentHeight = Math.max(
      paddingY * 2 + nodeMetricsAtDepth(0).height,
      Math.max(...Array.from(points.values(), point => point.y + nodeMetricsAtDepth(point.depth).height)) + paddingY,
    )
    const width = Math.max(compact ? 760 : 1400, contentWidth)
    const height = Math.max(compact ? 460 : 900, contentHeight)
    const shiftX = (width - contentWidth) / 2
    const shiftY = (height - contentHeight) / 2
    points.forEach((point) => {
      point.x = (columnXs[point.depth] ?? paddingX) + shiftX
      point.y += shiftY
    })

    const edgeSvg = edges.map((edge) => {
      const start = points.get(edge.from)
      const end = points.get(edge.to)
      if (start === undefined || end === undefined) return ''
      const startMetrics = nodeMetricsAtDepth(start.depth)
      const endMetrics = nodeMetricsAtDepth(end.depth)
      const startX = start.x + startMetrics.width
      const startY = start.y + startMetrics.height / 2
      const endX = end.x
      const endY = end.y + endMetrics.height / 2
      const midX = startX + (endX - startX) / 2
      return `<path class="graph-edge graph-edge-${edge.kind}" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`
    }).join('')

    const nodeSvg = Array.from(points.entries()).map(([id, point]) => {
      const agent = graphNode(id)
      if (agent === undefined || point === undefined) return ''
      const metrics = nodeMetricsAtDepth(point.depth)
      const showDetails = point.depth <= (compact ? 0 : 1)
      const maxTitleLength = Math.max(12, Math.floor(metrics.width / (compact ? 8.8 : 9.4)))
      const primaryLabel = truncateLabel(graphPrimaryLabel(agent), maxTitleLength)
      const secondaryLabel = showDetails ? truncateLabel(graphSecondaryLabel(agent), compact ? 32 : 40) : ''
      const bomLabel = showDetails ? bomSummaryForGraphNode(agent, compact) : ''
      const primaryY = secondaryLabel === '' && bomLabel === ''
        ? Math.round(metrics.height / 2 + Math.max(4, metrics.scale * 5))
        : Math.round(metrics.height * 0.31)
      const nameSize = Math.max(compact ? 11 : 12, Math.round((compact ? 17 : 20) * metrics.scale))
      const detailSize = Math.max(compact ? 9 : 10, Math.round((compact ? 12 : 14) * metrics.scale))
      const secondarySvg = secondaryLabel === ''
        ? ''
        : `<text class="graph-role" x="14" y="${Math.round(metrics.height * 0.57)}" style="font-size: ${detailSize}px">${escapeHtml(secondaryLabel)}</text>`
      const bomSvg = bomLabel === ''
        ? ''
        : `<text class="graph-bom" x="14" y="${Math.round(metrics.height * 0.8)}" style="font-size: ${detailSize}px">${escapeHtml(bomLabel)}</text>`
      return `
        <g class="graph-node graph-${agent.kind} graph-status-${agent.status}" data-depth="${point.depth}" transform="translate(${point.x} ${point.y})">
          <rect width="${metrics.width}" height="${metrics.height}" rx="6" style="--node-color: ${agent.color}" />
          <circle class="graph-state-dot" cx="${metrics.width - 16}" cy="16" r="${Math.max(3, Math.round((compact ? 5 : 6) * metrics.scale))}" />
          <text class="graph-name" x="14" y="${primaryY}" style="font-size: ${nameSize}px">${escapeHtml(primaryLabel)}</text>
          ${secondarySvg}
          ${bomSvg}
        </g>
      `
    }).join('')

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">
        ${edgeSvg}
        ${nodeSvg}
      </svg>
    `
  }

  const renderAllGraphsNow = () => {
    if (!isWallTileMode || isControllerWindow) {
      renderGraphFor(rootGraph, rootAgentId, false)
      graphPanel.querySelector('.graph-count')!.textContent = `${agents.size} agents`
    }
    for (const agent of agents.values()) {
      if (agent.kind !== 'orchestrator' || agent.graphElement === undefined) continue
      renderGraphFor(agent.graphElement, agent.id, true)
    }
  }

  const renderAllGraphs = () => {
    if (graphRenderTimer !== undefined) return
    graphRenderTimer = window.setTimeout(() => {
      graphRenderTimer = undefined
      renderAllGraphsNow()
    }, 120)
  }

  const layoutAgentsNow = () => {
    const buckets = perimeterOrder.map((): Agent[] => [])
    Array.from(agents.values()).forEach((agent, index) => {
      buckets[index % perimeterOrder.length]!.push(agent)
    })

    buckets.forEach((bucket, bucketIndex) => {
      const monitorIndex = perimeterOrder[bucketIndex]!
      const monitor = monitorElements.get(monitorIndex)
      if (monitor === undefined) return

      const plannedCount = plannedAgentCount === 0
        ? 0
        : Math.floor(plannedAgentCount / perimeterOrder.length) + (bucketIndex < plannedAgentCount % perimeterOrder.length ? 1 : 0)
      const layoutCount = Math.max(bucket.length, plannedCount)
      const columnCount = layoutCount <= 1 ? 1 : Math.ceil(Math.sqrt(layoutCount))
      const nextElements = bucket.map(agent => agent.element!).filter(Boolean)
      const currentElements = Array.from(monitor.children)
      const itemsByColumn = columnItemCounts(layoutCount, columnCount)
      const rowTrackCount = Math.max(1, itemsByColumn.filter(Boolean).reduce(leastCommonMultiple, 1))

      nextElements.forEach((element, elementIndex) => {
        let columnIndex = 0
        let positionInColumn = elementIndex
        for (; columnIndex < itemsByColumn.length; columnIndex += 1) {
          const itemCount = itemsByColumn[columnIndex]!
          if (positionInColumn < itemCount) break
          positionInColumn -= itemCount
        }

        const columnItemCount = itemsByColumn[columnIndex] || 1
        const rowSpan = Math.max(1, rowTrackCount / columnItemCount)
        const rowStart = positionInColumn * rowSpan + 1
        element.style.gridColumn = `${columnIndex + 1} / span 1`
        element.style.gridRow = `${rowStart} / span ${rowSpan}`
      })

      monitor.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`
      monitor.style.gridTemplateRows = `repeat(${rowTrackCount}, minmax(0, 1fr))`
      monitor.classList.toggle('agent-monitor-empty', bucket.length === 0)
      if (
        currentElements.length !== nextElements.length ||
        currentElements.some((element, index) => element !== nextElements[index])
      ) {
        monitor.replaceChildren(...nextElements)
      }
    })
  }

  const layoutAgents = () => {
    if (layoutTimer !== undefined) return
    layoutTimer = window.setTimeout(() => {
      layoutTimer = undefined
      layoutAgentsNow()
    }, 80)
  }

  const submitProject = (
    view: ZooWebView,
    project: RenderProject,
    onFailure: (message: string) => void,
    onSuccess?: () => void,
  ): Promise<void> => {
    if (view.rtc === undefined) return Promise.resolve()
    const executor = view.rtc.executor()
    return executor.submit(project.files as unknown as string, { mainKclPathName: project.mainFilePath })
      .then(() => {
        sendInitialCameraCommands(view)
        onSuccess?.()
      })
      .catch((error: unknown) => {
        onFailure(errorToMessage(error))
        throw error
      })
  }

  const waitForSnapshotView = async (): Promise<ZooWebView> => {
    if (!isControllerWindow) throw new Error('only the controller can render CAD snapshots')
    if (snapshotViewDisposing !== undefined) await snapshotViewDisposing
    if (snapshotView?.rtc !== undefined) return snapshotView
    if (snapshotViewStarting !== undefined) return snapshotViewStarting

    snapshotViewStarting = (async () => {
      if (snapshotView !== undefined) {
        await snapshotView.deconstructor()
        snapshotView = undefined
      }

      const view = new ZooWebView({
        zooClient,
        size: snapshotViewerSize,
        allowConcurrentViews: true,
        showStartLogo: false,
      })
      view.el.classList.add('snapshot-capture-view')
      snapshotCaptureHost.replaceChildren(view.el)
      snapshotView = view
      let transportReady = false
      view.addEventListener('ready', () => {
        transportReady = true
      }, { once: true })
      view.start()

      const deadline = Date.now() + 30000
      const video = view.el.querySelector<HTMLVideoElement>('video')
      while (
        (
          !transportReady ||
          view.rtc === undefined ||
          video?.srcObject === null ||
          (video?.readyState ?? 0) < HTMLMediaElement.HAVE_CURRENT_DATA
        ) &&
        Date.now() < deadline
      ) await wait(80)
      if (
        !transportReady ||
        view.rtc === undefined ||
        video?.srcObject === null ||
        (video?.readyState ?? 0) < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        throw new Error('snapshot renderer transport did not become ready within 30 seconds')
      }
      return view
    })()

    try {
      return await snapshotViewStarting
    } finally {
      snapshotViewStarting = undefined
    }
  }

  const snapshotHasVisibleGeometry = () => {
    const context = snapshotValidationCanvas.getContext('2d', { willReadFrequently: true })
    if (context === null) return true
    context.drawImage(
      snapshotCanvas,
      0,
      0,
      snapshotValidationCanvas.width,
      snapshotValidationCanvas.height,
    )
    const pixels = context.getImageData(
      0,
      0,
      snapshotValidationCanvas.width,
      snapshotValidationCanvas.height,
    ).data
    let minimumLuminance = 255
    let maximumLuminance = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = (pixels[index] * 0.2126) + (pixels[index + 1] * 0.7152) + (pixels[index + 2] * 0.0722)
      minimumLuminance = Math.min(minimumLuminance, luminance)
      maximumLuminance = Math.max(maximumLuminance, luminance)
    }
    context.clearRect(0, 0, snapshotValidationCanvas.width, snapshotValidationCanvas.height)
    return maximumLuminance - minimumLuminance >= 8
  }

  const captureSnapshotDataUrl = async (view: ZooWebView) => {
    const video = view.el.querySelector<HTMLVideoElement>('video')
    if (video === null) throw new Error('snapshot renderer video is missing')
    let image: Blob | undefined
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await wait(attempt === 0 ? snapshotFrameWaitMs : 1200)
      if (video.videoWidth === 0 || video.videoHeight === 0) continue

      const scale = Math.min(1, snapshotViewerSize.width / video.videoWidth, snapshotViewerSize.height / video.videoHeight)
      const width = Math.max(1, Math.round(video.videoWidth * scale))
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      if (snapshotCanvas.width !== width) snapshotCanvas.width = width
      if (snapshotCanvas.height !== height) snapshotCanvas.height = height
      const context = snapshotCanvas.getContext('2d', { willReadFrequently: true })
      if (context === null) throw new Error('snapshot canvas is unavailable')
      try {
        context.fillStyle = '#05070b'
        context.fillRect(0, 0, width, height)
        context.drawImage(video, 0, 0, width, height)
        if (!snapshotHasVisibleGeometry()) continue
        image = await withTimeout(new Promise<Blob>((resolve, reject) => {
          snapshotCanvas.toBlob((blob) => {
            if (blob === null) reject(new Error('snapshot canvas returned no image'))
            else resolve(blob)
          }, 'image/webp', 0.86)
        }), snapshotCaptureTimeoutMs, 'snapshot canvas encoding')
        break
      } finally {
        context.clearRect(0, 0, snapshotCanvas.width, snapshotCanvas.height)
      }
    }
    if (image === undefined) throw new Error('snapshot renderer returned a blank frame')
    return await withTimeout(new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('snapshot image reader returned no data URL'))
      }, { once: true })
      reader.addEventListener('error', () => reject(reader.error ?? new Error('snapshot image reader failed')), { once: true })
      reader.readAsDataURL(image)
    }), snapshotCaptureTimeoutMs, 'snapshot data URL conversion')
  }

  const persistSnapshot = async (agentId: string, dataUrl: string) => {
    const response = await runFetchWithTimeout('/api/snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId, dataUrl }),
    }, snapshotPersistTimeoutMs, 'snapshot upload')
    if (!response.ok) throw await httpErrorFromResponse(response, 'snapshot')
    const payload = await response.json() as { url?: unknown }
    if (typeof payload.url !== 'string' || payload.url.length === 0) {
      throw new Error('snapshot endpoint returned no URL')
    }
    return payload.url
  }

  const persistCompletedProject = async () => {
    const response = await runFetchWithTimeout('/api/project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: activeSessionId,
        prompt: promptInput.value.trim() || defaultPrompt,
        rootFile: rootFilePath,
        files: objectFromMap(kclFiles),
        interfaces: objectFromMap(interfaceManifests),
        agents: Array.from(agents.values()).map(agent => ({
          id: agent.id,
          parentId: agent.parentId,
          kind: agent.kind,
          scope: agent.scope,
          name: agent.name,
          role: agent.role,
          instruction: agent.instruction,
          filePath: agent.filePath,
          imports: agent.imports ?? [],
          status: agent.status,
          elapsedMs: agent.elapsedMs ?? 0,
        })),
      }),
    }, snapshotPersistTimeoutMs, 'completed project persistence')
    if (!response.ok) throw await httpErrorFromResponse(response, 'completed project')
    const payload = await response.json() as { path?: unknown, fileCount?: unknown, fileBytes?: unknown }
    if (typeof payload.path !== 'string' || payload.path.length === 0) {
      throw new Error('completed project endpoint returned no path')
    }
    return {
      path: payload.path,
      fileCount: Number(payload.fileCount) || kclFiles.size,
      fileBytes: Number(payload.fileBytes) || 0,
    }
  }

  const drainSnapshotPersistence = async () => {
    while (snapshotPersistenceJobs.size > 0) {
      const next = snapshotPersistenceJobs.entries().next().value as [string, SnapshotPersistenceJob] | undefined
      if (next === undefined) break
      const [agentId, job] = next
      snapshotPersistenceJobs.delete(agentId)
      const agent = agents.get(agentId)
      if (agent === undefined || !agentStillActive(agent, job.currentRun)) continue
      try {
        const persistedUrl = await persistSnapshot(agent.id, job.dataUrl)
        if (agentStillActive(agent, job.currentRun)) {
          if (job.sourceKcl.trim().length > 0) agent.lastGoodKcl = job.sourceKcl
          agent.lastGoodSnapshotUrl = persistedUrl
          setAgentSnapshotState(agent, 'ready', 'persisted CAD snapshot')
          setAgentSnapshot(agent, persistedUrl)
          broadcastWall({ type: 'agent:snapshot', agentId: agent.id, snapshotUrl: persistedUrl })
          appendAgentLog(agent, '< CAD snapshot persisted to disk', 'in')
        }
      } catch (error: unknown) {
        if (agentStillActive(agent, job.currentRun)) {
          setAgentSnapshotState(agent, 'error', `snapshot persistence failed: ${errorToMessage(error)}`)
          appendAgentLog(agent, `< CAD snapshot persistence failed: ${errorToMessage(error)}`)
        }
      }
    }
  }

  const ensureSnapshotPersistenceDrain = () => {
    if (snapshotPersistenceDrainPromise !== undefined) return
    snapshotPersistenceDrainPromise = drainSnapshotPersistence().finally(() => {
      snapshotPersistenceDrainPromise = undefined
      if (snapshotPersistenceJobs.size > 0) ensureSnapshotPersistenceDrain()
      else scheduleRunCompletionCheck()
    })
  }

  const queueSnapshotPersistence = (agent: Agent, currentRun: number, dataUrl: string, sourceKcl: string) => {
    snapshotPersistenceJobs.set(agent.id, { agentId: agent.id, currentRun, dataUrl, sourceKcl })
    ensureSnapshotPersistenceDrain()
  }

  const disposeSnapshotView = async () => {
    if (snapshotViewDisposing !== undefined) {
      await snapshotViewDisposing
      return
    }
    const previous = snapshotView
    snapshotView = undefined
    snapshotViewStarting = undefined
    snapshotCaptureHost.replaceChildren()
    const disposing = (async () => {
      if (previous !== undefined) {
        await withTimeout(Promise.resolve(previous.deconstructor()), snapshotDisposeTimeoutMs, 'snapshot renderer shutdown')
          .catch(() => {})
      }
    })()
    snapshotViewDisposing = disposing
    try {
      await disposing
    } finally {
      snapshotViewSubmissionCount = 0
      if (snapshotViewDisposing === disposing) snapshotViewDisposing = undefined
    }
  }

  const setAgentSnapshotState = (agent: Agent, state: SnapshotState, message = '') => {
    agent.snapshotState = state
    agent.snapshotMessage = message
    if (state === 'ready') {
      agent.snapshotRecoveryCount = 0
      agent.lastSnapshotRecoveryAtMs = undefined
    }
    updateViewerPlaceholderText(agent)
    broadcastWall({
      type: 'agent:snapshot-status',
      agentId: agent.id,
      state,
      message: message || undefined,
    })
    scheduleRunCompletionCheck()
  }

  const drainAgentSnapshots = async () => {
    while (snapshotJobs.size > 0) {
      const next = Array.from(snapshotJobs.entries()).sort((left, right) => {
        const leftAgent = agents.get(left[0])
        const rightAgent = agents.get(right[0])
        const priority = (agent: Agent | undefined, job: SnapshotJob) => {
          const missingVisual = agent?.snapshotUrl === undefined
          if (missingVisual && job.kind === 'final') return 0
          if (missingVisual) return 1
          if (job.kind === 'final') return 2
          return 3
        }
        return priority(leftAgent, left[1]) - priority(rightAgent, right[1])
      })[0]
      if (next === undefined) break
      const [agentId, job] = next
      snapshotJobs.delete(agentId)
      const agent = agents.get(agentId)
      if (agent === undefined || !agentStillActive(agent, job.currentRun)) continue

      try {
        setAgentSnapshotState(agent, 'rendering', job.label)
        appendAgentLog(agent, `< rendering CAD snapshot: ${job.label}`, 'in')
        const view = await waitForSnapshotView()
        snapshotViewSubmissionCount += 1
        await withTimeout(submitProject(view, job.project, (message) => {
          throw new Error(message)
        }), snapshotSubmitTimeoutMs, 'snapshot renderer submit')
        const snapshotDataUrl = await captureSnapshotDataUrl(view)
        if (!agentStillActive(agent, job.currentRun)) continue
        setAgentSnapshotState(agent, 'persisting', job.label)
        if (job.kind === 'final' && job.sourceKcl.trim().length > 0) agent.lastGoodKcl = job.sourceKcl
        queueSnapshotPersistence(agent, job.currentRun, snapshotDataUrl, job.sourceKcl)
        appendAgentLog(agent, `< CAD snapshot captured; persisting: ${job.label}`, 'in')
      } catch (error: unknown) {
        const message = errorToMessage(error)
        appendAgentLog(agent, `< CAD snapshot failed: ${message}`)
        if (message.includes('blank frame')) {
          if (
            job.kind === 'final' &&
            job.attempt < 1 &&
            agentStillActive(agent, job.currentRun)
          ) {
            snapshotJobs.set(agent.id, { ...job, attempt: job.attempt + 1 })
            setAgentSnapshotState(agent, 'queued', 'retry after blank frame')
            appendAgentLog(agent, '< CAD snapshot retrying after blank frame', 'in')
          } else if (agentStillActive(agent, job.currentRun)) {
            setAgentSnapshotState(agent, 'error', 'rendered frame contained no visible geometry')
          }
          continue
        }
        await disposeSnapshotView()
        if (job.attempt < 1 && agentStillActive(agent, job.currentRun)) {
          snapshotJobs.set(agent.id, { ...job, attempt: job.attempt + 1 })
          setAgentSnapshotState(agent, 'queued', 'retry after renderer recovery')
          appendAgentLog(agent, `< CAD snapshot retrying after renderer recovery`, 'in')
        } else if (agentStillActive(agent, job.currentRun)) {
          setAgentSnapshotState(agent, 'error', message)
        }
      } finally {
        if (snapshotViewSubmissionCount >= maxSnapshotSubmissionsPerRenderer) {
          await disposeSnapshotView()
        }
      }
    }
    if (snapshotJobs.size === 0) await disposeSnapshotView()
  }

  const ensureSnapshotDrain = () => {
    if (snapshotDrainPromise !== undefined) return
    snapshotDrainPromise = drainAgentSnapshots().finally(() => {
      snapshotDrainPromise = undefined
      if (snapshotJobs.size > 0) ensureSnapshotDrain()
      else scheduleRunCompletionCheck()
    })
  }

  const queueAgentSnapshot = (
    agent: Agent,
    currentRun: number,
    project: RenderProject,
    label: string,
    kind: SnapshotJob['kind'],
  ) => {
    if (!useAgentCadSnapshots || !isControllerWindow) return
    // One intermediary visual is enough to show progress. Once an agent has a
    // snapshot, or while its first draft is rendering, preserve capacity for
    // blank agents and final KCL.
    if (
      kind === 'draft' &&
      (
        agent.snapshotUrl !== undefined ||
        agent.snapshotState === 'rendering' ||
        agent.snapshotState === 'persisting' ||
        snapshotJobs.size >= maxQueuedDraftSnapshots
      )
    ) return
    const sourceKcl = kind === 'final'
      ? (kclFiles.get(agent.filePath) ?? project.files.get(project.mainFilePath) ?? '')
      : (project.files.get(project.mainFilePath) ?? '')
    snapshotJobs.set(agent.id, {
      agentId: agent.id,
      currentRun,
      project,
      label,
      kind,
      attempt: 0,
      sourceKcl,
    })
    setAgentSnapshotState(agent, 'queued', label)
    if (agent.snapshotUrl === undefined) setAgentViewerPlaceholder(agent, viewerPlaceholderText(agent))
    ensureSnapshotDrain()
  }

  const agentForFilePath = (filePath: string) => Array.from(agents.values())
    .find(agent => agent.filePath === filePath)

  const descendantFilePaths = (agent: Agent): string[] => [
    agent.filePath,
    ...graphChildren(agent.id).flatMap(child => descendantFilePaths(child)),
  ]

  const resolveImportFilePath = (specifier: string) => {
    if (kclFiles.has(specifier)) return specifier
    return Array.from(kclFiles.keys()).find(filePath => (
      renderPathForFilePath(filePath) === specifier || filePath.endsWith(`/${specifier}`)
    ))
  }

  const importFilePathsFromSource = (source: string) => {
    const paths: string[] = []
    const regex = /^\s*import\s+"([^"]+)"/gm
    for (;;) {
      const match = regex.exec(source)
      if (match === null) break
      const filePath = resolveImportFilePath(match[1]!)
      if (filePath !== undefined) paths.push(filePath)
    }
    return paths
  }

  const collectFilePathsWithImports = (entryPaths: string[]) => {
    const seen = new Set<string>()
    const ordered: string[] = []
    const visit = (filePath: string) => {
      if (seen.has(filePath)) return
      seen.add(filePath)
      ordered.push(filePath)
      importFilePathsFromSource(kclFiles.get(filePath) ?? '').forEach(visit)
    }
    entryPaths.forEach(visit)
    return ordered
  }

  const renderFilePathsFor = (entryFilePath: string) => {
    if (entryFilePath === rootFilePath) {
      return collectFilePathsWithImports([rootFilePath])
    }

    const agent = agentForFilePath(entryFilePath)
    if (agent === undefined) return [entryFilePath]
    if (isReusableLibraryAgent(agent)) return [entryFilePath]
    return collectFilePathsWithImports([entryFilePath])
  }

  const renderContentForFile = (filePath: string) => {
    let source = kclFiles.get(filePath) ?? ''
    Array.from(kclFiles.keys()).forEach((knownPath) => {
      source = source.split(`"${knownPath}"`).join(`"${renderPathForFilePath(knownPath)}"`)
    })
    return source
  }

  const renderProjectFor = (entryFilePath: string): RenderProject => ({
    mainFilePath: renderPathForFilePath(entryFilePath),
    files: new Map(
      renderFilePathsFor(entryFilePath)
        .map(filePath => [renderPathForFilePath(filePath), renderContentForFile(filePath)]),
    ),
  })

  const requestContextFor = (entryFilePath: string, includeEntry = true) => {
    const filePaths = renderFilePathsFor(entryFilePath)
    const project = renderProjectFor(entryFilePath)
    if (!includeEntry) project.files.delete(renderPathForFilePath(entryFilePath))
    return {
      files: objectFromMap(project.files),
      interfaces: Object.fromEntries(
        filePaths
          .filter(filePath => interfaceManifests.has(filePath))
          .map(filePath => [filePath, interfaceManifests.get(filePath)!]),
      ) as Record<string, string>,
    }
  }

  const viewerReloadDelay = (attempt: number) => Math.min(15000, 1000 * 2 ** Math.min(attempt, 4))

  const isViewerFailureMessage = (message: string) => {
    const text = message.toLowerCase()
    if (/\bws-(created|open|message)\b/.test(text)) return false
    return [
      /\b(start failed|view error|video error|video ended|webrtc closed|engine connection failed)\b/,
      /\b(video frame stream stalled)\b/,
      /\b(ws|websocket)[ -]?(error|close|closed|failed|disconnect|disconnected)\b/,
      /\b(gpu process|gpucontrol|createcommandbuffer|command buffer|context lost|webgl context|transientfailure)\b/,
      /\b(peerconnection|ice|dtls|srtp).*\b(closed|failed|disconnect|error)\b/,
    ].some(pattern => pattern.test(text))
  }

  const isTransientControlPlaneError = (message: string) => (
    /\b(failed to fetch|networkerror|load failed|event stream|agent work start|review start|aborterror|connection reset|connection aborted|broken pipe|socket|timed out|timeout|http 50[0234])\b/i
      .test(message)
  )

  const installViewHealthWatchdog = (
    view: ZooWebView,
    onFailure: (message: string) => void,
  ) => {
    const video = view.el.querySelector<HTMLVideoElement>('video')
    let lastFrameCount = -1
    let lastProgressAt = Date.now()
    return window.setInterval(() => {
      if (!document.body.contains(view.el)) return
      if (video?.error !== null && video?.error !== undefined) {
        onFailure(`video error: ${video.error.message || video.error.code}`)
        return
      }
      if (view.rtc === undefined || video === null || video.srcObject === null) {
        lastProgressAt = Date.now()
        return
      }
      const quality = video.getVideoPlaybackQuality?.()
      const frameCount = quality?.totalVideoFrames ?? 0
      if (frameCount > lastFrameCount) {
        lastFrameCount = frameCount
        lastProgressAt = Date.now()
      }
      if (
        lastFrameCount >= 0 &&
        !video.paused &&
        Date.now() - lastProgressAt > viewerStalledReloadMs
      ) {
        onFailure(`video frame stream stalled for ${Math.round((Date.now() - lastProgressAt) / 1000)}s`)
      }
    }, viewerHealthPollMs)
  }

  function attachCenterViewHandlers(view: ZooWebView) {
    if (centerViewerHealthTimer !== undefined) window.clearInterval(centerViewerHealthTimer)
    centerViewerHealthTimer = installViewHealthWatchdog(view, scheduleCenterViewerReload)

    view.addEventListener('status', (ev: Event) => {
      if (view !== centerView) return
      if (!(ev instanceof CustomEvent)) return
      const message = String(ev.detail)
      centerStatus.textContent = `Center view: ${message}`
      if (isViewerFailureMessage(message)) scheduleCenterViewerReload(message)
    })

    view.addEventListener('error', (ev: Event) => {
      if (view !== centerView) return
      const message = ev instanceof CustomEvent ? errorToMessage(ev.detail) : 'center view error'
      scheduleCenterViewerReload(message)
    })

    view.addEventListener('ready', (ev: Event) => {
      if (view !== centerView) return
      const webView = ev.currentTarget
      if (!(webView instanceof ZooWebView)) return
      centerViewerReloadAttempts = 0
      centerStatus.textContent = 'Center assembly connected'
      submitRootProject()
      ensureCenterRenderDrain()
    })
  }

  async function rebuildCenterViewer(reason: string) {
    if (centerRebuildPromise !== undefined) {
      await centerRebuildPromise
      return
    }
    const rebuilding = (async () => {
      const previousView = centerView
      const candidate = createCenterView()
      const recoveryProject = lastGoodCenterProject === undefined
        ? undefined
        : {
          files: new Map(lastGoodCenterProject.files),
          mainFilePath: lastGoodCenterProject.mainFilePath,
        }
      candidate.el.classList.add('center-view-staging')
      assemblyRenderer.append(candidate.el)
      centerStatus.textContent = 'Center renderer restarting; preserving last good frame'
      const startedAt = Date.now()
      try {
        await withTimeout(new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            candidate.removeEventListener('ready', onReady)
            candidate.removeEventListener('error', onError)
          }
          const onReady = () => {
            cleanup()
            resolve()
          }
          const onError = (ev: Event) => {
            cleanup()
            reject(new Error(ev instanceof CustomEvent ? errorToMessage(ev.detail) : 'center staging view error'))
          }
          candidate.addEventListener('ready', onReady)
          candidate.addEventListener('error', onError)
          candidate.start()
        }), 30000, 'center renderer restart')

        if (recoveryProject !== undefined) {
          await withTimeout(
            submitProject(candidate, recoveryProject, (message) => {
              throw new Error(message)
            }),
            centerRendererSubmitTimeoutMs,
            'center last-good recovery render',
          )
        }

        centerView = candidate
        candidate.el.classList.remove('center-view-staging')
        attachCenterViewHandlers(candidate)
        assemblyRenderer.replaceChildren(candidate.el)
        centerViewSubmissionCount = recoveryProject === undefined ? 0 : 1
        centerViewerReloadAttempts = 0
        centerStatus.textContent = recoveryProject === undefined
          ? 'Center assembly connected'
          : 'Center assembly restored'
        await withTimeout(
          Promise.resolve(previousView.deconstructor()),
          snapshotDisposeTimeoutMs,
          'previous center renderer shutdown',
        ).catch(() => {})
        rootLogLine(`< center renderer recovered in ${Math.round((Date.now() - startedAt) / 1000)}s: ${reason}`, 'in')
        reportRuntimeEvent('center.rebuild.success')
        submitRootProject()
        ensureCenterRenderDrain()
      } catch (error: unknown) {
        candidate.el.remove()
        await withTimeout(
          Promise.resolve(candidate.deconstructor()),
          snapshotDisposeTimeoutMs,
          'failed center renderer shutdown',
        ).catch(() => {})
        const message = errorToMessage(error)
        centerStatus.textContent = `Center recovery failed; preserving prior frame: ${message.slice(0, 100)}`
        rootLogLine(`< center renderer recovery failed; prior frame preserved: ${message}`)
        reportRuntimeEvent('center.rebuild.error')
      }
    })()
    centerRebuildPromise = rebuilding
    try {
      await rebuilding
    } finally {
      if (centerRebuildPromise === rebuilding) centerRebuildPromise = undefined
    }
  }

  function scheduleCenterViewerReload(reason: string) {
    if (!active || runPhase === 'idle' || runPhase === 'finalizing' || runPhase === 'complete') return
    if (centerRebuildPromise !== undefined) return
    if (centerViewerReloadTimer !== undefined) return
    if (centerViewerReloadAttempts >= maxViewerReloadAttempts) {
      rootLogLine(`< center renderer reload limit reached: ${reason}`)
      centerStatus.textContent = `Center renderer offline: ${reason.slice(0, 120)}`
      return
    }
    const attempt = centerViewerReloadAttempts + 1
    const delay = viewerReloadDelay(centerViewerReloadAttempts)
    centerViewerReloadAttempts = attempt
    rootLogLine(`< center renderer error; reload ${attempt}/${maxViewerReloadAttempts} in ${Math.round(delay / 1000)}s: ${reason}`, 'in')
    centerStatus.textContent = `Center renderer restarting: ${reason.slice(0, 120)}`
    centerViewerReloadTimer = window.setTimeout(() => {
      centerViewerReloadTimer = undefined
      if (!active || runPhase === 'idle' || runPhase === 'finalizing' || runPhase === 'complete') return
      void rebuildCenterViewer(`error recovery: ${reason}`)
    }, delay)
  }

  const drainCenterRenders = async () => {
    while (centerRenderPending !== undefined) {
      if (centerRebuildPromise !== undefined) await centerRebuildPromise
      if (centerView.rtc === undefined) return
      if (centerViewSubmissionCount >= maxCenterSubmissionsPerRenderer) {
        await rebuildCenterViewer('bounded renderer lifecycle')
        return
      }

      const request = centerRenderPending
      centerRenderPending = undefined
      const renderStartedAt = Date.now()
      try {
        centerViewSubmissionCount += 1
        await withTimeout(submitProject(centerView, request.project, () => {}, () => {
          sendRootCameraCommand(centerView)
        }), centerRendererSubmitTimeoutMs, `center render ${request.label}`)
        lastGoodCenterProject = {
          files: new Map(request.project.files),
          mainFilePath: request.project.mainFilePath,
        }
        reportRuntimeEvent('center.render.success')
        request.waiters.forEach(waiter => waiter.resolve())
        if (centerCoalescedRenderCount > 0) {
          rootLogLine(`< center renderer skipped ${centerCoalescedRenderCount} superseded update${centerCoalescedRenderCount === 1 ? '' : 's'}`, 'in')
          centerCoalescedRenderCount = 0
        }
      } catch (error: unknown) {
        const renderError = error instanceof Error ? error : new Error(errorToMessage(error))
        request.waiters.forEach(waiter => waiter.reject(renderError))
        const message = errorToMessage(error)
        rootLogLine(`< center render failed after ${Math.round((Date.now() - renderStartedAt) / 1000)}s: ${message}`)
        reportRuntimeEvent('center.render.error')
        centerStatus.textContent = `Center KCL failed: ${message}`
        if (isViewerFailureMessage(message) || message.includes('timed out')) {
          scheduleCenterViewerReload(message)
          return
        }
      }
    }
  }

  function ensureCenterRenderDrain() {
    if (centerRenderDrainPromise !== undefined) return
    centerRenderDrainPromise = drainCenterRenders().finally(() => {
      centerRenderDrainPromise = undefined
      if (
        centerRenderPending !== undefined &&
        centerView.rtc !== undefined &&
        centerRebuildPromise === undefined
      ) ensureCenterRenderDrain()
      else scheduleRunCompletionCheck()
    })
  }

  const queueCenterProject = (project: RenderProject, label: string) => new Promise<void>((resolve, reject) => {
    const waiter: CenterRenderWaiter = { resolve, reject }
    if (centerRenderPending === undefined) {
      centerRenderPending = { project, label, waiters: [waiter] }
    } else {
      // Every waiting caller is satisfied by the newest complete assembly.
      centerRenderPending.project = project
      centerRenderPending.label = label
      centerRenderPending.waiters.push(waiter)
      centerCoalescedRenderCount += 1
    }
    ensureCenterRenderDrain()
  })

  const submitRootProject = () => {
    if (kclFiles.size === 0) return
    void queueCenterProject(renderProjectFor(rootFilePath), 'root assembly update').catch((error: unknown) => {
      const message = errorToMessage(error)
      centerStatus.textContent = `Center KCL failed: ${message}`
      if (isViewerFailureMessage(message)) scheduleCenterViewerReload(message)
    })
  }

  const scheduleRootProjectSubmit = () => {
    if (rootRenderTimer !== undefined) window.clearTimeout(rootRenderTimer)
    rootRenderTimer = window.setTimeout(() => {
      rootRenderTimer = undefined
      submitRootProject()
    }, 450)
  }

  const liveAgentViewLimit = () => (
    Math.min(maxLiveAgentViews, Math.max(1, plannedAgentCount || agents.size || 1))
  )

  const liveAgentViewCount = () => Array.from(agents.values())
    .filter(agent => agent.view !== undefined).length

  const markViewerQueued = (agent: Agent, reason: string) => {
    agent.viewerSlot?.classList.add('agent-viewer-queued')
    if (agent.viewPlaceholder !== undefined) {
      agent.viewPlaceholder.textContent = `Renderer queued (${liveAgentViewCount()}/${liveAgentViewLimit()})`
    }
    if (!agent.viewerQueuedLogged) {
      appendAgentLog(agent, `< renderer queued: ${reason}; AI work continues`, 'in')
      agent.viewerQueuedLogged = true
    }
  }

  const setAgentViewerPlaceholder = (agent: Agent, message: string) => {
    const viewerSlot = agent.viewerSlot
    if (viewerSlot === undefined) return
    const placeholder = document.createElement('div')
    placeholder.classList.add('agent-viewer-placeholder')
    placeholder.textContent = message
    agent.viewPlaceholder = placeholder
    viewerSlot.replaceChildren(placeholder)
  }

  const releaseAgentSnapshotDisplay = (agent: Agent) => {
    agent.snapshotLoadId = (agent.snapshotLoadId ?? 0) + 1
    agent.viewerSlot?.querySelector<HTMLImageElement>('img.agent-cad-snapshot')?.removeAttribute('src')
    if (agent.snapshotObjectUrl !== undefined) {
      URL.revokeObjectURL(agent.snapshotObjectUrl)
      agent.snapshotObjectUrl = undefined
    }
  }

  const shouldDisplayAgentSnapshot = (agent: Agent) => (
    !isWallTileMode ||
    (!isControllerWindow && agentTileIndex(agent) === wallTileIndex)
  )

  const setAgentSnapshot = (agent: Agent, snapshotUrl: string) => {
    agent.snapshotUrl = snapshotUrl
    const viewerSlot = agent.viewerSlot
    if (viewerSlot === undefined) return
    if (!shouldDisplayAgentSnapshot(agent)) {
      releaseAgentSnapshotDisplay(agent)
      return
    }
    const loadId = (agent.snapshotLoadId ?? 0) + 1
    agent.snapshotLoadId = loadId

    void (async () => {
      const response = await runFetchWithTimeout(
        snapshotUrl,
        { cache: 'no-store' },
        snapshotImageFetchTimeoutMs,
        'snapshot image fetch',
      )
      if (!response.ok) throw await httpErrorFromResponse(response, 'snapshot image')
      const objectUrl = URL.createObjectURL(await response.blob())
      if (agent.snapshotLoadId !== loadId || agent.snapshotUrl !== snapshotUrl) {
        URL.revokeObjectURL(objectUrl)
        return
      }

      const image = document.createElement('img')
      image.classList.add('agent-cad-snapshot')
      image.alt = `CAD snapshot for ${agent.name}`
      image.decoding = 'async'
      image.src = objectUrl
      await image.decode()

      if (agent.snapshotLoadId !== loadId || agent.snapshotUrl !== snapshotUrl) {
        image.removeAttribute('src')
        URL.revokeObjectURL(objectUrl)
        return
      }

      const previousImage = viewerSlot.querySelector<HTMLImageElement>('img.agent-cad-snapshot')
      previousImage?.removeAttribute('src')
      const previousObjectUrl = agent.snapshotObjectUrl
      agent.snapshotObjectUrl = objectUrl
      agent.viewPlaceholder = undefined
      viewerSlot.classList.remove('agent-viewer-queued')
      viewerSlot.replaceChildren(image)
      if (previousObjectUrl !== undefined) URL.revokeObjectURL(previousObjectUrl)
    })().catch((error: unknown) => {
      if (agent.snapshotLoadId !== loadId) return
      appendAgentLog(agent, `< snapshot display failed: ${errorToMessage(error)}`)
      if (agent.snapshotObjectUrl === undefined) setAgentViewerPlaceholder(agent, 'Snapshot unavailable')
    })
  }

  const clearAgentViewerTimers = (agent: Agent) => {
    if (agent.viewerReloadTimer !== undefined) {
      window.clearTimeout(agent.viewerReloadTimer)
      agent.viewerReloadTimer = undefined
    }
    if (agent.viewerHealthTimer !== undefined) {
      window.clearInterval(agent.viewerHealthTimer)
      agent.viewerHealthTimer = undefined
    }
  }

  const disposeAgentView = async (agent: Agent) => {
    const previousView = agent.view
    agent.view = undefined
    agent.viewStarted = false
    if (agent.viewerHealthTimer !== undefined) {
      window.clearInterval(agent.viewerHealthTimer)
      agent.viewerHealthTimer = undefined
    }
    await previousView?.deconstructor()
  }

  function scheduleAgentViewerReload(agent: Agent, reason: string) {
    if (!active || runPhase === 'idle' || runPhase === 'finalizing' || runPhase === 'complete') return
    if (!shouldRenderAgentLocally(agent) || isReusableLibraryAgent(agent)) return
    if (agent.viewerReloadTimer !== undefined) return
    if (agent.viewerReloadAttempts !== undefined && agent.viewerReloadAttempts >= maxViewerReloadAttempts) {
      appendAgentLog(agent, `< renderer reload limit reached: ${reason}`)
      setAgentViewerPlaceholder(agent, `Renderer offline: ${reason.slice(0, 120)}`)
      return
    }
    const attempt = (agent.viewerReloadAttempts ?? 0) + 1
    const delay = viewerReloadDelay(agent.viewerReloadAttempts ?? 0)
    agent.viewerReloadAttempts = attempt
    appendAgentLog(agent, `< renderer error; reload ${attempt}/${maxViewerReloadAttempts} in ${Math.round(delay / 1000)}s: ${reason}`, 'in')
    setAgentViewerPlaceholder(agent, `Renderer restarting: ${reason.slice(0, 120)}`)
    agent.viewerReloadTimer = window.setTimeout(() => {
      agent.viewerReloadTimer = undefined
      if (!active || runPhase === 'idle' || runPhase === 'finalizing' || runPhase === 'complete') return
      void (async () => {
        await disposeAgentView(agent)
        if (!agents.has(agent.id)) return
        if (ensureAgentView(agent, 'renderer recovery')) {
          appendAgentLog(agent, '< renderer recreated after error', 'in')
        }
      })()
    }, delay)
  }

  function attachAgentViewHandlers(agent: Agent, view: ZooWebView) {
    if (agent.viewerHealthTimer !== undefined) window.clearInterval(agent.viewerHealthTimer)
    agent.viewerHealthTimer = installViewHealthWatchdog(view, (message) => {
      scheduleAgentViewerReload(agent, message)
    })

    view.addEventListener('status', (ev: Event) => {
      if (!(ev instanceof CustomEvent)) return
      const message = String(ev.detail)
      if (agent.logElement !== undefined) writeLog(agent.logElement, `rtc: ${message}`)
      if (isViewerFailureMessage(message)) scheduleAgentViewerReload(agent, message)
    })

    view.addEventListener('error', (ev: Event) => {
      const message = ev instanceof CustomEvent ? errorToMessage(ev.detail) : 'view error'
      if (agent.logElement !== undefined) writeLog(agent.logElement, `rtc error: ${message}`)
      scheduleAgentViewerReload(agent, message)
    })

    view.addEventListener('ready', (ev: Event) => {
      const webView = ev.currentTarget
      if (!(webView instanceof ZooWebView)) return
      agent.viewerReloadAttempts = 0
      if (agent.logElement !== undefined) writeLog(agent.logElement, 'modeling websocket: connected', 'in')
      if (agent.logElement !== undefined) writeLog(agent.logElement, `loaded ${agent.filePath}`, 'in')
      void submitAgentProject(agent)
    })
  }

  const ensureAgentView = (agent: Agent, reason: string) => {
    if (agent.view !== undefined) {
      startAgentView(agent)
      return true
    }

    if (liveAgentViewCount() >= liveAgentViewLimit()) {
      markViewerQueued(agent, reason)
      return false
    }

    const viewerSlot = agent.viewerSlot
    if (viewerSlot === undefined) return false

    const view = new ZooWebView({
      zooClient,
      size: paneViewerSize(plannedAgentCount || agents.size || 1),
      allowConcurrentViews: true,
      showStartLogo: false,
    })
    view.el.classList.add('wall-view', 'agent-view')
    agent.view = view
    agent.viewPlaceholder = undefined
    viewerSlot.classList.remove('agent-viewer-queued')
    viewerSlot.replaceChildren(view.el)

    attachAgentViewHandlers(agent, view)

    appendAgentLog(agent, `< renderer allocated: ${reason}`, 'in')
    startAgentView(agent)
    return true
  }

  const submitAgentProject = async (agent: Agent, onSuccess?: () => void): Promise<RenderResult> => {
    if (kclFiles.size === 0) return { ok: false, message: 'agent view not ready' }
    if (isReusableLibraryAgent(agent)) return { ok: true, message: 'BOM library is metadata only' }
    if (useAgentCadSnapshots) {
      if (!isControllerWindow) return { ok: true, message: 'snapshot rendered by controller' }
      queueAgentSnapshot(agent, runId, renderProjectFor(agent.filePath), 'latest KCL', 'final')
      onSuccess?.()
      return { ok: true, message: 'CAD snapshot queued' }
    }
    if (!shouldRenderAgentLocally(agent)) return { ok: true, message: 'render delegated to tile window' }
    if (agent.view === undefined && !ensureAgentView(agent, 'final KCL ready')) {
      return { ok: true, message: 'viewer budget queued' }
    }
    if (agent.view?.rtc === undefined) return { ok: false, message: 'agent view not connected yet' }
    const project = renderProjectFor(agent.filePath)
    let failureMessage = ''
    let viewerFailure = false
    try {
      await submitProject(agent.view, project, (message) => {
        failureMessage = message
        if (isViewerFailureMessage(message)) {
          viewerFailure = true
          appendAgentLog(agent, `renderer transport failed: ${message}`)
          scheduleAgentViewerReload(agent, message)
          return
        }
        setAgentStatus(agent, 'error')
        appendAgentLog(agent, `kcl failed: ${message}`)
      }, onSuccess)
      return { ok: true }
    } catch (error: unknown) {
      if (
        viewerFailure ||
        isViewerFailureMessage(failureMessage || errorToMessage(error)) ||
        errorToMessage(error).includes('timed out')
      ) {
        scheduleAgentViewerReload(agent, failureMessage || errorToMessage(error))
        return { ok: true, message: 'renderer restarting after transport error' }
      }
      return { ok: false, message: failureMessage || errorToMessage(error) }
    }
  }

  const reviewLogLine = (agent: Agent, line: string, direction: 'in' | 'out' | 'sys' = 'sys') => {
    if (agent.id === rootAgentId) {
      rootLogLine(line, direction)
      return
    }
    appendAgentLog(agent, line, direction)
  }

  const agentStillActive = (agent: Agent, currentRun: number) => (
    currentRun === runId && (agent.id === rootAgentId || agents.has(agent.id))
  )

  const setWorkAgentStatus = (agent: Agent, status: AgentStatus) => {
    if (agent.id === rootAgentId) {
      rootStatus = status
      renderAllGraphs()
      scheduleRunCompletionCheck()
      return
    }
    setAgentStatus(agent, status)
  }

  const appendWorkAgentLog = (agent: Agent, line: string, direction: 'in' | 'out' | 'sys' = 'sys') => {
    if (agent.id === rootAgentId) {
      rootLogLine(line, direction)
      return
    }
    appendAgentLog(agent, line, direction)
  }

  const submitWorkAgentProject = async (agent: Agent, onSuccess?: () => void): Promise<RenderResult> => {
    if (agent.id !== rootAgentId) return submitAgentProject(agent, onSuccess)
    if (kclFiles.size === 0) return { ok: false, message: 'root view not ready' }
    try {
      await queueCenterProject(renderProjectFor(rootFilePath), 'root agent result')
      onSuccess?.()
      return { ok: true }
    } catch (error: unknown) {
      const message = errorToMessage(error)
      if (isViewerFailureMessage(message) || message.includes('timed out')) {
        scheduleCenterViewerReload(message)
        rootLogLine(`root renderer transport failed: ${message}`)
        return { ok: true, message: 'center renderer restarting after transport error' }
      }
      centerStatus.textContent = `Center KCL failed: ${message}`
      rootLogLine(`root kcl failed: ${message}`)
      return { ok: false, message }
    }
  }

  const renderProjectForDraft = (entryFilePath: string, draftKcl: string): RenderProject => {
    const hadPrevious = kclFiles.has(entryFilePath)
    const previous = kclFiles.get(entryFilePath)
    kclFiles.set(entryFilePath, draftKcl)
    const project = renderProjectFor(entryFilePath)
    if (hadPrevious) kclFiles.set(entryFilePath, previous!)
    else kclFiles.delete(entryFilePath)
    return project
  }

  const submitDraftWorkAgentProject = async (agent: Agent, currentRun: number, draftKcl: string, draftIndex: number): Promise<RenderResult> => {
    const entryFilePath = agent.id === rootAgentId ? rootFilePath : agent.filePath
    if (agent.id !== rootAgentId && useAgentCadSnapshots) {
      if (!isControllerWindow) return { ok: true, message: 'snapshot rendered by controller' }
      queueAgentSnapshot(agent, currentRun, renderProjectForDraft(entryFilePath, draftKcl), `draft KCL ${draftIndex}`, 'draft')
      return { ok: true, message: 'CAD snapshot queued' }
    }
    if (agent.id !== rootAgentId && !shouldRenderAgentLocally(agent)) {
      return { ok: true, message: 'draft render delegated to tile window' }
    }
    if (agent.id !== rootAgentId && agent.view === undefined && !ensureAgentView(agent, 'draft KCL stream')) {
      return { ok: true, message: 'viewer budget queued' }
    }
    const view = agent.id === rootAgentId ? centerView : agent.view
    if (kclFiles.size === 0 || view === undefined) return { ok: false, message: 'draft view not ready' }
    if (view.rtc === undefined) return { ok: true, message: 'draft renderer starting' }

    let failureMessage = ''
    let viewerFailure = false
    try {
      const project = renderProjectForDraft(entryFilePath, draftKcl)
      if (agent.id === rootAgentId) {
        await queueCenterProject(project, `root draft ${draftIndex}`)
      } else {
        await submitProject(view, project, (message) => {
          failureMessage = message
          if (!isViewerFailureMessage(message)) return
          viewerFailure = true
          scheduleAgentViewerReload(agent, message)
        })
      }
      return { ok: true }
    } catch (error: unknown) {
      if (
        viewerFailure ||
        isViewerFailureMessage(failureMessage || errorToMessage(error)) ||
        errorToMessage(error).includes('timed out')
      ) {
        const message = failureMessage || errorToMessage(error)
        if (agent.id === rootAgentId) scheduleCenterViewerReload(message)
        else scheduleAgentViewerReload(agent, message)
        return { ok: true, message: 'draft renderer restarting after transport error' }
      }
      return { ok: false, message: failureMessage || errorToMessage(error) }
    }
  }

  const queueDraftRender = (
    agent: Agent,
    currentRun: number,
    draftKcl: string,
    draftIndex: number,
    workRevision?: number,
  ) => {
    if (workRevision !== undefined && agentWorkRevisions.get(agent.id) !== workRevision) return
    if (!useAgentCadSnapshots) {
      broadcastWall({ type: 'agent:draft', agentId: agent.id, kcl: draftKcl, draftIndex })
    }
    if (agent.id === rootAgentId && draftIndex > maxRootDraftVisualizations) {
      appendWorkAgentLog(agent, `< draft KCL ${draftIndex}; reasoning streamed, intermediary CAD render skipped`, 'in')
      return
    }
    const chain = draftRenderChains.get(agent.id) ?? Promise.resolve()
    const next = chain.catch(() => {}).then(async () => {
      if (!active || !agentStillActive(agent, currentRun)) return
      if (workRevision !== undefined && agentWorkRevisions.get(agent.id) !== workRevision) return
      appendWorkAgentLog(agent, `< draft KCL ${draftIndex}; rendering intermediary`, 'in')
      const result = await submitDraftWorkAgentProject(agent, currentRun, draftKcl, draftIndex)
      if (!active || !agentStillActive(agent, currentRun)) return
      if (!result.ok) {
        appendWorkAgentLog(agent, `< draft KCL ${draftIndex} render rejected: ${result.message ?? 'unknown renderer error'}`)
      }
    })
    draftRenderChains.set(agent.id, next)
    void next.finally(() => {
      if (draftRenderChains.get(agent.id) === next) draftRenderChains.delete(agent.id)
    })
  }

  const updateInterfaceManifest = (agent: Agent, kcl: string) => {
    const manifest = extractInterfaceManifest(kcl)
    if (manifest.trim().length === 0) return
    interfaceManifests.set(agent.filePath, manifest)
    appendWorkAgentLog(agent, `< interface manifest captured for ${agent.filePath}`, 'in')
  }

  const interfaceManifestFor = (agent: Agent) => (
    interfaceManifests.get(agent.filePath) ?? fallbackInterfaceManifest(agent)
  )

  const reviewChildren = (agent: Agent) => graphChildren(agent.id)

  const importedAgentsFor = (agent: Agent) => (
    (agent.imports ?? [])
      .map(filePath => agentForFilePath(filePath))
      .filter((candidate): candidate is Agent => candidate !== undefined && candidate.id !== agent.id)
  )

  const importConsumersFor = (agent: Agent) => Array.from(agents.values())
    .filter(candidate => (
      candidate.kind === 'orchestrator' &&
      candidate.id !== agent.parentId &&
      (candidate.imports ?? []).includes(agent.filePath)
    ))

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const kclForGraphAgent = (agent: Agent) => (
    kclFiles.get(agent.id === rootAgentId ? rootFilePath : agent.filePath) ?? ''
  )

  const cleanBomBody = (source: string) => stripImportLines(source)
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
    .join('\n')

  const sharedReusableImportsFor = (agent: Agent) => importedAgentsFor(agent)
    .filter(imported => imported.kind === 'worker' && imported.scope === 'shared_part')

  const explicitBomQuantityForReusable = (source: string, reusable: Agent) => {
    const alias = aliasForFilePath(reusable.filePath).toLowerCase()
    const role = reusable.role.toLowerCase()
    const file = renderPathForFilePath(reusable.filePath).toLowerCase()
    for (const line of source.split('\n')) {
      const lower = line.toLowerCase()
      if (!lower.includes('bom')) continue
      if (!lower.includes(alias) && !lower.includes(role) && !lower.includes(file)) continue
      const quantity = lower.match(/\b(\d+)\s*x\b/)?.[1] ??
        lower.match(/\bx\s*(\d+)\b/)?.[1] ??
        lower.match(/\bquantity\s*[:=]\s*(\d+)\b/)?.[1]
      if (quantity !== undefined) return Number(quantity)
    }
    return undefined
  }

  const quantityForReusableImport = (consumer: Agent, reusable: Agent) => {
    const source = kclForGraphAgent(consumer)
    const explicitQuantity = explicitBomQuantityForReusable(source, reusable)
    if (explicitQuantity !== undefined) return explicitQuantity
    const body = cleanBomBody(source)
    if (body.trim().length === 0) return 0
    const alias = aliasForFilePath(reusable.filePath)
    const aliasPattern = escapeRegExp(alias)
    const lines = body.split('\n')
      .filter(line => !new RegExp(`\\bhide\\s*\\(\\s*${aliasPattern}\\b`, 'i').test(line))
    const searchable = lines.join('\n')
    const cloneCount = searchable.match(new RegExp(`\\bclone\\s*\\(\\s*${aliasPattern}\\b`, 'g'))?.length ?? 0
    if (cloneCount > 0) return cloneCount
    return new RegExp(`\\b${aliasPattern}\\b`).test(searchable) ? 1 : 0
  }

  const mergeBomUsage = (usage: Map<string, BomUsage>, item: BomUsage) => {
    const existing = usage.get(item.agent.id)
    if (existing === undefined) {
      usage.set(item.agent.id, { ...item })
      return
    }
    existing.quantity += item.quantity
  }

  const directBomUsageFor = (agent: Agent) => sharedReusableImportsFor(agent)
    .map((reusable): BomUsage => ({
      agent: reusable,
      quantity: quantityForReusableImport(agent, reusable),
    }))

  const rolledUpBomUsageFor = (agent: Agent, visited = new Set<string>()): BomUsage[] => {
    if (visited.has(agent.id) || agent.scope === 'shared_part') return []
    visited.add(agent.id)
    const usage = new Map<string, BomUsage>()
    directBomUsageFor(agent).forEach(item => mergeBomUsage(usage, item))
    graphChildren(agent.id)
      .filter(child => !isReusableLibraryAgent(child))
      .forEach((child) => {
        rolledUpBomUsageFor(child, visited).forEach(item => mergeBomUsage(usage, item))
      })
    return Array.from(usage.values())
      .sort((a, b) => b.quantity - a.quantity || a.agent.role.localeCompare(b.agent.role))
  }

  const bomSummaryForGraphNode = (agent: Agent, compact: boolean) => {
    if (agent.scope === 'shared_part') return 'BOM: reusable component'
    const usage = rolledUpBomUsageFor(agent)
    if (usage.length === 0) return ''
    const maxItems = compact ? 2 : 3
    const labels = usage.slice(0, maxItems).map(item => (
      `${item.quantity > 0 ? item.quantity : '?'}x ${titleCase(item.agent.role)}`
    ))
    const remainder = usage.length - labels.length
    return `BOM: ${labels.join(', ')}${remainder > 0 ? ` +${remainder}` : ''}`
  }

  const placementComponentsFor = (agent: Agent) => {
    const seen = new Set<string>()
    const directChildIds = new Set(reviewChildren(agent).map(child => child.id))
    return [...reviewChildren(agent), ...importedAgentsFor(agent)].filter((component) => {
      if (isReusableLibraryAgent(component)) return false
      if (component.status === 'error') return false
      if (!placementComponentReady(component)) return false
      if (seen.has(component.id)) return false
      if (!directChildIds.has(component.id) && component.kind === 'worker' && component.scope !== 'shared_part') return false
      seen.add(component.id)
      return true
    })
  }

  const childInterfaceContext = (agent: Agent) => {
    const children = placementComponentsFor(agent)
    if (children.length === 0) return ''
    return children.map(child => [
      `- ${aliasForFilePath(child.filePath)} from ${child.filePath}: ${child.role}`,
      interfaceManifestFor(child)
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n'),
    ].join('\n')).join('\n')
  }

  const reviewWorkerTargets = (agent: Agent): Agent[] => {
    const collect = (id: string): Agent[] => graphChildren(id)
      .flatMap(child => child.kind === 'worker' ? [child] : reviewWorkerTargets(child))
    const seen = new Set<string>()
    return [...collect(agent.id), ...importedAgentsFor(agent).filter(child => child.kind === 'worker')]
      .filter((child) => {
        if (seen.has(child.id)) return false
        seen.add(child.id)
        return true
      })
  }

  const reviewOrchestratorTargets = (agent: Agent): Agent[] => {
    const collect = (id: string): Agent[] => graphChildren(id)
      .flatMap(child => child.kind === 'orchestrator' ? [child, ...reviewOrchestratorTargets(child)] : [])
    return agent.id === rootAgentId ? [agent, ...collect(agent.id)] : [agent, ...collect(agent.id)]
  }

  const reviewFilesFor = (agent: Agent) => {
    const entryFilePath = agent.id === rootAgentId ? rootFilePath : agent.filePath
    const project = renderProjectFor(entryFilePath)
    const files = Object.fromEntries(project.files.entries()) as Record<string, string>
    if (entryFilePath !== rootFilePath) files[rootFilePath] = files[project.mainFilePath] ?? ''
    return files
  }

  const reviewInterfacesFor = (agent: Agent) => {
    const entryFilePath = agent.id === rootAgentId ? rootFilePath : agent.filePath
    return requestContextFor(entryFilePath).interfaces
  }

  const agentKclReady = (agent: Agent) => stripImportLines(kclFiles.get(agent.filePath) ?? '')
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, '').trim())
    .some(Boolean)

  const placementComponentReady = (agent: Agent) => (
    agent.status !== 'error' && agentKclReady(agent)
  )

  const workerBodyReady = (agent: Agent) => agent.status === 'error' || agentKclReady(agent)

  const pendingWorkerTargets = (agent: Agent) => reviewWorkerTargets(agent)
    .filter(child => !workerBodyReady(child))

  const failedWorkerTargets = (agent: Agent) => reviewWorkerTargets(agent)
    .filter(child => child.status === 'error')

  const placementReady = (agent: Agent) => placementComponentsFor(agent).length > 0

  const rankAgentTarget = (candidates: Agent[], request: ReworkRequest): RankedAgent | undefined => {
    if (candidates.length === 0) return undefined
    const targetText = request.target.toLowerCase()
    const fullText = `${request.target} ${request.instruction} ${request.reason}`.toLowerCase()
    const score = (candidate: Agent) => {
      const fields = [
        candidate.id,
        candidate.name,
        candidate.role,
        candidate.filePath,
        renderPathForFilePath(candidate.filePath),
      ].map(value => value.toLowerCase())
      let value = 0
      fields.forEach((field) => {
        if (targetText.includes(field)) value += 100
        if (fullText.includes(field)) value += 20
      })
      candidate.role.toLowerCase().split(/[^a-z0-9]+/).filter(part => part.length > 3).forEach((part) => {
        if (targetText.includes(part)) value += 30
        else if (fullText.includes(part)) value += 5
      })
      return value
    }
    const ranked = candidates
      .map(candidate => ({ candidate, score: score(candidate) }))
      .sort((a, b) => b.score - a.score)
    return ranked[0]
  }

  const rankWorkerReworkTarget = (parent: Agent, request: ReworkRequest) => (
    rankAgentTarget(reviewWorkerTargets(parent), request)
  )

  const rankOrchestratorReworkTarget = (parent: Agent, request: ReworkRequest) => (
    rankAgentTarget(reviewOrchestratorTargets(parent), request)
  )

  const findReworkTarget = (parent: Agent, request: ReworkRequest, fallbackChild: Agent) => {
    const ranked = rankWorkerReworkTarget(parent, request)
    return ranked?.score ? ranked.candidate : fallbackChild
  }

  const isPlacementRework = (request: ReworkRequest) => (
    /\b(assembly|assemble|place|placement|position|translate|rotate|align|axis convention|datum|origin|mate|layout|duplicate|stray|unassembled|integrat|import|clone|mirror|mirrored|symmetry|symmetric|pattern|array|radial|linear|spacing|pitch|bolt circle|hidden|unplaced|root|transform|coaxial)\b/i
      .test(`${request.target} ${request.reason} ${request.instruction}`)
  )

  const isGeometryRework = (request: ReworkRequest) => (
    /\b(solver|constraint|sketch|profile|hole|through-hole|cut|subtract|extrude|geometry|body|part|generate|create|empty|zero bytes|file|kcl|plate|bracket|support|fails execution|engine error|under-constrained)\b/i
      .test(`${request.target} ${request.reason} ${request.instruction}`)
  )

  const isOrchestratorOwnedRework = (request: ReworkRequest) => {
    const text = `${request.target} ${request.reason} ${request.instruction}`
    return isPlacementRework(request) ||
      /\b(parent applies|parent assembly|assembly file|placement layer|local axis|local datum|interface fit|not integrated|not placed|imported but not)\b/i.test(text) ||
      /\b(clone|translate|rotate|scale)\(/i.test(text)
  }

  const owningOrchestratorFor = (parent: Agent, request: ReworkRequest, fallbackChild: Agent) => {
    const rankedOrchestrator = rankOrchestratorReworkTarget(parent, request)
    if (rankedOrchestrator !== undefined && rankedOrchestrator.score > 0) return rankedOrchestrator.candidate
    const rankedWorker = rankWorkerReworkTarget(parent, request)
    if (rankedWorker !== undefined && rankedWorker.score > 0) {
      return graphNode(rankedWorker.candidate.parentId) ?? parent
    }
    if (fallbackChild.kind === 'worker') return graphNode(fallbackChild.parentId) ?? parent
    return fallbackChild
  }

  const placementTargetFor = (parent: Agent) => {
    return parent
  }

  const placementInstructionFor = (parent: Agent, changedChild: Agent, extra = '') => {
    const childImports = placementComponentsFor(parent)
      .map(child => `- ${aliasForFilePath(child.filePath)} from ${child.filePath}: ${child.role}`)
      .join('\n')
    const interfaces = childInterfaceContext(parent)
    const failedChildren = failedWorkerTargets(parent)
      .map(child => `- ${child.role} (${child.filePath})`)
      .join('\n')
    return [
      `Update ${parent.name}'s assembly placement layer after ${changedChild.role} changed.`,
      'This is an incremental assembly update. Place every currently available import now; do not wait for pending children and do not invent stand-ins for them.',
      "Use imported child aliases, clone(), hide(), translate(), rotate(), scale(), and appearance() only.",
      "You own mirrored, symmetric, radial-pattern, and linear-pattern placement. Express those by cloning imported aliases and applying explicit translate/rotate/scale transforms in this assembly file.",
      "Do not push repeated placement down into worker part files. Workers model one canonical part; this orchestrator creates left/right instances, bolt circles, rib arrays, repeated rollers/pins/washers, and other patterns.",
      "For mirrored/patterned placements, include auditable comments with source alias, count, spacing/angle, mirror plane or symmetry axis, and target mate points.",
      "Do not create or modify part geometry. Do not use sketches, profiles, lines, circles, extrude, subtract, or boolean modeling tools.",
      "Place only direct child/sub-assembly imports and explicit shared reusable imports listed below. Do not place non-direct worker descendants or grandchild part files in this parent assembly.",
      "If a direct child/sub-assembly import has no usable return value, leave this parent partial and record that child in placement_warnings instead of reaching through to import/place its children.",
      "Return one renderable aggregate as the final expression so this assembly can itself be imported and placed by its parent.",
      "Before choosing transforms, inspect the child KCL and the interface manifests below for local origins, axes, bounding boxes, mate points, and dimensions.",
      "Place children by aligning named mate points and axes. If a child is missing an interface manifest, infer only from its KCL and leave a concise interface warning in the assembly manifest.",
      "For every shared/reusable component import you place, add a concise comment near the placement in the form `// BOM: <quantity>x <alias> (<role>)` so the graph can display the bill of materials.",
      "If a child is listed as failed, do not import or place it. Continue the partial assembly and record the omission in placement_warnings.",
      "Keep each direct child/sub-assembly as a separate imported component and place the components into one coherent assembly.",
      childImports ? `Child imports:\n${childImports}` : "",
      failedChildren ? `Failed children to omit from this placement update:\n${failedChildren}` : "",
      interfaces ? `Child interface manifests:\n${interfaces}` : "",
      extra,
    ].filter(Boolean).join("\n")
  }

  const scheduleOrchestratorPlacement = (parent: Agent, changedChild: Agent, extraInstruction = '') => {
    if (!active || runPhase !== 'running' || parent.kind !== 'orchestrator') return
    if (!placementReady(parent)) {
      appendWorkAgentLog(parent, `< placement waiting for first renderable direct child`, 'in')
      return
    }
    const currentRun = runId
    const existing = placementTimers.get(parent.id)
    if (existing !== undefined) window.clearTimeout(existing)
    const timer = window.setTimeout(() => {
      placementTimers.delete(parent.id)
      if (!agentStillActive(parent, currentRun)) return
      appendWorkAgentLog(parent, `-> placement update after ${changedChild.role}`, 'out')
      void requestAgentWork(parent, currentRun, '', 0, placementInstructionFor(parent, changedChild, extraInstruction))
    }, 1400)
    placementTimers.set(parent.id, timer)
  }

  const requestOrchestratorReview = async (
    parent: Agent,
    changedChild: Agent,
    currentRun: number,
  ): Promise<boolean> => {
    if (currentRun !== runId || !active || runPhase !== 'running') return false

    const children = reviewWorkerTargets(parent)
    const readyChildren = children.filter(workerBodyReady)
    if (readyChildren.length === 0) {
      reviewLogLine(parent, '< visual review waiting for the first child KCL result', 'in')
      return true
    }
    const pendingChildren = pendingWorkerTargets(parent)
    if (pendingChildren.length > 0) {
      reviewLogLine(parent, `< partial visual review: ${readyChildren.length}/${children.length} child KCL results ready`, 'in')
    }

    const reviewCount = parent.id === rootAgentId ? rootReviewRounds : (parent.reviewRounds ?? 0)
    if (parent.id === rootAgentId) rootReviewRounds += 1
    else parent.reviewRounds = reviewCount + 1
    reviewLogLine(parent, `-> visual review ${reviewCount + 1} after ${changedChild.role} update`, 'out')

    try {
      const review = await requestReviewStream(parent, currentRun, {
          sessionId: activeSessionId,
          prompt: promptInput.value.trim() || defaultPrompt,
          agent: {
            id: parent.id,
            parentId: parent.parentId,
            kind: parent.kind,
            scope: parent.scope,
            name: parent.name,
            role: parent.role,
            instruction: parent.instruction,
            filePath: parent.id === rootAgentId ? rootFilePath : parent.filePath,
            imports: parent.imports ?? [],
          },
          child: {
            id: changedChild.id,
            name: changedChild.name,
            role: changedChild.role,
            filePath: changedChild.filePath,
            scope: changedChild.scope,
          },
          children: readyChildren.map(child => ({
            id: child.id,
            name: child.name,
            role: child.role,
            filePath: child.filePath,
            scope: child.scope,
            imports: child.imports ?? [],
          })),
          allAgents: Array.from(agents.values()).map(agent => ({
            id: agent.id,
            parentId: agent.parentId,
            kind: agent.kind,
            scope: agent.scope,
            name: agent.name,
            role: agent.role,
            filePath: agent.filePath,
            imports: agent.imports ?? [],
          })),
          files: reviewFilesFor(parent),
          interfaces: reviewInterfacesFor(parent),
      })
      if (currentRun !== runId || !active) return false

      review.dialog?.slice(-2).forEach(line => reviewLogLine(parent, `< review ws: ${line}`, 'in'))
      reviewLogLine(parent, `< visual review: ${review.summary}`, 'in')
      const bomUpdates = applyBomReview(parent, review.bom, currentRun)
      if (bomUpdates > 0) {
        reviewLogLine(parent, `< BOM review applied ${bomUpdates} graph update${bomUpdates === 1 ? '' : 's'}`, 'in')
      }
      if (review.rework.length === 0) {
        reviewLogLine(parent, '< visual review: no child rework requested', 'in')
        return true
      }

      review.rework.forEach((item) => {
        const instruction = `${item.reason ? `${item.reason}: ` : ''}${item.instruction}`
        const rankedTarget = rankWorkerReworkTarget(parent, item)
        const hasWorkerTarget = rankedTarget !== undefined && rankedTarget.score > 0
        if (isOrchestratorOwnedRework(item) && (!isGeometryRework(item) || isPlacementRework(item))) {
          const placementTarget = placementTargetFor(owningOrchestratorFor(parent, item, changedChild))
          if (placementTarget === undefined) {
            reviewLogLine(parent, '< placement rework skipped; no orchestrator target')
            return
          }
          reviewLogLine(parent, `< dispatch placement rework to ${placementTarget.name}: ${instruction}`, 'in')
          scheduleOrchestratorPlacement(placementTarget, changedChild, instruction)
          return
        }
        const target = hasWorkerTarget ? rankedTarget.candidate : findReworkTarget(parent, item, changedChild)
        reviewLogLine(parent, `< dispatch geometry rework to ${target.name}: ${instruction}`, 'in')
        if (target.kind !== 'worker') {
          reviewLogLine(parent, `< geometry rework skipped for non-worker target ${target.name}`)
          return
        }
        appendAgentLog(target, `-> orchestrator rework: ${instruction}`, 'out')
        void requestAgentWork(target, currentRun, '', 0, instruction)
      })
      return true
    } catch (error: unknown) {
      if (currentRun !== runId || !active) return false
      reviewLogLine(parent, `< visual review failed: ${errorToMessage(error)}`)
      return false
    }
  }

  const reviewRevisionFor = (parent: Agent) => {
    let hash = 2166136261
    const append = (value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
    }
    const files = reviewFilesFor(parent)
    Object.keys(files).sort().forEach((filePath) => {
      append(filePath)
      append(files[filePath] ?? '')
    })
    const interfaces = reviewInterfacesFor(parent)
    Object.keys(interfaces).sort().forEach((filePath) => {
      append(filePath)
      append(interfaces[filePath] ?? '')
    })
    reviewWorkerTargets(parent).forEach((agent) => append(`${agent.id}:${agent.status}:${agent.filePath}`))
    return `${Object.keys(files).length}:${(hash >>> 0).toString(16)}`
  }

  function drainReviewQueue() {
    while (activeReviewRequests.size < maxConcurrentReviews && reviewQueue.size > 0) {
      const next = reviewQueue.entries().next().value as [string, QueuedReview] | undefined
      if (next === undefined) return
      const [parentId, request] = next
      reviewQueue.delete(parentId)
      if (!agentStillActive(request.parent, request.currentRun) || runPhase !== 'running') continue
      if (completedReviewRevisions.get(parentId) === request.revision) continue

      activeReviewRequests.add(parentId)
      activeReviewRevisions.set(parentId, request.revision)
      void requestOrchestratorReview(request.parent, request.changedChild, request.currentRun)
        .then((completed) => {
          if (completed && request.currentRun === runId) {
            completedReviewRevisions.set(parentId, request.revision)
          }
        })
        .finally(() => {
          activeReviewRequests.delete(parentId)
          activeReviewRevisions.delete(parentId)
          scheduleRunCompletionCheck()
          drainReviewQueue()
        })
    }
  }

  const enqueueOrchestratorReview = (parent: Agent, changedChild: Agent, currentRun: number) => {
    if (!agentStillActive(parent, currentRun) || runPhase !== 'running') return
    const revision = reviewRevisionFor(parent)
    if (
      completedReviewRevisions.get(parent.id) === revision ||
      activeReviewRevisions.get(parent.id) === revision ||
      reviewQueue.get(parent.id)?.revision === revision
    ) return
    reviewQueue.set(parent.id, { parent, changedChild, currentRun, revision })
    drainReviewQueue()
  }

  const scheduleOrchestratorReview = (parent: Agent, changedChild: Agent) => {
    if (!active || runPhase !== 'running') return
    const currentRun = runId
    const existing = reviewTimers.get(parent.id)
    if (existing !== undefined) window.clearTimeout(existing)
    const timer = window.setTimeout(() => {
      reviewTimers.delete(parent.id)
      enqueueOrchestratorReview(parent, changedChild, currentRun)
    }, 1800)
    reviewTimers.set(parent.id, timer)
  }

  const refreshAncestorProjects = (agent: Agent) => {
    let parentId = agent.parentId
    while (parentId !== '') {
      if (parentId === rootAgentId) {
        syncRootFileImports()
        scheduleRootProjectSubmit()
        rootLogLine(`< merged ${agent.role} into root assembly`, 'in')
        const rootAgent = graphNode(rootAgentId)
        if (rootAgent !== undefined) {
          if (placementReady(rootAgent)) {
            scheduleOrchestratorPlacement(rootAgent, agent)
            scheduleOrchestratorReview(rootAgent, agent)
          } else {
            rootLogLine('< root placement waiting for a renderable direct sub-assembly', 'in')
          }
        }
        break
      }
      const parent = agents.get(parentId)
      if (parent === undefined) break
      if (isReusableLibraryAgent(parent)) {
        syncReusableLibraryMetadata(parent)
        appendAgentLog(parent, `< BOM registry updated: ${agent.role}`, 'in')
        break
      }
      appendAgentLog(parent, `< merged child update: ${agent.role}`, 'in')
      syncAssemblyFileImports(parent)
      void submitAgentProject(parent)
      if (placementReady(parent)) {
        scheduleOrchestratorPlacement(parent, agent)
        scheduleOrchestratorReview(parent, agent)
      } else {
        appendAgentLog(parent, '< placement waiting for a renderable direct child', 'in')
      }
      parentId = parent.parentId
    }

    importConsumersFor(agent).forEach((consumer) => {
      appendAgentLog(consumer, `< ${agent.scope === 'shared_part' ? 'shared component' : 'import dependency'} ready: ${agent.role}`, 'in')
      void submitAgentProject(consumer)
      if (placementReady(consumer)) {
        scheduleOrchestratorPlacement(consumer, agent)
        scheduleOrchestratorReview(consumer, agent)
      } else {
        appendAgentLog(consumer, '< placement waiting for a renderable direct child', 'in')
      }
    })
  }

  const markAgentFailedAndRefreshAncestors = (agent: Agent, currentRun: number, reason: string) => {
    if (!agentStillActive(agent, currentRun)) return
    if (agent.lastGoodKcl !== undefined && agent.lastGoodKcl.trim().length > 0) {
      kclFiles.set(agent.filePath, agent.lastGoodKcl)
      updateInterfaceManifest(agent, agent.lastGoodKcl)
      setWorkAgentStatus(agent, 'complete')
      if (agent.lastGoodSnapshotUrl !== undefined && agent.snapshotUrl !== agent.lastGoodSnapshotUrl) {
        setAgentSnapshotState(agent, 'ready', 'restored last good CAD snapshot')
        setAgentSnapshot(agent, agent.lastGoodSnapshotUrl)
      }
      appendWorkAgentLog(agent, `< update failed; retained last validated KCL${reason ? ` (${reason})` : ''}`, 'in')
      refreshAncestorProjects(agent)
      return
    }
    let parentId = agent.parentId
    while (parentId !== '') {
      if (parentId === rootAgentId) {
        syncRootFileImports()
        rootLogLine(`< degraded assembly: omitting failed ${agent.role}${reason ? ` (${reason})` : ''}`, 'in')
        const rootAgent = graphNode(rootAgentId)
        if (rootAgent !== undefined) {
          if (placementReady(rootAgent)) {
            scheduleOrchestratorPlacement(rootAgent, agent, `Omit failed child ${agent.role}; record the omission in placement_warnings.`)
            scheduleOrchestratorReview(rootAgent, agent)
          } else {
            rootLogLine('< root placement waiting for a renderable direct sub-assembly', 'in')
          }
        }
        break
      }

      const parent = agents.get(parentId)
      if (parent === undefined) break
      if (isReusableLibraryAgent(parent)) {
        syncReusableLibraryMetadata(parent)
        appendAgentLog(parent, `< BOM registry marked failed component: ${agent.role}${reason ? ` (${reason})` : ''}`, 'in')
        break
      }

      syncAssemblyFileImports(parent)
      appendAgentLog(parent, `< degraded assembly: omitting failed ${agent.role}${reason ? ` (${reason})` : ''}`, 'in')
      void submitAgentProject(parent)
      if (placementReady(parent)) {
        scheduleOrchestratorPlacement(parent, agent, `Omit failed child ${agent.role}; record the omission in placement_warnings.`)
        scheduleOrchestratorReview(parent, agent)
      } else {
        appendAgentLog(parent, '< placement waiting for a renderable direct child', 'in')
      }
      parentId = parent.parentId
    }

    importConsumersFor(agent).forEach((consumer) => {
      if (agent.scope === 'shared_part') {
        updateAgent(consumer, { imports: (consumer.imports ?? []).filter(filePath => filePath !== agent.filePath) })
        syncAssemblyFileImports(consumer)
        appendAgentLog(consumer, `< removed failed shared component import: ${agent.role}`, 'in')
      } else {
        appendAgentLog(consumer, `< degraded import dependency: ${agent.role}${reason ? ` (${reason})` : ''}`, 'in')
      }
      void submitAgentProject(consumer)
      if (placementReady(consumer)) {
        scheduleOrchestratorPlacement(consumer, agent, `Omit failed imported dependency ${agent.role}; record the omission in placement_warnings.`)
        scheduleOrchestratorReview(consumer, agent)
      } else {
        appendAgentLog(consumer, '< placement waiting for a renderable direct child', 'in')
      }
    })
  }

  const createAgentPanel = (agent: Agent) => {
    const panel = document.createElement('section')
    panel.classList.add('agent-card', `agent-${agent.kind}`)
    panel.style.setProperty('--agent-color', agent.color)
    panel.dataset.status = agent.status

    const header = document.createElement('header')
    header.classList.add('agent-header')

    const title = document.createElement('div')
    title.classList.add('agent-title')
    title.textContent = agent.name

    const role = document.createElement('div')
    role.classList.add('agent-role')
    role.textContent = agent.role

    const status = document.createElement('div')
    status.classList.add('agent-status')
    status.textContent = agent.status
    status.dataset.status = agent.status
    agent.statusElement = status

    const titleBlock = document.createElement('div')
    titleBlock.append(title, role)
    header.append(titleBlock, status)

    const viewerSlot = document.createElement('div')
    viewerSlot.classList.add('agent-viewer-slot')
    agent.viewerSlot = viewerSlot

    const placeholder = document.createElement('div')
    placeholder.classList.add('agent-viewer-placeholder')
    placeholder.textContent = 'Awaiting Zookeeper assignment'
    agent.viewPlaceholder = placeholder
    viewerSlot.appendChild(placeholder)

    const log = document.createElement('div')
    log.classList.add('agent-log', 'websocket-log')
    agent.logElement = log

    if (agent.kind === 'worker') {
      const body = document.createElement('div')
      body.classList.add('agent-body', 'worker-body')
      body.append(viewerSlot, log)
      panel.append(header, body)
    } else {
      const graph = document.createElement('div')
      graph.classList.add('agent-subgraph')
      agent.graphElement = graph

      const body = document.createElement('div')
      body.classList.add('agent-body', 'sub-orchestrator-body')
      body.append(viewerSlot, graph, log)
      panel.append(header, body)
    }

    agent.element = panel
  }

  const viewerPlaceholderText = (agent: Agent) => {
    if (agent.status === 'running' || agent.status === 'reviewing') return 'Awaiting Zookeeper result'
    if (agent.status === 'complete') {
      if (isReusableLibraryAgent(agent)) return 'KCL complete - metadata only'
      if (agent.snapshotState === 'error') return 'KCL propagated - visual unavailable'
      if (agent.snapshotState === 'rendering') return 'KCL propagated - rendering visual'
      if (agent.snapshotState === 'persisting') return 'KCL propagated - saving visual'
      if (agent.snapshotState === 'queued' || agent.snapshotUrl === undefined) {
        return 'KCL propagated - visual queued'
      }
      return 'Zookeeper result ready'
    }
    if (agent.status === 'error') return 'Zookeeper error'
    return 'Awaiting Zookeeper assignment'
  }

  const updateViewerPlaceholderText = (agent: Agent) => {
    if (agent.viewPlaceholder === undefined) return
    if (agent.viewerSlot?.classList.contains('agent-viewer-queued')) return
    agent.viewPlaceholder.textContent = viewerPlaceholderText(agent)
  }

  const setAgentStatus = (agent: Agent, status: AgentStatus) => {
    const previousStatus = agent.status
    agent.lastActivityAtMs = Date.now()
    const isTimedStatus = (value: AgentStatus) => value === 'running' || value === 'reviewing'
    if (previousStatus !== status) {
      const now = Date.now()
      if (isTimedStatus(previousStatus) && agent.activeStartedAtMs !== undefined) {
        agent.elapsedMs = (agent.elapsedMs ?? 0) + Math.max(0, now - agent.activeStartedAtMs)
        agent.activeStartedAtMs = undefined
      }
      if (isTimedStatus(status)) {
        agent.activeStartedAtMs = now
      }
    }
    agent.status = status
    if (agent.statusElement !== undefined) {
      agent.statusElement.textContent = status
      agent.statusElement.dataset.status = status
    }
    agent.element?.setAttribute('data-status', status)
    updateViewerPlaceholderText(agent)
    updateAggregateTime()
    renderAllGraphs()
    broadcastWall({ type: 'agent:status', agentId: agent.id, status })
    scheduleRunCompletionCheck()
  }

  const appendAgentLog = (agent: Agent, line: string, direction: 'in' | 'out' | 'sys' = 'sys') => {
    agent.lastActivityAtMs = Date.now()
    if (agent.logElement !== undefined) writeLog(agent.logElement, line, direction)
    broadcastWall({ type: 'agent:log', agentId: agent.id, line, direction })
  }

  const startAgentView = (agent: Agent) => {
    if (agent.viewStarted) return
    agent.viewStarted = true
    agent.view?.start()
  }

  const startCameraInspection = (agent: Agent) => {
    void agent
  }

  const remainingWallAgentSlots = () => Math.max(0, maxWallAgents - agents.size)

  const logWallAgentCap = () => {
    if (capacityWarningRun === runId) return
    capacityWarningRun = runId
    rootLogLine(`< wall hard cap reached: ${maxWallAgents} total agents; further BOM children will not be created`, 'in')
  }

  const addAgent = (agent: Agent): boolean => {
    if (agents.has(agent.id)) return true
    if (agents.size >= maxWallAgents) {
      logWallAgentCap()
      return false
    }
    agents.set(agent.id, agent)
    if (
      !isWallTileMode ||
      (!isControllerWindow && agentTileIndex(agent) === wallTileIndex)
    ) {
      createAgentPanel(agent)
    }
    layoutAgents()
    renderAllGraphs()
    broadcastWall({
      type: 'agent:add',
      agent: {
        id: agent.id,
        parentId: agent.parentId,
        kind: agent.kind,
        scope: agent.scope,
        name: agent.name,
        role: agent.role,
        instruction: agent.instruction,
        filePath: agent.filePath,
        imports: agent.imports ?? [],
        source: agent.source,
        color: agent.color,
        status: agent.status,
      },
    })
    rootLogLine(`< zookeeper.spawn ${agent.name}`, 'in')
    appendAgentLog(agent, `assigned parent: ${graphNode(agent.parentId)?.name ?? 'unknown'}`)
    appendAgentLog(agent, `scope: ${agent.scope ?? (agent.kind === 'orchestrator' ? 'assembly' : 'part')}`)
    appendAgentLog(agent, `role: ${agent.role}`)
    appendAgentLog(agent, `instruction: ${agent.instruction}`)
    appendAgentLog(agent, `file: ${agent.filePath}`)
    if ((agent.imports ?? []).length > 0) appendAgentLog(agent, `imports: ${(agent.imports ?? []).map(renderPathForFilePath).join(', ')}`)
    setAgentStatus(agent, 'starting')
    return true
  }

  const updateAgent = (agent: Agent, update: Partial<Pick<Agent, 'parentId' | 'imports' | 'instruction' | 'role'>>) => {
    if (update.parentId !== undefined) agent.parentId = update.parentId
    if (update.imports !== undefined) agent.imports = [...new Set(update.imports)]
    if (update.instruction !== undefined) agent.instruction = update.instruction
    if (update.role !== undefined) {
      agent.role = update.role
      agent.element?.querySelector('.agent-role')?.replaceChildren(document.createTextNode(agent.role))
    }
    layoutAgents()
    renderAllGraphs()
    broadcastWall({
      type: 'agent:update',
      agentId: agent.id,
      parentId: update.parentId,
      imports: update.imports,
      instruction: update.instruction,
      role: update.role,
    })
  }

  const updateProjectFile = (filePath: string, kcl: string) => {
    if (kclFiles.get(filePath) === kcl) return
    kclFiles.set(filePath, kcl)
    completionCandidateAtMs = undefined
    if (!useAgentCadSnapshots) broadcastWall({ type: 'project:file', filePath, kcl })
    scheduleRunCompletionCheck()
  }

  const syncReusableLibraryMetadata = (library: Agent) => {
    const sharedChildren = graphChildren(library.id)
    const lines = [
      '// ZOOKEEPER_BOM_LIBRARY',
      '// Metadata-only shared component registry for the wall run.',
      '// This file is not imported into renderable assemblies.',
      ...sharedChildren.flatMap(child => [
        `// component: ${child.role}`,
        `// file: ${child.filePath}`,
        `// status: ${child.status}`,
        ...(interfaceManifests.has(child.filePath)
          ? interfaceManifests.get(child.filePath)!.split('\n').slice(0, 12).map(line => `//   ${line}`)
          : []),
      ]),
      '// /ZOOKEEPER_BOM_LIBRARY',
      '',
    ]
    updateProjectFile(library.filePath, lines.join('\n'))
  }

  const assemblyChildFiles = (agent: Agent) => graphChildren(agent.id)
    .filter(child => !isReusableLibraryAgent(child))
    .filter(placementComponentReady)
    .map(child => child.filePath)

  const allowedAssemblyImports = (agent: Agent) => (agent.imports ?? [])
    .filter((filePath) => {
      const dependency = agentForFilePath(filePath)
      return (
        dependency === undefined ||
        dependency.parentId === agent.id ||
        dependency.scope === 'shared_part'
      )
    })

  const hasVisibleChildPlacement = (body: string, filePath: string) => {
    const alias = escapeRegExp(aliasForFilePath(filePath))
    const code = body
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n')
    return new RegExp(
      `\\bclone\\s*\\(\\s*${alias}\\s*\\)|\\b${alias}\\b\\s*\\|>|=\\s*${alias}\\b`,
    ).test(code)
  }

  const directChildComposition = (filePaths: string[], body: string) => {
    const missingFiles = [...new Set(filePaths)]
      .filter(filePath => !hasVisibleChildPlacement(body, filePath))
    if (missingFiles.length === 0) return ''
    const clonedChildren = missingFiles
      .map(filePath => `  clone(${aliasForFilePath(filePath)}),`)
      .join('\n')
    return [
      directAssemblyBlockStart,
      '// Temporary identity composition for ready direct children.',
      '// The parent Zookeeper placement pass replaces each entry with its own transform.',
      'wallDirectChildren = [',
      clonedChildren,
      ']',
      'wallDirectChildren',
      directAssemblyBlockEnd,
    ].join('\n')
  }

  const assemblyFileWithCurrentChildren = (
    currentFile: string,
    directChildFiles: string[],
    additionalImports: string[] = [],
  ) => {
    const body = stripDirectAssemblyBlock(stripImportLines(currentFile)).trim()
    const importFiles = [...new Set([...directChildFiles, ...additionalImports])]
    const composition = directChildComposition(directChildFiles, body)
    return [
      mainFileFor(importFiles).trimEnd(),
      body,
      composition,
    ].filter(Boolean).join('\n\n').concat('\n')
  }

  const syncAssemblyFileImports = (agent: Agent) => {
    if (isReusableLibraryAgent(agent)) {
      syncReusableLibraryMetadata(agent)
      return
    }
    const filePath = agent.id === rootAgentId ? rootFilePath : agent.filePath
    const childFiles = assemblyChildFiles(agent)
    updateProjectFile(filePath, assemblyFileWithCurrentChildren(
      kclFiles.get(filePath) ?? '',
      childFiles,
      allowedAssemblyImports(agent),
    ))
  }

  const syncRootFileImports = () => {
    const topLevelFiles = assemblyChildFiles(graphNode(rootAgentId)!)
    updateProjectFile(rootFilePath, assemblyFileWithCurrentChildren(
      kclFiles.get(rootFilePath) ?? '',
      topLevelFiles,
      Array.from(rootImports),
    ))
  }

  const nextAgentSequence = (kind: AgentKind) => {
    const prefix = kind === 'orchestrator' ? 'sub-orchestrator-' : 'worker-'
    const maxSequence = Array.from(agents.values()).reduce((max, agent) => {
      if (!agent.id.startsWith(prefix)) return max
      return Math.max(max, Number(sequenceFromId(agent.id) ?? 0))
    }, 0)
    return maxSequence + 1
  }

  const findReusableLibraryAgent = () => Array.from(agents.values())
    .find(agent => isReusableLibraryAgent(agent))

  const ensureReusableLibraryAgent = (): Agent | undefined => {
    const existing = findReusableLibraryAgent()
    if (existing !== undefined) return existing
    if (remainingWallAgentSlots() < 1) {
      logWallAgentCap()
      return undefined
    }
    const sequence = nextAgentSequence('orchestrator')
    const id = `sub-orchestrator-${String(sequence).padStart(4, '0')}`
    const agent: Agent = {
      id,
      parentId: rootAgentId,
      kind: 'orchestrator',
      scope: 'assembly',
      name: `Zookeeper Sub-Orchestrator ${String(sequence).padStart(4, '0')}`,
      role: 'reusable component library',
      instruction: 'Own canonical shared component files for BOM reuse. Do not create assembly placement; child workers generate one reusable component each.',
      color: agentColors[agents.size % agentColors.length]!,
      status: 'queued',
      filePath: `generated/reusable-component-library-${String(sequence).padStart(4, '0')}.kcl`,
      imports: [],
      source: activeSource,
    }
    plannedAgentCount += 1
    updateProjectFile(agent.filePath, '')
    if (!addAgent(agent)) return undefined
    syncReusableLibraryMetadata(agent)
    setAgentStatus(agent, 'complete')
    syncRootFileImports()
    rootLogLine('< BOM graph update: added metadata-only reusable component library', 'in')
    return agent
  }

  const findSharedAgentFor = (component: string) => {
    const normalized = component.toLowerCase()
    return Array.from(agents.values()).find(agent => (
      agent.scope === 'shared_part' &&
      (
        agent.role.toLowerCase() === normalized ||
        agent.filePath.toLowerCase().includes(slugLabel(component)) ||
        normalized.includes(agent.role.toLowerCase()) ||
        agent.role.toLowerCase().includes(normalized)
      )
    ))
  }

  const createSharedComponentAgent = (request: BomSharedComponentRequest, currentRun: number): Agent | undefined => {
    const existing = findSharedAgentFor(request.role)
    if (existing !== undefined) return existing
    const library = findReusableLibraryAgent()
    const requiredSlots = library === undefined ? 2 : 1
    if (remainingWallAgentSlots() < requiredSlots) {
      logWallAgentCap()
      return undefined
    }
    const ensuredLibrary = library ?? ensureReusableLibraryAgent()
    if (ensuredLibrary === undefined) return undefined
    const sequence = nextAgentSequence('worker')
    const padded = String(sequence).padStart(4, '0')
    const role = request.role.trim() || 'shared component'
    const agent: Agent = {
      id: `worker-${padded}`,
      parentId: ensuredLibrary.id,
      kind: 'worker',
      scope: 'shared_part',
      name: `Zookeeper Worker ${padded}`,
      role,
      instruction: [
        request.instruction || `Generate one canonical reusable ${role}.`,
        'This is a BOM/shared-library component. Model exactly one reusable instance, not a set or repeated pattern.',
        'Expose mate points, local axes, symmetry plane/axis, and reuse guidance so orchestrators can clone, mirror, and pattern it.',
        request.reason ? `Reason: ${request.reason}` : '',
      ].filter(Boolean).join(' '),
      color: agentColors[agents.size % agentColors.length]!,
      status: 'queued',
      filePath: `generated/library/${slugLabel(role)}-${padded}.kcl`,
      imports: [],
      source: activeSource,
    }
    plannedAgentCount += 1
    updateProjectFile(agent.filePath, '')
    if (!addAgent(agent)) return undefined
    syncReusableLibraryMetadata(ensuredLibrary)
    syncRootFileImports()
    rootLogLine(`< BOM graph update: added shared component ${role}`, 'in')
    after(650, () => {
      if (!agentStillActive(agent, currentRun)) return
      void requestAgentWork(agent, currentRun)
    })
    return agent
  }

  const findConsumerAgent = (text: string, fallback: Agent) => {
    const candidates = Array.from(agents.values())
      .filter(agent => (
        agent.kind === 'orchestrator' &&
        agent.scope !== 'shared_part' &&
        !/\b(reusable|shared|library|catalog|standard)\b/i.test(agent.role)
      ))
    const ranked = rankAgentTarget(candidates, {
      target: text,
      instruction: text,
      reason: text,
    })
    return ranked !== undefined && ranked.score > 0 ? ranked.candidate : fallback
  }

  const addImportToConsumer = (consumer: Agent, shared: Agent, reason = '') => {
    if (consumer.kind !== 'orchestrator') return
    if (consumer.id === rootAgentId) {
      if (rootImports.has(shared.filePath)) return
      rootImports.add(shared.filePath)
      syncRootFileImports()
      scheduleRootProjectSubmit()
      rootLogLine(`< BOM graph update: root imports ${shared.role}${reason ? ` (${reason})` : ''}`, 'in')
      return
    }
    const imports = [...new Set([...(consumer.imports ?? []), shared.filePath])]
    if ((consumer.imports ?? []).includes(shared.filePath)) return
    updateAgent(consumer, { imports })
    syncAssemblyFileImports(consumer)
    appendAgentLog(consumer, `< BOM import added: ${shared.role}${reason ? ` (${reason})` : ''}`, 'in')
    rootLogLine(`< BOM graph update: ${consumer.role} imports ${shared.role}`, 'in')
    void submitAgentProject(consumer)
    if (placementReady(consumer)) {
      scheduleOrchestratorPlacement(consumer, shared, reason)
      scheduleOrchestratorReview(consumer, shared)
    }
    scheduleRootProjectSubmit()
  }

  const applyBomReview = (parent: Agent, bom: BomReviewResponse | undefined, currentRun: number) => {
    if (bom === undefined) return 0
    let applied = 0

    ;(bom.sharedComponents ?? []).forEach((request) => {
      const role = request.role.trim()
      if (role.length === 0) return
      const sharedAgent = createSharedComponentAgent({ ...request, role }, currentRun)
      if (sharedAgent === undefined) {
        reviewLogLine(parent, `< BOM review deferred shared ${role}: wall agent cap reached`, 'in')
        return
      }
      const consumers = (request.consumers ?? []).length > 0 ? request.consumers : [parent.role]
      consumers.forEach((consumerText) => {
        const consumer = findConsumerAgent(consumerText, parent)
        addImportToConsumer(consumer, sharedAgent, request.reason)
      })
      reviewLogLine(parent, `< BOM review: shared ${role}${request.reason ? ` (${request.reason})` : ''}`, 'in')
      applied += 1
    })

    ;(bom.importUpdates ?? []).forEach((request) => {
      const component = request.component.trim()
      const consumerText = request.consumer.trim()
      if (component.length === 0 || consumerText.length === 0) return
      const sharedAgent = findSharedAgentFor(component) ?? createSharedComponentAgent({
        role: component,
        reason: request.reason,
        instruction: `Generate one canonical reusable ${component}. Model exactly one instance for BOM reuse.`,
        consumers: [consumerText],
      }, currentRun)
      if (sharedAgent === undefined) {
        reviewLogLine(parent, `< BOM review deferred import ${component}: wall agent cap reached`, 'in')
        return
      }
      const consumer = findConsumerAgent(consumerText, parent)
      addImportToConsumer(consumer, sharedAgent, request.reason)
      reviewLogLine(parent, `< BOM review: ${consumer.role} should import ${sharedAgent.role}${request.reason ? ` (${request.reason})` : ''}`, 'in')
      applied += 1
    })

    if (applied > 0) {
      layoutAgents()
      renderAllGraphs()
      syncRootFileImports()
    }
    return applied
  }

  const resolveBomImport = (reference: string, spawned: Map<string, Agent>) => {
    const normalized = reference.trim().toLowerCase()
    if (normalized.length === 0) return undefined
    const local = spawned.get(normalized)
    if (local !== undefined) return local
    return Array.from(agents.values()).find(candidate => (
      candidate.id.toLowerCase() === normalized ||
      candidate.role.toLowerCase() === normalized ||
      candidate.filePath.toLowerCase() === normalized ||
      renderPathForFilePath(candidate.filePath).toLowerCase() === normalized ||
      slugLabel(candidate.role) === slugLabel(reference)
    ))
  }

  const createSubassemblyBomChild = (
    parent: Agent,
    seed: AgentBomChildSeed,
    currentRun: number,
  ): Agent | undefined => {
    if (seed.scope === 'shared_part') {
      return createSharedComponentAgent({
        role: seed.role,
        reason: `Required by ${parent.role}'s direct BOM.`,
        instruction: seed.instruction,
        consumers: [parent.role],
      }, currentRun)
    }

    if (remainingWallAgentSlots() < 1) {
      logWallAgentCap()
      return undefined
    }

    const sequence = nextAgentSequence(seed.kind)
    const padded = String(sequence).padStart(4, '0')
    const id = `${seed.kind === 'orchestrator' ? 'sub-orchestrator' : 'worker'}-${padded}`
    const agent: Agent = {
      id,
      parentId: parent.id,
      kind: seed.kind,
      scope: seed.scope,
      name: `Zookeeper ${seed.kind === 'orchestrator' ? 'Sub-Orchestrator' : 'Worker'} ${padded}`,
      role: seed.role,
      instruction: seed.instruction,
      color: agentColors[agents.size % agentColors.length]!,
      status: 'queued',
      filePath: `generated/${slugLabel(seed.role)}-${padded}.kcl`,
      imports: [],
      source: activeSource,
    }
    plannedAgentCount += 1
    updateProjectFile(agent.filePath, '')
    return addAgent(agent) ? agent : undefined
  }

  const startSubassemblyBomChild = (agent: Agent, currentRun: number) => {
    if (!agentStillActive(agent, currentRun) || agent.status === 'error') return
    if (isReusableLibraryAgent(agent)) {
      syncReusableLibraryMetadata(agent)
      setWorkAgentStatus(agent, 'complete')
      return
    }
    if (agent.scope === 'shared_part') {
      appendWorkAgentLog(agent, '< shared BOM worker queued for its canonical KCL run', 'in')
      return
    }
    if (agent.kind === 'orchestrator') {
      setWorkAgentStatus(agent, 'reviewing')
      appendWorkAgentLog(agent, '-> plan direct sub-assembly BOM', 'out')
      void requestSubassemblyBom(agent, currentRun)
      return
    }
    setWorkAgentStatus(agent, 'running')
    appendWorkAgentLog(agent, '-> generate KCL candidate', 'out')
    void requestAgentWork(agent, currentRun)
  }

  const requestSubassemblyBom = async (agent: Agent, currentRun: number, retryAttempt = 0) => {
    if (!agentStillActive(agent, currentRun) || agent.kind !== 'orchestrator' || isReusableLibraryAgent(agent)) return
    if (bomPlanningAgentIds.has(agent.id)) return
    if (remainingWallAgentSlots() <= 0) {
      logWallAgentCap()
      appendWorkAgentLog(agent, '< direct BOM capacity exhausted; generating this scope as one terminal sub-assembly', 'in')
      void requestAgentWork(
        agent,
        currentRun,
        '',
        0,
        'No child agent slots remain. Generate one complete, renderable KCL sub-assembly for this assigned scope directly. Do not leave an imports-only or empty file. Include a ZOOKEEPER_INTERFACE block so the parent can place the result.',
      )
      return
    }
    if (graphChildren(agent.id).some(child => !isReusableLibraryAgent(child))) {
      appendWorkAgentLog(agent, '< direct BOM already supplied; awaiting child KCL updates', 'in')
      return
    }

    bomPlanningAgentIds.add(agent.id)
    setWorkAgentStatus(agent, 'running')
    appendWorkAgentLog(agent, '-> hosted Zookeeper: plan direct BOM', 'out')
    try {
      const context = requestContextFor(agent.filePath)
      const update = await requestAgentWorkStream(agent, currentRun, {
        sessionId: activeSessionId,
        prompt: promptInput.value.trim() || defaultPrompt,
        rootInstruction,
        agent: {
          id: agent.id,
          parentId: agent.parentId,
          kind: agent.kind,
          scope: agent.scope,
          name: agent.name,
          role: agent.role,
          instruction: agent.instruction,
          filePath: agent.filePath,
          imports: agent.imports ?? [],
        },
        files: context.files,
        remainingAgentSlots: remainingWallAgentSlots(),
        wallMaxAgents: maxWallAgents,
        knownAgents: Array.from(agents.values()).map(candidate => ({
          id: candidate.id,
          key: candidate.id,
          name: candidate.name,
          role: candidate.role,
          scope: candidate.scope,
          filePath: candidate.filePath,
        })),
      }, '/api/zookeeper/bom-start')
      if (!agentStillActive(agent, currentRun)) return
      if (!('children' in update)) throw new Error('Sub-assembly planner returned KCL instead of a direct BOM')

      appendWorkAgentLog(agent, `< ${update.source} direct BOM: ${update.summary}`, 'in')
      const spawned = new Map<string, Agent>()
      update.children.forEach((childSeed) => {
        const child = createSubassemblyBomChild(agent, childSeed, currentRun)
        if (child !== undefined) spawned.set(childSeed.key.trim().toLowerCase(), child)
      })

      update.children.forEach((childSeed) => {
        ;(childSeed.imports ?? []).forEach((reference) => {
          const imported = resolveBomImport(reference, spawned)
          if (imported === undefined || imported.parentId === agent.id) return
          addImportToConsumer(agent, imported, `direct BOM reference: ${reference}`)
        })
      })

      syncAssemblyFileImports(agent)
      const skipped = update.children.length - spawned.size
      appendWorkAgentLog(agent, `< direct BOM accepted: ${spawned.size} child agent${spawned.size === 1 ? '' : 's'}; dispatching concurrently${skipped > 0 ? `; ${skipped} omitted at wall capacity` : ''}`, 'in')
      if (spawned.size === 0) {
        appendWorkAgentLog(agent, '< direct BOM returned no dispatchable children; generating a terminal sub-assembly instead', 'in')
        await requestAgentWork(
          agent,
          currentRun,
          '',
          0,
          'The direct BOM produced no dispatchable child agents. Generate one complete, renderable KCL sub-assembly for this assigned scope directly. Do not return an imports-only or empty file. Include a ZOOKEEPER_INTERFACE block for parent placement.',
        )
        return
      }
      setWorkAgentStatus(agent, 'reviewing')
      Array.from(spawned.values()).forEach((child) => startSubassemblyBomChild(child, currentRun))
    } catch (error: unknown) {
      if (!agentStillActive(agent, currentRun)) return
      const message = errorToMessage(error)
      if (isTransientControlPlaneError(message) && retryAttempt < maxZooFallbackRetries) {
        const nextRetry = retryAttempt + 1
        appendWorkAgentLog(agent, `< direct BOM control-plane interruption: ${message}`, 'in')
        appendWorkAgentLog(agent, `-> retrying direct BOM ${nextRetry}/${maxZooFallbackRetries}`, 'out')
        bomPlanningAgentIds.delete(agent.id)
        await wait(zooFallbackRetryBackoffMs * nextRetry)
        if (agentStillActive(agent, currentRun)) await requestSubassemblyBom(agent, currentRun, nextRetry)
        return
      }
      appendWorkAgentLog(agent, `< direct BOM planning failed: ${message}`)
      setWorkAgentStatus(agent, 'error')
      markAgentFailedAndRefreshAncestors(agent, currentRun, message)
    } finally {
      bomPlanningAgentIds.delete(agent.id)
    }
  }

  const assemblyCoverageIssues = () => {
    const rootAgent = graphNode(rootAgentId)
    if (rootAgent === undefined) return ['root agent is unavailable']
    const issues: string[] = []
    const assemblyAgents = [
      rootAgent,
      ...Array.from(agents.values())
        .filter(agent => agent.kind === 'orchestrator' && !isReusableLibraryAgent(agent)),
    ]

    for (const agent of agents.values()) {
      if (isReusableLibraryAgent(agent)) continue
      if (!agentKclReady(agent)) issues.push(`${agent.role}: no renderable KCL body`)
    }

    for (const parent of assemblyAgents) {
      const filePath = parent.id === rootAgentId ? rootFilePath : parent.filePath
      const source = kclFiles.get(filePath) ?? ''
      if (!agentKclReady(parent)) issues.push(`${parent.role}: assembly file has no renderable body`)
      const expectedComponents = [...reviewChildren(parent), ...importedAgentsFor(parent)]
        .filter(component => !isReusableLibraryAgent(component))
        .filter(component => component.status === 'complete')
      const seen = new Set<string>()
      expectedComponents.forEach((component) => {
        if (seen.has(component.filePath)) return
        seen.add(component.filePath)
        const importLine = `import "${renderPathForFilePath(component.filePath)}" as ${aliasForFilePath(component.filePath)}`
        if (!source.includes(importLine)) {
          issues.push(`${parent.role}: missing import for ${component.role}`)
          return
        }
        if (!hasVisibleChildPlacement(source, component.filePath)) {
          issues.push(`${parent.role}: ${component.role} is imported but not composed`)
        }
      })
    }
    return [...new Set(issues)]
  }

  const synchronizeCompletedAssemblies = () => {
    const depth = (agent: Agent) => {
      let value = 0
      let parentId = agent.parentId
      while (parentId !== '' && parentId !== rootAgentId) {
        value += 1
        parentId = agents.get(parentId)?.parentId ?? ''
      }
      return value
    }
    Array.from(agents.values())
      .filter(agent => agent.kind === 'orchestrator' && !isReusableLibraryAgent(agent))
      .sort((left, right) => depth(right) - depth(left))
      .forEach(syncAssemblyFileImports)
    syncRootFileImports()
  }

  const runHasPendingWork = () => (
    timers.size > 0 ||
    reviewTimers.size > 0 ||
    placementTimers.size > 0 ||
    draftRenderChains.size > 0 ||
    activeAgentWorkIds.size > 0 ||
    pendingAgentWorkRequests.size > 0 ||
    snapshotJobs.size > 0 ||
    snapshotPersistenceJobs.size > 0 ||
    workWaiters.size > 0 ||
    bomPlanningAgentIds.size > 0 ||
    activeReviewRequests.size > 0 ||
    reviewQueue.size > 0 ||
    reviewWaiters.size > 0 ||
    snapshotDrainPromise !== undefined ||
    snapshotPersistenceDrainPromise !== undefined ||
    snapshotViewStarting !== undefined ||
    snapshotViewDisposing !== undefined ||
    centerRenderPending !== undefined ||
    centerRenderDrainPromise !== undefined ||
    centerRebuildPromise !== undefined ||
    rootRenderTimer !== undefined ||
    graphRenderTimer !== undefined ||
    layoutTimer !== undefined ||
    centerViewerReloadTimer !== undefined
  )

  const runHasCompleteVisuals = () => Array.from(agents.values()).every(agent => (
    isReusableLibraryAgent(agent) ||
    (
      agent.snapshotState === 'ready' &&
      typeof agent.snapshotUrl === 'string' &&
      agent.snapshotUrl.length > 0
    )
  ))

  const recoverAgentVisual = (agent: Agent, currentRun: number, now: number) => {
    if (
      !useAgentCadSnapshots ||
      isReusableLibraryAgent(agent) ||
      agent.status !== 'complete' ||
      (agent.snapshotState === 'ready' && agent.snapshotUrl !== undefined) ||
      agent.snapshotState === 'queued' ||
      agent.snapshotState === 'rendering' ||
      agent.snapshotState === 'persisting'
    ) return false

    const lastRecovery = agent.lastSnapshotRecoveryAtMs ?? 0
    if (now - lastRecovery < snapshotRecoveryCooldownMs) return false
    agent.lastSnapshotRecoveryAtMs = now
    agent.snapshotRecoveryCount = (agent.snapshotRecoveryCount ?? 0) + 1
    const recovery = agent.snapshotRecoveryCount

    if (agent.snapshotState === 'error' && recovery % snapshotRetriesBeforeKclRepair === 0) {
      const reason = agent.snapshotMessage || 'snapshot contained no visible geometry'
      appendWorkAgentLog(agent, `< visual supervisor requesting KCL repair after ${recovery} failed snapshot attempts: ${reason}`, 'in')
      void requestAgentWork(
        agent,
        currentRun,
        reason,
        0,
        'The final CAD snapshot is blank or unavailable. Inspect the current KCL, ensure it produces visible solid geometry or a visible imported assembly, preserve the assigned scope, and return corrected renderable KCL.',
      )
      return true
    }

    appendWorkAgentLog(agent, `< visual supervisor retrying final snapshot ${recovery}`, 'in')
    queueAgentSnapshot(agent, currentRun, renderProjectFor(agent.filePath), `final visual recovery ${recovery}`, 'final')
    return true
  }

  const replaceCenterWithStaticSnapshot = async (snapshotUrl: string) => {
    const image = document.createElement('img')
    image.classList.add('agent-cad-snapshot', 'orchestrator-final-snapshot')
    image.alt = 'Completed root CAD assembly'
    image.decoding = 'async'
    image.src = snapshotUrl
    await withTimeout(image.decode(), 20000, 'final root snapshot decode')
    assemblyRenderer.replaceChildren(image)
  }

  const stopCompletedRunRuntime = async () => {
    if (supervisorTimer !== undefined) {
      window.clearInterval(supervisorTimer)
      supervisorTimer = undefined
    }
    if (aggregateTimeTimer !== undefined) {
      window.clearInterval(aggregateTimeTimer)
      aggregateTimeTimer = undefined
    }
    if (centerViewerHealthTimer !== undefined) {
      window.clearInterval(centerViewerHealthTimer)
      centerViewerHealthTimer = undefined
    }
    if (centerViewerReloadTimer !== undefined) {
      window.clearTimeout(centerViewerReloadTimer)
      centerViewerReloadTimer = undefined
    }
    if (completionCheckTimer !== undefined) {
      window.clearTimeout(completionCheckTimer)
      completionCheckTimer = undefined
    }
    clearCameraTimers()
    closeActiveSession('run complete')
    runRequestAbort?.abort()
    runRequestAbort = undefined
    workEventAbort?.abort()
    workEventAbort = undefined
    workEventSessionId = ''
    await disposeSnapshotView()
    await centerView.deconstructor()
    snapshotCanvas.width = 1
    snapshotCanvas.height = 1
  }

  async function finalizeCompletedRun(currentRun: number) {
    if (finalizationPromise !== undefined || currentRun !== runId || !active) return
    const finalizing = (async () => {
      setRunPhase('finalizing', 'reviewing')
      centerStatus.textContent = 'Finalizing complete assembly'
      rootLogLine('< completion gate passed; rendering final root assembly', 'in')

      synchronizeCompletedAssemblies()
      const finalProject = renderProjectFor(rootFilePath)
      await queueCenterProject(finalProject, 'final complete root assembly')
      sendRootCameraCommand(centerView)
      const snapshotDataUrl = await captureSnapshotDataUrl(centerView)
      let snapshotUrl = snapshotDataUrl
      try {
        snapshotUrl = await persistSnapshot(rootAgentId, snapshotDataUrl)
      } catch (error: unknown) {
        rootLogLine(`< final root snapshot persistence failed; retaining bounded in-memory image: ${errorToMessage(error)}`, 'in')
      }
      if (currentRun !== runId) return

      const projectArtifact = await persistCompletedProject()
      rootLogLine(
        `< completed KCL project persisted: ${projectArtifact.fileCount} files, ${projectArtifact.fileBytes} bytes at ${projectArtifact.path}`,
        'in',
      )
      await replaceCenterWithStaticSnapshot(snapshotUrl)
      await stopCompletedRunRuntime()
      if (currentRun !== runId) return

      if (rootActiveStartedAtMs !== undefined) {
        rootElapsedMs += Math.max(0, Date.now() - rootActiveStartedAtMs)
        rootActiveStartedAtMs = undefined
      }
      active = false
      startInProgress = false
      completionCandidateAtMs = undefined
      kclFiles = new Map()
      interfaceManifests = new Map()
      updateAggregateTime()
      setRunPhase('complete', 'complete')
      centerStatus.textContent = 'Run complete - static assembly'
      startButton.disabled = false
      startButton.textContent = 'Start New Run'
      stopButton.disabled = false
      rootLogLine('< run complete: every agent, assembly import, visual, and persistence queue settled', 'in')
      rootLogLine('< runtime quiesced: WebRTC renderers, event stream, watchdogs, and agent timers stopped', 'in')
      broadcastWall({ type: 'run:complete' })
    })()
    finalizationPromise = finalizing
    try {
      await finalizing
    } catch (error: unknown) {
      if (currentRun === runId) {
        rootLogLine(`< finalization deferred: ${errorToMessage(error)}`)
        centerStatus.textContent = `Finalization retry: ${errorToMessage(error).slice(0, 120)}`
        completionCandidateAtMs = undefined
        setRunPhase('running', 'complete')
        scheduleCenterViewerReload(errorToMessage(error))
        scheduleRunCompletionCheck(runCompletionRetryMs)
      }
    } finally {
      if (finalizationPromise === finalizing) finalizationPromise = undefined
    }
  }

  function scheduleRunCompletionCheck(delayMs = 250) {
    if (!isControllerWindow || !active || runPhase !== 'running') return
    if (completionCheckTimer !== undefined) return
    completionCheckTimer = window.setTimeout(() => {
      completionCheckTimer = undefined
      if (!active || runPhase !== 'running') return
      if (agents.size === 0 || Array.from(agents.values()).some(agent => agent.status !== 'complete')) {
        completionCandidateAtMs = undefined
        return
      }

      synchronizeCompletedAssemblies()
      const coverageIssues = assemblyCoverageIssues()
      if (coverageIssues.length > 0 || !runHasCompleteVisuals() || runHasPendingWork() || rootStatus !== 'complete') {
        root.dataset.completionBlockers = [
          ...coverageIssues.slice(0, 4),
          !runHasCompleteVisuals() ? 'agent visuals pending' : '',
          runHasPendingWork() ? 'runtime queues pending' : '',
          rootStatus !== 'complete' ? `root status ${rootStatus}` : '',
        ].filter(Boolean).join(' | ')
        completionCandidateAtMs = undefined
        scheduleRunCompletionCheck(runCompletionRetryMs)
        return
      }
      root.dataset.completionBlockers = ''

      const now = Date.now()
      if (completionCandidateAtMs === undefined) {
        completionCandidateAtMs = now
        rootLogLine(`< completion candidate: all ${agents.size} agents and assembly visuals are settled`, 'in')
        reportRuntimeEvent('completion-candidate')
        scheduleRunCompletionCheck(runCompletionSettleMs)
        return
      }
      const remaining = runCompletionSettleMs - (now - completionCandidateAtMs)
      if (remaining > 0) {
        scheduleRunCompletionCheck(remaining)
        return
      }
      void finalizeCompletedRun(runId)
    }, delayMs)
  }

  const wakeFailedAgent = (agent: Agent, currentRun: number) => {
    const now = Date.now()
    const recoveries = agent.supervisorRecoveryCount ?? 0
    const lastRecovery = agent.lastSupervisorRecoveryAtMs ?? 0
    if (now - lastRecovery < supervisorRecoveryCooldownMs) return false

    agent.supervisorRecoveryCount = recoveries + 1
    agent.lastSupervisorRecoveryAtMs = now
    const reason = `Root supervisor recovery ${agent.supervisorRecoveryCount}`
    rootLogLine(`< supervisor waking ${agent.name}: ${reason}`, 'in')
    appendWorkAgentLog(agent, `< ${reason}; retaining current KCL and interface context`, 'in')

    if (agent.kind === 'orchestrator' && !graphChildren(agent.id).some(child => !isReusableLibraryAgent(child))) {
      setWorkAgentStatus(agent, 'reviewing')
      void requestSubassemblyBom(agent, currentRun)
      return true
    }

    setWorkAgentStatus(agent, 'reviewing')
    void requestAgentWork(
      agent,
      currentRun,
      '',
      0,
      'Root supervisor: resume this child using the current KCL, interfaces, and direct imports. Repair the failed operation and return a renderable result for the parent assembly.',
    )
    return true
  }

  const runRootSupervisorSweep = () => {
    if (!isControllerWindow || !active || runPhase !== 'running') return
    const currentRun = runId
    const now = Date.now()
    const statusCounts = new Map<AgentStatus, number>()
    let reviewScheduled = false

    for (const agent of agents.values()) {
      statusCounts.set(agent.status, (statusCounts.get(agent.status) ?? 0) + 1)
      if (!agentStillActive(agent, currentRun) || isReusableLibraryAgent(agent)) continue

      if (agent.status === 'error') {
        wakeFailedAgent(agent, currentRun)
        continue
      }

      if (recoverAgentVisual(agent, currentRun, now)) continue

      const activityAge = now - (agent.lastActivityAtMs ?? now)
      if ((agent.status === 'queued' || agent.status === 'starting') && activityAge >= supervisorQueuedWakeMs) {
        rootLogLine(`< supervisor dispatching stalled ${agent.name}`, 'in')
        appendWorkAgentLog(agent, '< root supervisor: dispatching stalled queued child', 'in')
        startSubassemblyBomChild(agent, currentRun)
        continue
      }

      if (agent.status === 'complete') continue
      if (reviewScheduled || agent.kind !== 'orchestrator') continue
      const readyChild = placementComponentsFor(agent)[0]
      const lastReview = supervisorReviewAtMs.get(agent.id) ?? 0
      if (readyChild === undefined || now - lastReview < supervisorSummaryIntervalMs) continue
      supervisorReviewAtMs.set(agent.id, now)
      reviewScheduled = true
      appendWorkAgentLog(agent, `< root supervisor: scheduled health review after ${readyChild.role}`, 'in')
      scheduleOrchestratorReview(agent, readyChild)
    }

    if (
      agents.size > 0 &&
      Array.from(agents.values()).every(agent => agent.status === 'complete')
    ) {
      scheduleRunCompletionCheck()
      if (now - supervisorLastSummaryAtMs >= supervisorSummaryIntervalMs) {
        supervisorLastSummaryAtMs = now
        rootLogLine(`< supervisor sweep: ${agents.size}/${maxWallAgents} agents complete; validating final assembly and snapshots`, 'in')
      }
      return
    }

    const rootAgent = graphNode(rootAgentId)
    const readyRootChild = rootAgent === undefined ? undefined : placementComponentsFor(rootAgent)[0]
    const lastRootReview = supervisorReviewAtMs.get(rootAgentId) ?? 0
    if (!reviewScheduled && rootAgent !== undefined && readyRootChild !== undefined && now - lastRootReview >= supervisorSummaryIntervalMs) {
      supervisorReviewAtMs.set(rootAgentId, now)
      reviewScheduled = true
      rootLogLine(`< supervisor: scheduled root health review after ${readyRootChild.role}`, 'in')
      scheduleOrchestratorReview(rootAgent, readyRootChild)
    }

    if (now - supervisorLastSummaryAtMs >= supervisorSummaryIntervalMs) {
      supervisorLastSummaryAtMs = now
      const summary = ['running', 'reviewing', 'complete', 'error', 'queued', 'starting']
        .map(status => `${status}:${statusCounts.get(status as AgentStatus) ?? 0}`)
        .join(', ')
      rootLogLine(`< supervisor sweep: ${agents.size}/${maxWallAgents} agents (${summary})`, 'in')
    }
  }

  const startRootSupervisor = () => {
    if (!isControllerWindow || supervisorTimer !== undefined) return
    supervisorLastSummaryAtMs = 0
    runRootSupervisorSweep()
    supervisorTimer = window.setInterval(runRootSupervisorSweep, supervisorSweepIntervalMs)
  }

  const clearTimers = () => {
    closeActiveSession('run reset')
    runRequestAbort?.abort()
    runRequestAbort = undefined
    for (const timer of timers) window.clearTimeout(timer)
    timers.clear()
    if (rootRenderTimer !== undefined) {
      window.clearTimeout(rootRenderTimer)
      rootRenderTimer = undefined
    }
    if (graphRenderTimer !== undefined) {
      window.clearTimeout(graphRenderTimer)
      graphRenderTimer = undefined
    }
    if (layoutTimer !== undefined) {
      window.clearTimeout(layoutTimer)
      layoutTimer = undefined
    }
    if (aggregateTimeTimer !== undefined) {
      window.clearInterval(aggregateTimeTimer)
      aggregateTimeTimer = undefined
    }
    if (supervisorTimer !== undefined) {
      window.clearInterval(supervisorTimer)
      supervisorTimer = undefined
    }
    if (completionCheckTimer !== undefined) {
      window.clearTimeout(completionCheckTimer)
      completionCheckTimer = undefined
    }
    completionCandidateAtMs = undefined
    finalizationPromise = undefined
    activeReviewRequests.clear()
    activeReviewRevisions.clear()
    completedReviewRevisions.clear()
    reviewQueue.clear()
    supervisorReviewAtMs.clear()
    supervisorLastSummaryAtMs = 0
    for (const timer of reviewTimers.values()) window.clearTimeout(timer)
    reviewTimers.clear()
    for (const timer of placementTimers.values()) window.clearTimeout(timer)
    placementTimers.clear()
    snapshotJobs.clear()
    snapshotPersistenceJobs.clear()
    void disposeSnapshotView()
    if (centerViewerReloadTimer !== undefined) {
      window.clearTimeout(centerViewerReloadTimer)
      centerViewerReloadTimer = undefined
    }
    centerRenderPending?.waiters.forEach(waiter => waiter.reject(new Error('run reset')))
    centerRenderPending = undefined
    centerCoalescedRenderCount = 0
    draftRenderChains.clear()
    pendingAgentWorkRequests.forEach(request => {
      request.waiters.forEach(waiter => waiter.reject(new Error('run reset')))
    })
    pendingAgentWorkRequests.clear()
    activeAgentWorkIds.clear()
    agentWorkRevisions.clear()
    bomPlanningAgentIds.clear()
    workWaiters.forEach(waiter => waiter.reject(new Error('run reset')))
    workWaiters.clear()
    reviewWaiters.forEach(waiter => waiter.reject(new Error('run reset')))
    reviewWaiters.clear()
    workEventAbort?.abort()
    workEventAbort = undefined
    workEventSessionId = ''
  }

  const clearCameraTimers = () => {
    for (const timer of cameraTimers) {
      window.clearTimeout(timer)
      window.clearInterval(timer)
    }
    cameraTimers.clear()
  }

  const resetAgents = () => {
    clearCameraTimers()
    agents.forEach((agent) => {
      clearAgentViewerTimers(agent)
      releaseAgentSnapshotDisplay(agent)
      void agent.view?.deconstructor()
      agent.element?.remove()
    })
    agents.clear()
    plannedAgentCount = 0
    updateAggregateTime()
    layoutAgents()
    renderAllGraphs()
  }

  const after = (ms: number, action: () => void) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer)
      action()
    }, ms)
    timers.add(timer)
  }

  const startCenterView = () => {
    centerView.start()
  }

  if (isControllerWindow) attachCenterViewHandlers(centerView)
  else void centerView.deconstructor()

  const demoAgents = (): AgentSeed[] => {
    const topLevelRoles = [
      'combustion sub-assembly',
      'feed system sub-assembly',
      'structure and controls',
      'nozzle and plume shaping',
      'regen cooling system',
      'thrust vector control',
      'instrumentation harness',
      'mounting and ground support',
    ]
    const nestedRoles = [
      'injector face decomposition',
      'turbopump integration',
      'cooling channel recursion',
      'nozzle extension recursion',
      'sensor package recursion',
      'mount load-path recursion',
    ]
    const workerRoles = [
      'chamber liner',
      'nozzle contour',
      'injector plate',
      'fuel valve block',
      'oxidizer valve block',
      'turbopump package',
      'thrust frame',
      'sensor harness',
      'regen cooling jacket',
      'film cooling slots',
      'igniter boss',
      'pressure transducer port',
      'gimbal ring',
      'actuator clevis',
      'mounting flange',
      'purge manifold',
      'thermal shield',
      'bell extension',
      'flex line bracket',
      'controller enclosure',
      'cable strain relief',
      'valve actuator housing',
      'interface adapter',
      'hot-fire test lug',
      'seal groove',
      'flow straightener',
      'swirl element',
      'bolt circle',
      'coolant inlet',
      'coolant outlet',
      'inspection window',
      'support strut',
      'instrument rail',
      'connector plate',
      'drain fitting',
      'assembly datum target',
    ]
    const seeds: AgentSeed[] = []
    const orchestratorIds: string[] = []

    topLevelRoles.forEach((role, index) => {
      const id = `sub-orchestrator-${String(index + 1).padStart(4, '0')}`
      orchestratorIds.push(id)
      seeds.push({
        id,
        parentId: rootAgentId,
        kind: 'orchestrator',
        name: `Zookeeper Sub-Orchestrator ${String(index + 1).padStart(4, '0')}`,
        role,
        instruction: `Break down and coordinate the ${role} for the assembly. Merge child KCL outputs into this sub-assembly.`,
        filePath: `generated/${id}.kcl`,
        source: 'fallback',
      })
    })

    nestedRoles.forEach((role, index) => {
      const id = `sub-orchestrator-${String(topLevelRoles.length + index + 1).padStart(4, '0')}`
      orchestratorIds.push(id)
      seeds.push({
        id,
        parentId: orchestratorIds[index % topLevelRoles.length]!,
        kind: 'orchestrator',
        name: `Zookeeper Sub-Orchestrator ${String(topLevelRoles.length + index + 1).padStart(4, '0')}`,
        role,
        instruction: `Recursively decompose ${role}. Request worker KCL for the concrete parts and maintain a renderable assembly file.`,
        filePath: `generated/${id}.kcl`,
        source: 'fallback',
      })
    })

    workerRoles.forEach((role, index) => {
      const id = `worker-${String(index + 1).padStart(4, '0')}`
      seeds.push({
        id,
        parentId: orchestratorIds[index % orchestratorIds.length]!,
        kind: 'worker',
        name: `Zookeeper Worker ${String(index + 1).padStart(4, '0')}`,
        role,
        instruction: `Produce clean, renderable KCL for the ${role}. Keep the part simple enough to update quickly in the wall renderer.`,
        filePath: `generated/${id}.kcl`,
        source: 'fallback',
      })
    })

    return seeds
  }

  const fallbackOrchestration = (prompt: string): OrchestrationResponse => {
    const seeds = demoAgents()
    const files = new Map<string, string>()
    const topLevelFiles = seeds
      .filter(seed => seed.parentId === rootAgentId)
      .map(seed => seed.filePath)

    files.set(rootFilePath, mainFileFor(topLevelFiles))
    seeds.forEach((seed) => {
      const childFiles = seeds
        .filter(child => child.parentId === seed.id)
        .map(child => child.filePath)
      files.set(seed.filePath, mainFileFor(childFiles))
    })

    return {
      sessionId: `fallback-${Date.now()}`,
      source: 'fallback',
      prompt,
      root: {
        instruction: `Plan and merge a renderable assembly for: ${prompt}`,
        filePath: rootFilePath,
      },
      agents: seeds,
      files: objectFromMap(files),
      notes: ['OpenAI orchestration unavailable; using deterministic fallback plan.'],
    }
  }

  const requestOrchestration = async (prompt: string): Promise<OrchestrationResponse> => {
    try {
      const response = await runFetch('/api/orchestrate-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, maxAgents: maxWallAgents }),
      })
      if (!response.ok) {
        throw new Error(`orchestrate ${response.status}`)
      }
      if (response.body === null) throw new Error('orchestrate stream has no body')

      let plan: OrchestrationResponse | undefined
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const handleEvent = (event: OrchestrationStreamEvent) => {
        if (event.type === 'final') {
          plan = event.plan
          return
        }
        if (event.type === 'error') throw new Error(event.summary)
        const prefix = event.type === 'bom' ? 'BOM architect' : 'architect'
        rootLogLine(`< ${prefix}: ${event.message}`, 'in')
        if (event.type === 'started' || event.type === 'status') {
          centerStatus.textContent = `Architect: ${event.message}`
        }
      }

      for (;;) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach((line) => {
          if (line.trim().length === 0) return
          handleEvent(JSON.parse(line) as OrchestrationStreamEvent)
        })
        if (done) break
      }
      if (buffer.trim().length > 0) handleEvent(JSON.parse(buffer) as OrchestrationStreamEvent)
      if (plan === undefined) throw new Error('orchestrate stream ended without a plan')
      return plan
    } catch (error: unknown) {
      rootLogLine(`system: OpenAI orchestration unavailable; using fallback (${errorToMessage(error)})`)
      return fallbackOrchestration(prompt)
    }
  }

  const parseAgentWorkStreamEvent = (line: string): AgentWorkStreamEvent | undefined => {
    if (line.trim().length === 0) return undefined
    return JSON.parse(line) as AgentWorkStreamEvent
  }

  const handleAgentWorkEvent = (event: AgentWorkStreamEvent | undefined) => {
    if (event === undefined || event.type === 'ping') return
    const workId = event.workId
    if (workId === undefined) return
    if (
      event.type === 'review-queued' ||
      event.type === 'review-started' ||
      event.type === 'review-dialog' ||
      event.type === 'review-final' ||
      event.type === 'review-error'
    ) {
      const waiter = reviewWaiters.get(workId)
      if (waiter === undefined) return
      const { parent, currentRun } = waiter
      if (!agentStillActive(parent, currentRun)) {
        reviewWaiters.delete(workId)
        return
      }
      if (event.type === 'review-queued') {
        reviewLogLine(parent, '< visual review queued behind active Zoo reviews', 'in')
        return
      }
      if (event.type === 'review-started') {
        reviewLogLine(parent, '< hosted Zookeeper visual review started', 'in')
        return
      }
      if (event.type === 'review-dialog') {
        reviewLogLine(parent, `< review ws: ${event.line}`, 'in')
        return
      }
      reviewWaiters.delete(workId)
      if (event.type === 'review-final') waiter.resolve(event.review)
      else waiter.reject(new Error(event.summary))
      return
    }
    const waiter = workWaiters.get(workId)
    if (waiter === undefined) return

    const { agent, currentRun } = waiter
    if (!agentStillActive(agent, currentRun)) {
      workWaiters.delete(workId)
      return
    }
    const superseded = (
      waiter.workRevision !== undefined &&
      agentWorkRevisions.get(agent.id) !== waiter.workRevision
    )
    if (superseded) {
      if (event.type === 'final') {
        workWaiters.delete(workId)
        waiter.resolve(event.update)
      } else if (event.type === 'error') {
        workWaiters.delete(workId)
        waiter.reject(new Error(event.summary))
      }
      return
    }

    if (event.type === 'started') {
      appendWorkAgentLog(agent, '< hosted Zookeeper run started', 'in')
      return
    }
    if (event.type === 'dialog') {
      appendWorkAgentLog(agent, `< ws: ${event.line}`, 'in')
      return
    }
    if (event.type === 'draft') {
      queueDraftRender(agent, currentRun, event.kcl, event.draftIndex, waiter.workRevision)
      return
    }
    if (event.type === 'final') {
      workWaiters.delete(workId)
      waiter.resolve(event.update)
      return
    }

    workWaiters.delete(workId)
    waiter.reject(new Error(event.summary))
  }

  const ensureWorkEventStream = (sessionId: string) => {
    if (workEventAbort !== undefined && workEventSessionId === sessionId) return

    workEventAbort?.abort()
    workEventAbort = new AbortController()
    workEventSessionId = sessionId
    const signal = workEventAbort.signal

    const readEvents = async () => {
      const response = await fetch(`/api/zookeeper/events?sessionId=${encodeURIComponent(sessionId)}`, { signal })
      if (!response.ok || response.body === null) throw new Error(`event stream ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach(line => handleAgentWorkEvent(parseAgentWorkStreamEvent(line)))
        if (done) break
      }
      handleAgentWorkEvent(parseAgentWorkStreamEvent(buffer))
      if (!signal.aborted) throw new Error('zookeeper event stream ended')
    }

    void readEvents().catch((error: unknown) => {
      if (signal.aborted) return
      if (workEventAbort?.signal === signal) {
        workEventAbort = undefined
        workEventSessionId = ''
      }
      rootLogLine(`system: zookeeper event stream failed (${errorToMessage(error)})`)
      Array.from(workWaiters.entries()).forEach(([workId, waiter]) => {
        workWaiters.delete(workId)
        waiter.reject(new Error(errorToMessage(error)))
      })
      Array.from(reviewWaiters.entries()).forEach(([workId, waiter]) => {
        reviewWaiters.delete(workId)
        waiter.reject(new Error(errorToMessage(error)))
      })
    })
  }

  const requestReviewStream = async (
    parent: Agent,
    currentRun: number,
    payload: Record<string, unknown>,
  ): Promise<AgentReviewResponse> => {
    ensureWorkEventStream(activeSessionId)
    const workId = randomId()
    const finalReview = new Promise<AgentReviewResponse>((resolve, reject) => {
      reviewWaiters.set(workId, { parent, currentRun, resolve, reject })
    })

    try {
      const response = await runFetch('/api/zookeeper/review-start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, workId }),
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'review start')
    } catch (error: unknown) {
      reviewWaiters.delete(workId)
      throw error
    }

    return finalReview
  }

  const requestAgentWorkStream = async (
    agent: Agent,
    currentRun: number,
    payload: Record<string, unknown>,
    endpoint = '/api/zookeeper/work-start',
    workRevision?: number,
  ): Promise<AgentStreamResponse> => {
    ensureWorkEventStream(activeSessionId)
    const workId = randomId()
    const body = { ...payload, workId }

    const finalUpdate = new Promise<AgentStreamResponse>((resolve, reject) => {
      workWaiters.set(workId, { agent, currentRun, workRevision, resolve, reject })
    })

    const response = await runFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      workWaiters.delete(workId)
      throw new Error(`agent work start ${response.status}`)
    }

    return finalUpdate
  }

  const performAgentWork = async (
    agent: Agent,
    currentRun: number,
    workRevision: number,
    renderError = '',
    repairAttempt = 0,
    reviewInstruction = '',
    zooRetryAttempt = 0,
  ) => {
    if (!agentStillActive(agent, currentRun)) return
    if (isReusableLibraryAgent(agent)) {
      syncReusableLibraryMetadata(agent)
      setWorkAgentStatus(agent, 'complete')
      appendWorkAgentLog(agent, '< BOM registry only; no Zookeeper placement run needed', 'in')
      return
    }

    setWorkAgentStatus(agent, 'running')
    if (zooRetryAttempt > 0) {
      appendWorkAgentLog(agent, `-> hosted Zookeeper retry ${zooRetryAttempt}/${maxZooFallbackRetries}`, 'out')
    } else if (reviewInstruction.trim().length > 0) {
      appendWorkAgentLog(agent, `-> rework iteration ${repairAttempt}: ${reviewInstruction.slice(0, 180)}`, 'out')
    } else if (renderError.trim().length === 0) {
      appendWorkAgentLog(agent, `-> ${agent.instruction}`, 'out')
    } else {
      appendWorkAgentLog(agent, `-> repair iteration ${repairAttempt}: ${renderError.slice(0, 180)}`, 'out')
    }

    try {
      const entryFilePath = agent.id === rootAgentId ? rootFilePath : agent.filePath
      const context = requestContextFor(entryFilePath, false)
      const update = await requestAgentWorkStream(agent, currentRun, {
        sessionId: activeSessionId,
        prompt: promptInput.value.trim() || defaultPrompt,
        agent: {
          id: agent.id,
          parentId: agent.parentId,
          kind: agent.kind,
          scope: agent.scope,
          name: agent.name,
          role: agent.role,
          instruction: agent.instruction,
          filePath: agent.filePath,
          imports: agent.imports ?? [],
        },
        rootInstruction,
        files: context.files,
        interfaces: context.interfaces,
        currentKcl: kclFiles.get(agent.filePath) ?? '',
        renderError,
        reviewInstruction,
        attempt: repairAttempt,
      }, '/api/zookeeper/work-start', workRevision)
      if (!agentStillActive(agent, currentRun)) return
      if (agentWorkRevisions.get(agent.id) !== workRevision) {
        appendWorkAgentLog(agent, '< discarded superseded Zookeeper result', 'in')
        return
      }
      if (!('kcl' in update)) throw new Error('Zookeeper worker stream returned a BOM instead of KCL')

      if (isRetryableZooFallback(update)) {
        update.dialog?.slice(-3).forEach(line => appendWorkAgentLog(agent, `< ws: ${line}`, 'in'))
        appendWorkAgentLog(agent, `< hosted Zookeeper failed: ${update.summary}`, 'in')
        if (zooRetryAttempt < maxZooFallbackRetries) {
          const nextRetry = zooRetryAttempt + 1
          appendWorkAgentLog(agent, `-> retrying hosted Zookeeper after websocket fallback (${nextRetry}/${maxZooFallbackRetries})`, 'out')
          await wait(zooFallbackRetryBackoffMs * nextRetry)
          if (!agentStillActive(agent, currentRun)) return
          await performAgentWork(agent, currentRun, workRevision, renderError, repairAttempt, reviewInstruction, nextRetry)
          return
        }
        appendWorkAgentLog(agent, `< fallback refused after ${maxZooFallbackRetries} retries; no KCL accepted`)
        setWorkAgentStatus(agent, 'error')
        markAgentFailedAndRefreshAncestors(agent, currentRun, update.summary)
        return
      }

      await (draftRenderChains.get(agent.id) ?? Promise.resolve()).catch(() => {})
      if (!agentStillActive(agent, currentRun)) return

      kclFiles.set(agent.filePath, update.kcl)
      if (agent.kind === 'orchestrator') syncAssemblyFileImports(agent)
      const acceptedKcl = kclFiles.get(agent.filePath) ?? update.kcl
      completionCandidateAtMs = undefined
      updateInterfaceManifest(agent, acceptedKcl)
      if (!useAgentCadSnapshots) {
        broadcastWall({
          type: 'agent:final',
          agentId: agent.id,
          kcl: acceptedKcl,
          manifest: interfaceManifests.get(agent.filePath),
        })
      }
      if (!update.streamed && update.dialog !== undefined && update.dialog.length > 0) {
        update.dialog.slice(-3).forEach(line => appendWorkAgentLog(agent, `< ws: ${line}`, 'in'))
      }
      const draftText = update.drafts === undefined || update.drafts === 0 ? '' : ` after ${update.drafts} draft${update.drafts === 1 ? '' : 's'}`
      appendWorkAgentLog(agent, `< ${update.source === 'zookeeper' ? 'Zookeeper final KCL' : 'fallback KCL'}${draftText}: ${update.summary}`, 'in')
      appendWorkAgentLog(agent, `< wrote ${agent.filePath}${repairAttempt === 0 ? '' : ` (repair ${repairAttempt})`}`, 'in')
      setWorkAgentStatus(agent, agent.kind === 'orchestrator' ? 'reviewing' : 'complete')
      const renderResult = await submitWorkAgentProject(agent)
      if (!agentStillActive(agent, currentRun)) return
      if (!renderResult.ok) {
        const message = renderResult.message ?? 'renderer rejected KCL'
        if (message.includes('view not ready') || message.includes('view not connected')) {
          appendWorkAgentLog(agent, `< render queued until engine connects: ${message}`)
          return
        }
        if (repairAttempt < maxAgentRepairAttempts) {
          appendWorkAgentLog(agent, `-> renderer rejected KCL; requesting repair ${repairAttempt + 1}`, 'out')
          await performAgentWork(agent, currentRun, workRevision, message, repairAttempt + 1, reviewInstruction)
        } else {
          appendWorkAgentLog(agent, `< renderer rejected KCL after ${maxAgentRepairAttempts} repair attempts: ${message}`)
          setWorkAgentStatus(agent, 'error')
          markAgentFailedAndRefreshAncestors(agent, currentRun, message)
        }
        return
      }

      refreshAncestorProjects(agent)

      if (agent.kind === 'orchestrator') {
        after(900, () => {
          if (!agentStillActive(agent, currentRun) || agent.status === 'error') return
          setWorkAgentStatus(agent, 'complete')
        })
      }
    } catch (error: unknown) {
      if (!agentStillActive(agent, currentRun)) return
      if (agentWorkRevisions.get(agent.id) !== workRevision) return
      const message = errorToMessage(error)
      if (isTransientControlPlaneError(message) && zooRetryAttempt < maxZooFallbackRetries) {
        const nextRetry = zooRetryAttempt + 1
        appendWorkAgentLog(agent, `< control-plane interruption: ${message}`, 'in')
        appendWorkAgentLog(agent, `-> retrying agent dispatch ${nextRetry}/${maxZooFallbackRetries}`, 'out')
        await wait(zooFallbackRetryBackoffMs * nextRetry)
        if (!agentStillActive(agent, currentRun)) return
        await performAgentWork(agent, currentRun, workRevision, renderError, repairAttempt, reviewInstruction, nextRetry)
        return
      }
      appendWorkAgentLog(agent, `< agent update failed: ${message}`)
      setWorkAgentStatus(agent, 'error')
      markAgentFailedAndRefreshAncestors(agent, currentRun, message)
    }
  }

  const drainAgentWorkQueue = (agentId: string) => {
    if (activeAgentWorkIds.has(agentId)) return
    const request = pendingAgentWorkRequests.get(agentId)
    if (request === undefined) return
    pendingAgentWorkRequests.delete(agentId)

    if (!agentStillActive(request.agent, request.currentRun)) {
      request.waiters.forEach(waiter => waiter.resolve())
      drainAgentWorkQueue(agentId)
      return
    }

    activeAgentWorkIds.add(agentId)
    void performAgentWork(
      request.agent,
      request.currentRun,
      request.workRevision,
      request.renderError,
      request.repairAttempt,
      request.reviewInstruction,
      request.zooRetryAttempt,
    )
      .then(() => request.waiters.forEach(waiter => waiter.resolve()))
      .catch((error: unknown) => {
        const workError = error instanceof Error ? error : new Error(errorToMessage(error))
        request.waiters.forEach(waiter => waiter.reject(workError))
      })
      .finally(() => {
        activeAgentWorkIds.delete(agentId)
        drainAgentWorkQueue(agentId)
        scheduleRunCompletionCheck()
      })
  }

  const requestAgentWork = (
    agent: Agent,
    currentRun: number,
    renderError = '',
    repairAttempt = 0,
    reviewInstruction = '',
    zooRetryAttempt = 0,
  ) => new Promise<void>((resolve, reject) => {
    if (!agentStillActive(agent, currentRun)) {
      resolve()
      return
    }

    const workRevision = (agentWorkRevisions.get(agent.id) ?? 0) + 1
    agentWorkRevisions.set(agent.id, workRevision)
    const previous = pendingAgentWorkRequests.get(agent.id)
    const waiters = [...(previous?.waiters ?? []), { resolve, reject }]
    pendingAgentWorkRequests.set(agent.id, {
      agent,
      currentRun,
      renderError,
      repairAttempt,
      reviewInstruction,
      zooRetryAttempt,
      workRevision,
      waiters,
    })
    if (previous !== undefined) {
      appendWorkAgentLog(agent, '< coalesced superseded placement request', 'in')
    }
    drainAgentWorkQueue(agent.id)
    scheduleRunCompletionCheck()
  })

  const runZookeeper = async () => {
    if (startInProgress) return
    const centerNeedsRebuild = !assemblyRenderer.contains(centerView.el) || centerView.rtc === undefined
    startInProgress = true
    active = true
    runId += 1
    const currentRun = runId
    rootElapsedMs = 0
    rootActiveStartedAtMs = Date.now()
    startButton.disabled = true
    startButton.textContent = 'Architecting BOM...'
    stopButton.disabled = false
    clearTimers()
    runRequestAbort = new AbortController()
    resetAgents()
    setRunPhase('architecting', 'running')
    startAggregateTimeTicker()
    rootReviewRounds = 0
    centerViewerReloadAttempts = 0
    capacityWarningRun = -1
    rootLog.replaceChildren()
    broadcastWall({ type: 'reset' })
    if (centerNeedsRebuild) await rebuildCenterViewer('new run after static completion')
    const prompt = promptInput.value.trim() || defaultPrompt
    rootLogLine('system: zookeeper orchestration opened')
    rootLogLine('architect: beginning assembly and bill-of-materials design feed')
    rootLogLine(`system: retrying transient hosted Zoo fallbacks up to ${maxZooFallbackRetries} times`)
    rootLogLine(`-> prompt "${prompt}"`, 'out')

    const plan = await requestOrchestration(prompt)
    if (currentRun !== runId) return

    activeSessionId = plan.sessionId
    activeSource = plan.source
    rootInstruction = plan.root.instruction
    kclFiles = new Map(Object.entries(plan.files))
    interfaceManifests = new Map()
    rootImports = new Set()
    const seeds = plan.agents.slice(0, maxWallAgents)
    if (plan.agents.length > seeds.length) {
      rootLogLine(`< plan capped from ${plan.agents.length} to ${seeds.length} total agents`, 'in')
    }
    broadcastWall({
      type: 'plan',
      sessionId: plan.sessionId,
      source: plan.source,
      rootInstruction,
      plannedAgentCount: seeds.length,
      files: useAgentCadSnapshots ? {} : plan.files,
    })
    rootLogLine(`< ${plan.source} plan accepted: ${seeds.length} sub-agents (hard cap ${maxWallAgents})`, 'in')
    plan.notes?.forEach(note => rootLogLine(`system: ${note}`))
    renderAllGraphs()
    setRunPhase('running', 'running')
    startCenterView()
    startRootSupervisor()

    await wait(700)
    if (currentRun !== runId) return
    startButton.textContent = 'Spooling agents...'

    plannedAgentCount = seeds.length
    layoutAgents()
    seeds.forEach((agentSeed, index) => {
      after(450 + index * 120, () => {
        if (currentRun !== runId) return
        const color = agentColors[index % agentColors.length]!
        const agent: Agent = {
          ...agentSeed,
          color,
          status: 'queued',
        }
        addAgent(agent)

        if (isReusableLibraryAgent(agent)) {
          appendAgentLog(agent, '< BOM registry initialized; shared workers render individually', 'in')
          syncReusableLibraryMetadata(agent)
        } else if (agent.kind === 'orchestrator') {
          appendAgentLog(agent, '-> decompose sub-assembly', 'out')
          appendAgentLog(agent, '< child scope accepted', 'in')
        } else {
          appendAgentLog(agent, '-> generate KCL candidate', 'out')
          appendAgentLog(agent, '< geometry constraints received', 'in')
        }

        after(900 + index * 35, () => {
          if (currentRun !== runId || !agents.has(agent.id)) return
          if (agent.status === 'error') return
          if (isReusableLibraryAgent(agent)) {
            syncReusableLibraryMetadata(agent)
            setAgentStatus(agent, 'complete')
            rootLogLine(`< BOM registry ready: ${agent.role}`, 'in')
            return
          }
          setAgentStatus(agent, agent.kind === 'orchestrator' ? 'reviewing' : 'running')
          appendAgentLog(agent, '< empty workspace initialized', 'in')
          rootLogLine(`< ${agent.name} workspace_ready`, 'in')
        })

      })
    })

    after(450 + seeds.length * 120 + 1350, () => {
      if (currentRun !== runId) return
      const initialAgents = seeds
        .map(seed => agents.get(seed.id))
        .filter((agent): agent is Agent => agent !== undefined)

      rootLogLine(`< dispatching ${initialAgents.length} initial agents without waiting for unrelated sub-assemblies`, 'in')
      initialAgents.forEach((agent) => {
        if (agent.status === 'error') return
        if (isReusableLibraryAgent(agent)) {
          syncReusableLibraryMetadata(agent)
          setWorkAgentStatus(agent, 'complete')
          return
        }
        if (agent.kind === 'orchestrator' && graphChildren(agent.id).some(child => !isReusableLibraryAgent(child))) {
          appendWorkAgentLog(agent, '< direct BOM supplied by parent architect; awaiting child KCL updates', 'in')
          setWorkAgentStatus(agent, 'reviewing')
          return
        }
        startSubassemblyBomChild(agent, currentRun)
      })
    })

    after(450 + seeds.length * 120 + 2600, () => {
      if (currentRun !== runId) return
      rootLogLine(`< monitor split: ${seeds.length} agents mapped onto 8 border displays`, 'in')
      startButton.disabled = false
      startButton.textContent = 'Running Zookeeper'
      startInProgress = false
    })
  }

  const handleWallBroadcast = (message: WallBroadcastMessage) => {
    if (isControllerWindow) return

    if (message.type === 'reset') {
      runId += 1
      active = false
      startInProgress = false
      clearTimers()
      resetAgents()
      rootReviewRounds = 0
      activeSessionId = ''
      kclFiles = new Map()
      interfaceManifests = new Map()
      rootImports = new Set()
      rootLog.replaceChildren()
      setRunPhase('idle', 'queued')
      renderAllGraphs()
      return
    }

    if (message.type === 'plan') {
      runId += 1
      active = true
      runRequestAbort?.abort()
      runRequestAbort = new AbortController()
      setRunPhase('running', 'running')
      activeSessionId = message.sessionId
      activeSource = message.source
      rootInstruction = message.rootInstruction
      plannedAgentCount = message.plannedAgentCount
      kclFiles = new Map(Object.entries(message.files))
      interfaceManifests = new Map()
      rootImports = new Set()
      layoutAgents()
      renderAllGraphs()
      return
    }

    if (message.type === 'run:complete') {
      active = false
      startInProgress = false
      runRequestAbort = undefined
      clearCameraTimers()
      setRunPhase('complete', 'complete')
      return
    }

    if (message.type === 'root:log') {
      rootLogLine(message.line, message.direction)
      return
    }

    if (message.type === 'agent:add') {
      if (agents.has(message.agent.id)) return
      addAgent({
        ...message.agent,
        color: message.agent.color,
        status: message.agent.status,
      })
      return
    }

    if (message.type === 'project:file') {
      kclFiles.set(message.filePath, message.kcl)
      return
    }

    const agentId = 'agentId' in message ? message.agentId : undefined
    const agent = agentId === undefined ? undefined : agents.get(agentId)
    if (agent === undefined) return

    if (message.type === 'agent:update') {
      updateAgent(agent, {
        parentId: message.parentId,
        imports: message.imports,
        instruction: message.instruction,
        role: message.role,
      })
      return
    }

    if (message.type === 'agent:status') {
      setAgentStatus(agent, message.status)
      return
    }

    if (message.type === 'agent:log') {
      appendAgentLog(agent, message.line, message.direction)
      return
    }

    if (message.type === 'agent:draft') {
      queueDraftRender(agent, runId, message.kcl, message.draftIndex)
      return
    }

    if (message.type === 'agent:final') {
      kclFiles.set(agent.filePath, message.kcl)
      if (message.manifest !== undefined) interfaceManifests.set(agent.filePath, message.manifest)
      void submitAgentProject(agent)
      return
    }

    if (message.type === 'agent:snapshot-status') {
      agent.snapshotState = message.state
      agent.snapshotMessage = message.message
      updateViewerPlaceholderText(agent)
      return
    }

    if (message.type === 'agent:snapshot') {
      agent.snapshotState = 'ready'
      setAgentSnapshot(agent, message.snapshotUrl)
    }
  }

  wallChannel?.addEventListener('message', (event: MessageEvent<WallBroadcastMessage>) => {
    handleWallBroadcast(event.data)
  })

  stopButton.addEventListener('click', () => {
    if (!isControllerWindow) return
    runId += 1
    if (rootActiveStartedAtMs !== undefined) {
      rootElapsedMs += Math.max(0, Date.now() - rootActiveStartedAtMs)
      rootActiveStartedAtMs = undefined
    }
    active = false
    startInProgress = false
    clearTimers()
    resetAgents()
    rootReviewRounds = 0
    activeSessionId = ''
    kclFiles = new Map()
    interfaceManifests = new Map()
    rootImports = new Set()
    centerViewerReloadAttempts = 0
    if (centerViewerHealthTimer !== undefined) {
      window.clearInterval(centerViewerHealthTimer)
      centerViewerHealthTimer = undefined
    }
    snapshotJobs.clear()
    void disposeSnapshotView()
    void centerView.deconstructor()
    rootLogLine('system: zookeeper stopped')
    broadcastWall({ type: 'reset' })
    startButton.disabled = false
    startButton.textContent = 'Start Zookeeper'
    stopButton.disabled = true
    centerStatus.textContent = 'Zookeeper ready'
    setRunPhase('idle', 'queued')
    renderAllGraphs()
  })

  startButton.addEventListener('click', () => {
    if (!isControllerWindow) return
    void runZookeeper()
  })

  stopButton.disabled = true

  for (let index = 0; index < rows * cols; index += 1) {
    if (index === centerIndex) {
      centerTile.dataset.wallTileIndex = String(index)
      if (isWallTileMode && wallTileIndex === index) centerTile.classList.add('wall-tile-active')
      root.appendChild(centerTile)
      continue
    }

    const tile = document.createElement('section')
    tile.classList.add('wall-tile', 'agent-monitor-tile')
    tile.dataset.wallTileIndex = String(index)
    if (isWallTileMode && wallTileIndex === index) tile.classList.add('wall-tile-active')

    const monitor = document.createElement('div')
    monitor.classList.add('agent-monitor', 'agent-monitor-empty')
    monitor.dataset.monitorIndex = String(index)
    monitorElements.set(index, monitor)

    tile.appendChild(monitor)
    root.appendChild(tile)
  }

  renderAllGraphs()
  layoutAgents()

  window.addEventListener('resize', () => {
    const size = rootViewerSize()
    centerView.el.style.width = `${size.width}px`
    centerView.el.style.height = `${size.height}px`
    for (const agent of agents.values()) {
      agent.view?.el.style.setProperty('width', '100%', 'important')
      agent.view?.el.style.setProperty('height', '100%', 'important')
    }
  })

  let pageDisposed = false
  window.addEventListener('pagehide', () => {
    if (pageDisposed) return
    pageDisposed = true
    if (isControllerWindow) clearTimers()
    else {
      runRequestAbort?.abort()
      workEventAbort?.abort()
      clearCameraTimers()
    }
    resetAgents()
    void disposeSnapshotView()
    void centerView.deconstructor()
    wallChannel?.close()
  }, { once: true })
})
