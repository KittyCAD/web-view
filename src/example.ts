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

type Agent = {
  id: string,
  parentId: string,
  kind: AgentKind,
  name: string,
  role: string,
  instruction: string,
  color: string,
  status: AgentStatus,
  filePath: string,
  source: 'openai' | 'fallback',
  element?: HTMLElement,
  graphElement?: HTMLElement,
  logElement?: HTMLElement,
  statusElement?: HTMLElement,
  view?: ZooWebView,
  reviewRounds?: number,
}

type AgentSeed = Pick<Agent, 'id' | 'parentId' | 'kind' | 'name' | 'role' | 'instruction' | 'filePath' | 'source'>

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

type AgentWorkResponse = {
  source: 'zookeeper' | 'fallback',
  summary: string,
  kcl: string,
  dialog?: string[],
  frames?: number,
  mode?: string,
}

type ReworkRequest = {
  target: string,
  reason: string,
  instruction: string,
}

type AgentReviewResponse = {
  source: 'zookeeper' | 'fallback',
  summary: string,
  rework: ReworkRequest[],
  dialog?: string[],
  frames?: number,
  mode?: string,
}

type RenderResult = {
  ok: boolean,
  message?: string,
}

type RankedAgent = {
  candidate: Agent,
  score: number,
}

const rows = 3
const cols = 3
const centerIndex = 4
const rootAgentId = 'zookeeper-orchestrator-root'
const perimeterOrder = [0, 1, 2, 5, 8, 7, 6, 3]
const mockAgentCount = 50
const maxAgentRepairAttempts = 2
const maxZooFallbackRetries = 3
const zooFallbackRetryBackoffMs = 2200
const defaultPrompt = 'Design a small rocket engine assembly'
const rootFilePath = 'main.kcl'
const interfaceBlockStart = 'ZOOKEEPER_INTERFACE'
const interfaceBlockEnd = '/ZOOKEEPER_INTERFACE'

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
    }
  } as typeof Worker
}

const tileSize = (): Size => ({
  width: window.innerWidth / cols,
  height: window.innerHeight / rows,
})

const paneViewerSize = (agentCount = mockAgentCount): Size => {
  const size = tileSize()
  const maxAgentsPerMonitor = Math.max(1, Math.ceil(agentCount / perimeterOrder.length))
  const columns = maxAgentsPerMonitor <= 1 ? 1 : Math.ceil(Math.sqrt(maxAgentsPerMonitor))
  const rows = Math.ceil(maxAgentsPerMonitor / columns)
  return {
    width: Math.max(480, Math.floor(size.width / columns)),
    height: Math.max(270, Math.floor(size.height / rows)),
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
  const root = document.createElement('main')
  root.classList.add('wall-root')
  document.body.append(root)

  const monitorElements = new Map<number, HTMLElement>()
  const agents = new Map<string, Agent>()
  const timers = new Set<number>()
  const cameraTimers = new Set<number>()
  const reviewTimers = new Map<string, number>()
  const placementTimers = new Map<string, number>()
  let runId = 0
  let startInProgress = false
  let active = false
  let plannedAgentCount = 0
  let activeSessionId = ''
  let activeSource: 'openai' | 'fallback' = 'fallback'
  let rootReviewRounds = 0
  let rootInstruction = 'Coordinate the complete assembly and merge child KCL into the root view.'
  let kclFiles = new Map<string, string>()
  let interfaceManifests = new Map<string, string>()

  const centerTile = document.createElement('section')
  centerTile.classList.add('wall-tile', 'orchestrator-tile')

  const centerView = new ZooWebView({
    zooClient,
    size: rootViewerSize(),
    allowConcurrentViews: true,
    showStartLogo: true,
  })
  centerView.el.classList.add('wall-view', 'orchestrator-view')

  const centerStatus = document.createElement('div')
  centerStatus.classList.add('center-status')
  centerStatus.textContent = 'Mock websocket ready'

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
      <div class="mode-pill">mock</div>
    </div>
    <label class="prompt-label">Prompt</label>
  `
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

  const writeLog = (target: HTMLElement, line: string, direction: 'in' | 'out' | 'sys' = 'sys') => {
    const row = document.createElement('div')
    row.classList.add('log-row', `log-${direction}`)
    row.textContent = line
    target.appendChild(row)
    while (target.childElementCount > 80) target.firstElementChild?.remove()
    target.scrollTop = target.scrollHeight
  }

  const rootLogLine = (line: string, direction: 'in' | 'out' | 'sys' = 'sys') => {
    writeLog(rootLog, line, direction)
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
        status: active ? 'running' : 'queued',
        filePath: rootFilePath,
        source: activeSource,
      }
    }
    return agents.get(id)
  }

  const graphChildren = (id: string) => Array.from(agents.values())
    .filter(agent => agent.parentId === id)
    .sort((a, b) => a.id.localeCompare(b.id))

  const renderGraphFor = (container: HTMLElement, startId: string, compact: boolean) => {
    const edges: Array<[string, string]> = []
    const points = new Map<string, { x: number, y: number, depth: number }>()
    const visited = new Set<string>()
    const nodeWidth = compact ? 220 : 300
    const nodeHeight = compact ? 58 : 64
    const columnGap = compact ? 52 : 66
    const rowGap = compact ? 18 : 24
    const paddingX = compact ? 20 : 28
    const paddingY = compact ? 24 : 34
    const columnWidth = nodeWidth + columnGap
    const rowHeight = nodeHeight + rowGap
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
          edges.push([id, child.id])
          return layoutTree(child.id, depth + 1)
        })
        y = (childYs[0]! + childYs[childYs.length - 1]!) / 2
      }

      points.set(id, {
        x: paddingX + depth * columnWidth,
        y,
        depth,
      })

      return y
    }

    layoutTree(startId, 0)

    const contentWidth = paddingX * 2 + (maxDepth + 1) * nodeWidth + maxDepth * columnGap
    const contentHeight = paddingY * 2 + Math.max(1, row) * rowHeight
    const width = Math.max(compact ? 760 : 1400, contentWidth)
    const height = Math.max(compact ? 460 : 900, contentHeight)
    const shiftX = (width - contentWidth) / 2
    const shiftY = (height - contentHeight) / 2
    points.forEach((point) => {
      point.x += shiftX
      point.y += shiftY
    })

    const edgeSvg = edges.map(([from, to]) => {
      const start = points.get(from)
      const end = points.get(to)
      if (start === undefined || end === undefined) return ''
      const startX = start.x + nodeWidth
      const startY = start.y + nodeHeight / 2
      const endX = end.x
      const endY = end.y + nodeHeight / 2
      const midX = startX + (endX - startX) / 2
      return `<path class="graph-edge" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`
    }).join('')

    const nodeSvg = Array.from(points.entries()).map(([id, point]) => {
      const agent = graphNode(id)
      if (agent === undefined || point === undefined) return ''
      const maxTitleLength = compact ? 25 : 34
      const primaryLabel = truncateLabel(graphPrimaryLabel(agent), maxTitleLength)
      const secondaryLabel = truncateLabel(graphSecondaryLabel(agent), compact ? 32 : 40)
      const primaryY = secondaryLabel === '' ? nodeHeight / 2 + 5 : (compact ? 24 : 26)
      const secondarySvg = secondaryLabel === ''
        ? ''
        : `<text class="graph-role" x="14" y="${compact ? 43 : 46}">${escapeHtml(secondaryLabel)}</text>`
      return `
        <g class="graph-node graph-${agent.kind}" transform="translate(${point.x} ${point.y})">
          <rect width="${nodeWidth}" height="${nodeHeight}" rx="6" style="--node-color: ${agent.color}" />
          <text class="graph-name" x="14" y="${primaryY}">${escapeHtml(primaryLabel)}</text>
          ${secondarySvg}
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

  const renderAllGraphs = () => {
    renderGraphFor(rootGraph, rootAgentId, false)
    graphPanel.querySelector('.graph-count')!.textContent = `${agents.size} agents`
    for (const agent of agents.values()) {
      if (agent.kind !== 'orchestrator' || agent.graphElement === undefined) continue
      renderGraphFor(agent.graphElement, agent.id, true)
    }
  }

  const layoutAgents = () => {
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

  const agentForFilePath = (filePath: string) => Array.from(agents.values())
    .find(agent => agent.filePath === filePath)

  const descendantFilePaths = (agent: Agent): string[] => [
    agent.filePath,
    ...graphChildren(agent.id).flatMap(child => descendantFilePaths(child)),
  ]

  const renderFilePathsFor = (entryFilePath: string) => {
    if (entryFilePath === rootFilePath) {
      return [
        rootFilePath,
        ...Array.from(agents.values()).map(agent => agent.filePath),
      ]
    }

    const agent = agentForFilePath(entryFilePath)
    if (agent === undefined) return [entryFilePath]
    return descendantFilePaths(agent)
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

  const submitRootProject = () => {
    if (kclFiles.size === 0) return
    void submitProject(centerView, renderProjectFor(rootFilePath), (message) => {
      centerStatus.textContent = `Center KCL failed: ${message}`
    }, () => {
      sendRootCameraCommand(centerView)
    }).catch(() => {})
  }

  const submitAgentProject = async (agent: Agent, onSuccess?: () => void): Promise<RenderResult> => {
    if (kclFiles.size === 0 || agent.view === undefined) return { ok: false, message: 'agent view not ready' }
    const project = renderProjectFor(agent.filePath)
    let failureMessage = ''
    try {
      await submitProject(agent.view, project, (message) => {
        failureMessage = message
        setAgentStatus(agent, 'error')
        appendAgentLog(agent, `kcl failed: ${message}`)
      }, onSuccess)
      return { ok: true }
    } catch (error: unknown) {
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
      renderAllGraphs()
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
      await submitProject(centerView, renderProjectFor(rootFilePath), (message) => {
        centerStatus.textContent = `Center KCL failed: ${message}`
        rootLogLine(`root kcl failed: ${message}`)
      }, () => {
        sendRootCameraCommand(centerView)
        onSuccess?.()
      })
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, message: errorToMessage(error) }
    }
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

  const childInterfaceContext = (agent: Agent) => {
    const children = reviewChildren(agent)
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
    return collect(agent.id)
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

  const workerBodyReady = (agent: Agent) => (
    stripImportLines(kclFiles.get(agent.filePath) ?? '').trim().length > 0
  )

  const pendingWorkerTargets = (agent: Agent) => reviewWorkerTargets(agent)
    .filter(child => !workerBodyReady(child))

  const placementReady = (agent: Agent) => pendingWorkerTargets(agent).length === 0

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
    /\b(assembly|assemble|place|placement|position|translate|rotate|align|axis convention|datum|origin|mate|layout|duplicate|stray|unassembled|integrat|import|clone|hidden|unplaced|root|transform|coaxial)\b/i
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
    const childImports = reviewChildren(parent)
      .map(child => `- ${aliasForFilePath(child.filePath)} from ${child.filePath}: ${child.role}`)
      .join('\n')
    const interfaces = childInterfaceContext(parent)
    return [
      `Update ${parent.name}'s assembly placement layer after ${changedChild.role} changed.`,
      "Use imported child aliases, clone(), hide(), translate(), rotate(), scale(), and appearance() only.",
      "Do not create or modify part geometry. Do not use sketches, profiles, lines, circles, extrude, subtract, or boolean modeling tools.",
      "Before choosing transforms, inspect the child KCL and the interface manifests below for local origins, axes, bounding boxes, mate points, and dimensions.",
      "Place children by aligning named mate points and axes. If a child is missing an interface manifest, infer only from its KCL and leave a concise interface warning in the assembly manifest.",
      "Keep each child part as a separate imported component and place the components into one coherent assembly.",
      childImports ? `Child imports:\n${childImports}` : "",
      interfaces ? `Child interface manifests:\n${interfaces}` : "",
      extra,
    ].filter(Boolean).join("\n")
  }

  const scheduleOrchestratorPlacement = (parent: Agent, changedChild: Agent, extraInstruction = '') => {
    if (!active || parent.kind !== 'orchestrator') return
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

  const requestOrchestratorReview = async (parent: Agent, changedChild: Agent, currentRun: number) => {
    if (currentRun !== runId || !active) return

    const children = reviewWorkerTargets(parent)
    if (children.length === 0) return
    const pendingChildren = pendingWorkerTargets(parent)
    if (pendingChildren.length > 0) {
      reviewLogLine(parent, `< visual review deferred: waiting on ${pendingChildren.map(child => child.role).join(', ')}`, 'in')
      return
    }

    const reviewCount = parent.id === rootAgentId ? rootReviewRounds : (parent.reviewRounds ?? 0)
    if (parent.id === rootAgentId) rootReviewRounds += 1
    else parent.reviewRounds = reviewCount + 1
    reviewLogLine(parent, `-> visual review ${reviewCount + 1} after ${changedChild.role} update`, 'out')

    try {
      const response = await fetch('/api/zookeeper/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          prompt: promptInput.value.trim() || defaultPrompt,
          agent: {
            id: parent.id,
            parentId: parent.parentId,
            kind: parent.kind,
            name: parent.name,
            role: parent.role,
            instruction: parent.instruction,
            filePath: parent.id === rootAgentId ? rootFilePath : parent.filePath,
          },
          child: {
            id: changedChild.id,
            name: changedChild.name,
            role: changedChild.role,
            filePath: changedChild.filePath,
          },
          children: children.map(child => ({
            id: child.id,
            name: child.name,
            role: child.role,
            filePath: child.filePath,
          })),
          files: reviewFilesFor(parent),
          interfaces: objectFromMap(interfaceManifests),
        }),
      })
      if (!response.ok) throw new Error(`review ${response.status}`)
      const review = await response.json() as AgentReviewResponse
      if (currentRun !== runId || !active) return

      review.dialog?.slice(-2).forEach(line => reviewLogLine(parent, `< review ws: ${line}`, 'in'))
      reviewLogLine(parent, `< visual review: ${review.summary}`, 'in')
      if (review.rework.length === 0) {
        reviewLogLine(parent, '< visual review: no child rework requested', 'in')
        return
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
    } catch (error: unknown) {
      if (currentRun !== runId || !active) return
      reviewLogLine(parent, `< visual review failed: ${errorToMessage(error)}`)
    }
  }

  const scheduleOrchestratorReview = (parent: Agent, changedChild: Agent) => {
    if (!active) return
    const currentRun = runId
    const existing = reviewTimers.get(parent.id)
    if (existing !== undefined) window.clearTimeout(existing)
    const timer = window.setTimeout(() => {
      reviewTimers.delete(parent.id)
      void requestOrchestratorReview(parent, changedChild, currentRun)
    }, 1800)
    reviewTimers.set(parent.id, timer)
  }

  const refreshAncestorProjects = (agent: Agent) => {
    let parentId = agent.parentId
    while (parentId !== '') {
      if (parentId === rootAgentId) {
        submitRootProject()
        rootLogLine(`< merged ${agent.role} into root assembly`, 'in')
        const rootAgent = graphNode(rootAgentId)
        if (rootAgent !== undefined) {
          if (placementReady(rootAgent)) scheduleOrchestratorPlacement(rootAgent, agent)
          else {
            const pending = pendingWorkerTargets(rootAgent).map(child => child.role).join(', ')
            rootLogLine(`< root placement deferred: waiting on ${pending}`, 'in')
          }
          scheduleOrchestratorReview(rootAgent, agent)
        }
        break
      }
      const parent = agents.get(parentId)
      if (parent === undefined) break
      appendAgentLog(parent, `< merged child update: ${agent.role}`, 'in')
      void submitAgentProject(parent)
      if (placementReady(parent)) scheduleOrchestratorPlacement(parent, agent)
      else {
        const pending = pendingWorkerTargets(parent).map(child => child.role).join(', ')
        appendAgentLog(parent, `< placement deferred: waiting on ${pending}`, 'in')
      }
      scheduleOrchestratorReview(parent, agent)
      parentId = parent.parentId
    }
  }

  const createAgentPanel = (agent: Agent) => {
    const panel = document.createElement('section')
    panel.classList.add('agent-card', `agent-${agent.kind}`)
    panel.style.setProperty('--agent-color', agent.color)

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
    agent.statusElement = status

    const titleBlock = document.createElement('div')
    titleBlock.append(title, role)
    header.append(titleBlock, status)

    const viewerSlot = document.createElement('div')
    viewerSlot.classList.add('agent-viewer-slot')

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

    const view = new ZooWebView({
      zooClient,
      size: paneViewerSize(),
      allowConcurrentViews: true,
      showStartLogo: false,
    })
    view.el.classList.add('wall-view', 'agent-view')
    agent.view = view

    view.addEventListener('status', (ev: Event) => {
      if (!(ev instanceof CustomEvent) || agent.logElement === undefined) return
      writeLog(agent.logElement, `rtc: ${String(ev.detail)}`)
    })

    view.addEventListener('error', (ev: Event) => {
      const message = ev instanceof CustomEvent ? errorToMessage(ev.detail) : 'view error'
      setAgentStatus(agent, 'error')
      if (agent.logElement !== undefined) writeLog(agent.logElement, `rtc error: ${message}`)
    })

    view.addEventListener('ready', (ev: Event) => {
      const webView = ev.currentTarget
      if (!(webView instanceof ZooWebView)) return
      if (agent.logElement !== undefined) writeLog(agent.logElement, 'modeling websocket: connected', 'in')
      if (agent.logElement !== undefined) writeLog(agent.logElement, `loaded ${agent.filePath}`, 'in')
      void submitAgentProject(agent, () => {
        startCameraInspection(agent)
      })
    })

    viewerSlot.appendChild(view.el)
    agent.element = panel
  }

  const setAgentStatus = (agent: Agent, status: AgentStatus) => {
    agent.status = status
    if (agent.statusElement !== undefined) {
      agent.statusElement.textContent = status
      agent.statusElement.dataset.status = status
    }
    renderAllGraphs()
  }

  const appendAgentLog = (agent: Agent, line: string, direction: 'in' | 'out' | 'sys' = 'sys') => {
    if (agent.logElement === undefined) return
    writeLog(agent.logElement, line, direction)
  }

  const startAgentView = (agent: Agent) => {
    agent.view?.start()
  }

  const startCameraInspection = (agent: Agent) => {
    const webView = agent.view
    if (webView === undefined) return

    const agentIndex = Array.from(agents.keys()).indexOf(agent.id)
    let step = 0
    const intervalMs = 1100 + (agentIndex % 8) * 110
    const tick = () => {
      sendInspectionCameraCommand(webView, Math.max(0, agentIndex), step)
      step += 1
    }
    const delay = window.setTimeout(() => {
      cameraTimers.delete(delay)
      tick()
      const interval = window.setInterval(tick, intervalMs)
      cameraTimers.add(interval)
    }, 250 + (agentIndex % 10) * 60)
    cameraTimers.add(delay)
  }

  const addAgent = (agent: Agent) => {
    createAgentPanel(agent)
    agents.set(agent.id, agent)
    layoutAgents()
    renderAllGraphs()
    rootLogLine(`< zookeeper.spawn ${agent.name}`, 'in')
    appendAgentLog(agent, `assigned parent: ${graphNode(agent.parentId)?.name ?? 'unknown'}`)
    appendAgentLog(agent, `role: ${agent.role}`)
    appendAgentLog(agent, `instruction: ${agent.instruction}`)
    appendAgentLog(agent, `file: ${agent.filePath}`)
    setAgentStatus(agent, 'starting')
    startAgentView(agent)
  }

  const clearTimers = () => {
    for (const timer of timers) window.clearTimeout(timer)
    timers.clear()
    for (const timer of reviewTimers.values()) window.clearTimeout(timer)
    reviewTimers.clear()
    for (const timer of placementTimers.values()) window.clearTimeout(timer)
    placementTimers.clear()
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
      void agent.view?.deconstructor()
      agent.element?.remove()
    })
    agents.clear()
    plannedAgentCount = 0
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

  centerView.addEventListener('status', (ev: Event) => {
    if (!(ev instanceof CustomEvent)) return
    centerStatus.textContent = `Center view: ${String(ev.detail)}`
  })

  centerView.addEventListener('ready', (ev: Event) => {
    const webView = ev.currentTarget
    if (!(webView instanceof ZooWebView)) return
    centerStatus.textContent = 'Center assembly connected'
    submitRootProject()
  })

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

    return seeds.slice(0, mockAgentCount)
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
      const response = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          maxAgents: mockAgentCount,
        }),
      })
      if (!response.ok) {
        throw new Error(`orchestrate ${response.status}`)
      }
      return await response.json() as OrchestrationResponse
    } catch (error: unknown) {
      rootLogLine(`system: OpenAI orchestration unavailable; using fallback (${errorToMessage(error)})`)
      return fallbackOrchestration(prompt)
    }
  }

  const requestAgentWork = async (
    agent: Agent,
    currentRun: number,
    renderError = '',
    repairAttempt = 0,
    reviewInstruction = '',
    zooRetryAttempt = 0,
  ) => {
    if (!agentStillActive(agent, currentRun)) return

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
      const response = await fetch('/api/zookeeper/work', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          prompt: promptInput.value.trim() || defaultPrompt,
          agent: {
            id: agent.id,
            parentId: agent.parentId,
            kind: agent.kind,
            name: agent.name,
            role: agent.role,
            instruction: agent.instruction,
            filePath: agent.filePath,
          },
          rootInstruction,
          files: objectFromMap(kclFiles),
          interfaces: objectFromMap(interfaceManifests),
          currentKcl: kclFiles.get(agent.filePath) ?? '',
          renderError,
          reviewInstruction,
          attempt: repairAttempt,
        }),
      })
      if (!response.ok) throw new Error(`agent work ${response.status}`)
      const update = await response.json() as AgentWorkResponse
      if (!agentStillActive(agent, currentRun)) return

      if (isRetryableZooFallback(update)) {
        update.dialog?.slice(-3).forEach(line => appendWorkAgentLog(agent, `< ws: ${line}`, 'in'))
        appendWorkAgentLog(agent, `< hosted Zookeeper failed: ${update.summary}`, 'in')
        if (zooRetryAttempt < maxZooFallbackRetries) {
          const nextRetry = zooRetryAttempt + 1
          appendWorkAgentLog(agent, `-> retrying hosted Zookeeper after websocket fallback (${nextRetry}/${maxZooFallbackRetries})`, 'out')
          await wait(zooFallbackRetryBackoffMs * nextRetry)
          if (!agentStillActive(agent, currentRun)) return
          await requestAgentWork(agent, currentRun, renderError, repairAttempt, reviewInstruction, nextRetry)
          return
        }
        appendWorkAgentLog(agent, `< fallback refused after ${maxZooFallbackRetries} retries; no KCL accepted`)
        setWorkAgentStatus(agent, 'error')
        return
      }

      kclFiles.set(agent.filePath, update.kcl)
      updateInterfaceManifest(agent, update.kcl)
      if (update.dialog !== undefined && update.dialog.length > 0) {
        update.dialog.slice(-3).forEach(line => appendWorkAgentLog(agent, `< ws: ${line}`, 'in'))
      }
      appendWorkAgentLog(agent, `< ${update.source === 'zookeeper' ? 'Zookeeper auto KCL' : 'fallback KCL'}: ${update.summary}`, 'in')
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
          await requestAgentWork(agent, currentRun, message, repairAttempt + 1, reviewInstruction)
        } else {
          appendWorkAgentLog(agent, `< renderer rejected KCL after ${maxAgentRepairAttempts} repair attempts: ${message}`)
          setWorkAgentStatus(agent, 'error')
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
      appendWorkAgentLog(agent, `< agent update failed: ${errorToMessage(error)}`)
      setWorkAgentStatus(agent, 'error')
    }
  }

  const runZookeeper = async () => {
    if (startInProgress) return
    startInProgress = true
    active = true
    runId += 1
    const currentRun = runId
    startButton.disabled = true
    startButton.textContent = 'Planning...'
    stopButton.disabled = false
    clearTimers()
    resetAgents()
    rootReviewRounds = 0
    rootLog.replaceChildren()
    const prompt = promptInput.value.trim() || defaultPrompt
    rootLogLine('system: zookeeper orchestration opened')
    rootLogLine(`system: retrying transient hosted Zoo fallbacks up to ${maxZooFallbackRetries} times`)
    rootLogLine(`-> prompt "${prompt}"`, 'out')

    const plan = await requestOrchestration(prompt)
    if (currentRun !== runId) return

    activeSessionId = plan.sessionId
    activeSource = plan.source
    rootInstruction = plan.root.instruction
    kclFiles = new Map(Object.entries(plan.files))
    interfaceManifests = new Map()
    rootLogLine(`< ${plan.source} plan accepted: ${plan.agents.length} sub-agents`, 'in')
    plan.notes?.forEach(note => rootLogLine(`system: ${note}`))
    renderAllGraphs()
    startCenterView()

    await wait(700)
    if (currentRun !== runId) return
    startButton.textContent = 'Spooling agents...'

    const seeds = plan.agents.slice(0, mockAgentCount)
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

        if (agent.kind === 'orchestrator') {
          appendAgentLog(agent, '-> decompose sub-assembly', 'out')
          appendAgentLog(agent, '< child scope accepted', 'in')
        } else {
          appendAgentLog(agent, '-> generate KCL candidate', 'out')
          appendAgentLog(agent, '< geometry constraints received', 'in')
        }

        after(900 + index * 35, () => {
          if (currentRun !== runId || !agents.has(agent.id)) return
          if (agent.status === 'error') return
          setAgentStatus(agent, agent.kind === 'orchestrator' ? 'reviewing' : 'running')
          appendAgentLog(agent, '< empty workspace initialized', 'in')
          rootLogLine(`< ${agent.name} workspace_ready`, 'in')
        })

        after(1900 + index * 90, () => {
          if (currentRun !== runId || !agents.has(agent.id)) return
          if (agent.status === 'error') return
          if (agent.kind === 'orchestrator') {
            appendAgentLog(agent, '< waiting for child KCL updates', 'in')
            setAgentStatus(agent, 'reviewing')
            return
          }
          void requestAgentWork(agent, currentRun)
        })
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

  stopButton.addEventListener('click', () => {
    runId += 1
    active = false
    startInProgress = false
    clearTimers()
    resetAgents()
    rootReviewRounds = 0
    activeSessionId = ''
    kclFiles = new Map()
    interfaceManifests = new Map()
    void centerView.deconstructor()
    rootLogLine('system: zookeeper stopped')
    startButton.disabled = false
    startButton.textContent = 'Start Zookeeper'
    stopButton.disabled = true
    centerStatus.textContent = 'Mock websocket ready'
    renderAllGraphs()
  })

  startButton.addEventListener('click', () => {
    void runZookeeper()
  })

  stopButton.disabled = true

  for (let index = 0; index < rows * cols; index += 1) {
    if (index === centerIndex) {
      root.appendChild(centerTile)
      continue
    }

    const tile = document.createElement('section')
    tile.classList.add('wall-tile', 'agent-monitor-tile')

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
})
