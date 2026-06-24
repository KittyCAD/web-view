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

type WallView = {
  index: number,
  name: string,
  role: string,
  filePath: string,
  color: string,
  center: { x: number, y: number, z: number },
  project: Map<string, string>,
  isOrchestrator?: boolean,
}

type PlannedPart = {
  name: string,
  role: string,
  description: string,
  color: string,
  width: number,
  height: number,
  depth: number,
  position: { x: number, y: number, z: number },
}

type PromptPlan = {
  title: string,
  summary: string,
  parts: PlannedPart[],
}

type RuntimeView = {
  wallView: WallView,
  webView: ZooWebView,
  log: HTMLElement,
  state: HTMLElement | null,
  name: HTMLElement | null,
  role: HTMLElement | null,
  ready: boolean,
  pendingProject?: Map<string, string>,
}

const rows = 3
const cols = 3
const centerIndex = 4
const perimeterOrder = [0, 1, 2, 5, 8, 7, 6, 3]

const colors = [
  '#00A3FF',
  '#FF4F8B',
  '#F5C542',
  '#44D07B',
  '#C084FC',
  '#FF8A3D',
  '#2DD4BF',
  '#F97316',
]

const partRoles = [
  'chamber liner',
  'injector plate',
  'nozzle contour',
  'regen cooling jacket',
  'turbopump package',
  'thrust frame',
  'sensor harness',
  'gimbal ring',
]

const pathForRole = (role: string) => `parts/${role.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.kcl`

const format = (value: number) => Number(value.toFixed(3))

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const slugify = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'part'

const randomId = () => `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`

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

const installWebRTCNoIceServerOfferPatch = () => {
  const WebRTCClass = zoo.WebRTC as unknown as {
    prototype: {
      iceOnIceServerInfo?: (message: { data?: { ice_servers?: RTCIceServer[] } }) => Promise<void>,
      rtcPeerConnection: RTCPeerConnection,
      workerWebRTC: Worker,
    },
  }
  const proto = WebRTCClass.prototype
  if (typeof proto.iceOnIceServerInfo !== 'function') return

  proto.iceOnIceServerInfo = async function patchedIceOnIceServerInfo(message) {
    const iceServers = message.data?.ice_servers ?? []
    this.rtcPeerConnection.setConfiguration({
      bundlePolicy: 'max-bundle',
      iceServers,
      ...(iceServers.length > 0 ? { iceTransportPolicy: 'relay' as RTCIceTransportPolicy } : {}),
    })
    const offer = await this.rtcPeerConnection.createOffer()
    await this.rtcPeerConnection.setLocalDescription(offer)
    this.workerWebRTC.postMessage({
      to: 'websocket',
      payload: {
        type: 'send',
        data: [JSON.stringify({ type: 'sdp_offer', offer })],
      },
    })
  }
}

const tokenFromRuntime = () => {
  const url = new URL(window.location.href)
  const queryToken = url.searchParams.get('zooToken') ?? undefined
  if (queryToken !== undefined && queryToken.length > 0) {
    window.localStorage.setItem('ZOO_API_TOKEN', queryToken)
    url.searchParams.delete('zooToken')
    window.history.replaceState({}, '', url)
    return queryToken
  }
  return window.ZOO_API_TOKEN ?? window.localStorage.getItem('ZOO_API_TOKEN') ?? undefined
}

const createZooClient = () => {
  const token = tokenFromRuntime()
  if (token === undefined) {
    return new zoo.Client({
      baseUrl: 'https://api.zoo.dev',
      clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      redirectUrl: window.location.origin,
      scopes: ['modeling'],
    })
  }

  const zooClient = new zoo.Client({
    token,
    baseUrl: 'https://api.zoo.dev',
  })
  const tokenClient = zooClient as zoo.Client & {
    oauth2?: {
      getAccessToken: () => Promise<{ token: { value: string } }>,
      fetchAuthorizationCode: () => void,
    },
  }
  tokenClient.oauth2 ??= {
    getAccessToken: async () => ({ token: { value: token } }),
    fetchAuthorizationCode: () => {
      window.console.warn('Zoo token was rejected; replace ZOO_API_TOKEN and reload the wall.')
    },
  }
  return tokenClient
}

const workerKcl = (
  index: number,
  role: string,
  color: string,
  center: WallView['center'],
  prefix = '',
) => {
  const id = (name: string) => `${prefix}${name}`
  const width = format(1.15 + (index % 4) * 0.28)
  const height = format(0.82 + (index % 3) * 0.2)
  const depth = format(0.92 + index * 0.12)
  const x = format(center.x - width / 2)
  const y = format(center.y - height / 2)
  const capWidth = format(width * 0.42)
  const capHeight = format(height * 0.26)

  return `
// Zookeeper Worker ${String(index + 1).padStart(4, '0')}: ${role}
${id('sketch001')} = startSketchOn(XY)
${id('profile001')} = startProfile(${id('sketch001')}, at = [${x}, ${y}])
  |> line(end = [${width}, 0])
  |> line(end = [0, ${height}])
  |> line(end = [${format(-width)}, 0])
  |> close()
${id('extrude001')} = extrude(${id('profile001')}, length = ${depth})
  |> appearance(color="${color}")

${id('sketch002')} = startSketchOn(XY)
${id('profile002')} = startProfile(${id('sketch002')}, at = [${format(center.x - capWidth / 2)}, ${format(center.y + height * 0.05)}])
  |> line(end = [${capWidth}, 0])
  |> line(end = [0, ${capHeight}])
  |> line(end = [${format(-capWidth)}, 0])
  |> close()
${id('extrude002')} = extrude(${id('profile002')}, length = ${format(depth + 0.34)})
  |> appearance(color="#F8FAFC")
`.trimStart()
}

const sanitizeColor = (color: string | undefined, index: number) => {
  if (color !== undefined && /^#[0-9a-f]{6}$/i.test(color)) return color
  return colors[index % colors.length] ?? '#2DD4BF'
}

const sanitizePart = (value: unknown, index: number, count: number): PlannedPart => {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const name = typeof record.name === 'string' && record.name.trim().length > 0
    ? record.name.trim()
    : `Generated Part ${String(index + 1).padStart(2, '0')}`
  const role = typeof record.role === 'string' && record.role.trim().length > 0
    ? record.role.trim()
    : name
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const angle = (Math.PI * 2 * index) / Math.max(1, count) - Math.PI / 2
  const positionRecord = typeof record.position === 'object' && record.position !== null
    ? record.position as Record<string, unknown>
    : {}
  const numberOr = (input: unknown, fallback: number) => typeof input === 'number' && Number.isFinite(input) ? input : fallback

  return {
    name,
    role,
    description,
    color: sanitizeColor(typeof record.color === 'string' ? record.color : undefined, index),
    width: format(clamp(numberOr(record.width, 1.15 + (index % 4) * 0.26), 0.35, 3.5)),
    height: format(clamp(numberOr(record.height, 0.82 + (index % 3) * 0.18), 0.35, 2.8)),
    depth: format(clamp(numberOr(record.depth, 0.85 + index * 0.1), 0.25, 3.2)),
    position: {
      x: format(clamp(numberOr(positionRecord.x, Math.cos(angle) * 3.15), -4.2, 4.2)),
      y: format(clamp(numberOr(positionRecord.y, Math.sin(angle) * 1.75), -2.35, 2.35)),
      z: format(clamp(numberOr(positionRecord.z, 0.58), 0.15, 1.4)),
    },
  }
}

const sanitizePlan = (value: unknown): PromptPlan => {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const rawParts = Array.isArray(record.parts) ? record.parts.slice(0, perimeterOrder.length) : []
  const parts = rawParts.map((part, index) => sanitizePart(part, index, rawParts.length))
  return {
    title: typeof record.title === 'string' && record.title.trim().length > 0 ? record.title.trim() : 'Prompted Assembly',
    summary: typeof record.summary === 'string' ? record.summary.trim() : '',
    parts,
  }
}

const plannedPartKcl = (
  part: PlannedPart,
  index: number,
  center: WallView['center'],
  prefix = '',
) => {
  const id = (name: string) => `${prefix}${name}`
  const width = part.width
  const height = part.height
  const depth = part.depth
  const x = format(center.x - width / 2)
  const y = format(center.y - height / 2)
  const ribWidth = format(width * 0.68)
  const ribHeight = format(Math.max(0.18, height * 0.2))
  const postWidth = format(Math.max(0.2, Math.min(width, height) * 0.28))

  return `// ${part.name}: ${part.description || part.role}
${id('sketch001')} = startSketchOn(XY)
${id('profile001')} = startProfile(${id('sketch001')}, at = [${x}, ${y}])
  |> line(end = [${width}, 0])
  |> line(end = [0, ${height}])
  |> line(end = [${format(-width)}, 0])
  |> close()
${id('body001')} = extrude(${id('profile001')}, length = ${depth})
  |> appearance(color="${part.color}")

${id('sketch002')} = startSketchOn(XY)
${id('profile002')} = startProfile(${id('sketch002')}, at = [${format(center.x - ribWidth / 2)}, ${format(center.y - ribHeight / 2)}])
  |> line(end = [${ribWidth}, 0])
  |> line(end = [0, ${ribHeight}])
  |> line(end = [${format(-ribWidth)}, 0])
  |> close()
${id('rib001')} = extrude(${id('profile002')}, length = ${format(depth + 0.28 + index * 0.03)})
  |> appearance(color="#F8FAFC")

${id('sketch003')} = startSketchOn(XY)
${id('profile003')} = startProfile(${id('sketch003')}, at = [${format(center.x + width * 0.18 - postWidth / 2)}, ${format(center.y + height * 0.18 - postWidth / 2)}])
  |> line(end = [${postWidth}, 0])
  |> line(end = [0, ${postWidth}])
  |> line(end = [${format(-postWidth)}, 0])
  |> close()
${id('post001')} = extrude(${id('profile003')}, length = ${format(depth + 0.54)})
  |> appearance(color="#CBD5E1")
`.trimStart()
}

const assemblyDatumKcl = (title: string) => `// Zookeeper Orchestrator assembly: ${title}
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [-4.8, -2.75])
  |> line(end = [9.6, 0])
  |> line(end = [0, 5.5])
  |> line(end = [-9.6, 0])
  |> close()
extrude001 = extrude(profile001, length = 0.14)
  |> appearance(color="#111827")
`.trimStart()

const projectForPart = (part: PlannedPart, index: number) => {
  const project = new Map<string, string>()
  project.set('main.kcl', plannedPartKcl(part, index, { x: 0, y: 0, z: part.position.z }))
  return project
}

const projectForAssembly = (plan: PromptPlan) => {
  const project = new Map<string, string>()
  project.set(
    'main.kcl',
    `${assemblyDatumKcl(plan.title)}\n\n${plan.parts.map((part, index) => (
      plannedPartKcl(part, index, part.position, `p${String(index + 1).padStart(2, '0')}_`)
    )).join('\n\n')}`,
  )
  return project
}

const orchestratorKcl = () => `
// Zookeeper Orchestrator assembly datum plate.
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [-4.6, -2.65])
  |> line(end = [9.2, 0])
  |> line(end = [0, 5.3])
  |> line(end = [-9.2, 0])
  |> close()
extrude001 = extrude(profile001, length = 0.18)
  |> appearance(color="#111827")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [-0.95, -0.55])
  |> line(end = [1.9, 0])
  |> line(end = [0, 1.1])
  |> line(end = [-1.9, 0])
  |> close()
extrude002 = extrude(profile002, length = 0.92)
  |> appearance(color="#2DD4BF")
`.trimStart()

const createWallViews = (): WallView[] => {
  const workers = partRoles.map((role, workerIndex) => {
    const angle = (Math.PI * 2 * workerIndex) / partRoles.length - Math.PI / 2
    const center = {
      x: format(Math.cos(angle) * 3.1),
      y: format(Math.sin(angle) * 1.72),
      z: 0.55,
    }
    const filePath = pathForRole(role)
    const kcl = workerKcl(workerIndex, role, colors[workerIndex]!, { x: 0, y: 0, z: center.z })
    const assemblyKcl = workerKcl(workerIndex, role, colors[workerIndex]!, center, `w${String(workerIndex + 1).padStart(2, '0')}_`)
    const project = new Map<string, string>()
    project.set('main.kcl', kcl)

    return {
      index: perimeterOrder[workerIndex]!,
      name: `Zookeeper Worker ${String(workerIndex + 1).padStart(4, '0')}`,
      role,
      filePath,
      color: colors[workerIndex]!,
      center,
      project,
      source: assemblyKcl,
    }
  })

  const assemblyProject = new Map<string, string>()
  assemblyProject.set('main.kcl', `${orchestratorKcl()}\n\n${workers.map(worker => worker.source).join('\n\n')}`)

  return [
    ...workers.map(({ source: _source, ...worker }) => worker),
    {
      index: centerIndex,
      name: 'Zookeeper Orchestrator',
      role: 'assembly view',
      filePath: 'main.kcl',
      color: '#2DD4BF',
      center: { x: 0, y: 0, z: 0.65 },
      project: assemblyProject,
      isOrchestrator: true,
    },
  ].sort((left, right) => left.index - right.index)
}

const tileSize = (): Size => ({
  width: Math.floor(window.innerWidth / cols),
  height: Math.floor(window.innerHeight / rows),
})

const viewSizeForTile = (tile: HTMLElement): Size => {
  const rect = tile.getBoundingClientRect()
  const serviceMax = 2592
  const scale = Math.min(1, serviceMax / rect.width, serviceMax / rect.height)
  const width = rect.width * scale
  const height = rect.height * scale
  return {
    width: Math.max(64, Math.floor(width - width % 4)),
    height: Math.max(64, Math.floor(height - height % 4)),
  }
}

const sendBatch = (webView: ZooWebView, requests: object[]) => {
  webView.rtc?.send(JSON.stringify({
    type: 'modeling_cmd_batch_req',
    requests,
    batch_id: randomId(),
    responses: false,
  }))
}

const sendInitialCamera = (webView: ZooWebView) => {
  sendBatch(webView, [
    {
      cmd: {
        type: 'edge_lines_visible',
        hidden: false,
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
  ])
}

const startInspectionCamera = (webView: ZooWebView, wallView: WallView) => {
  let step = 0
  const tick = () => {
    const angle = step * 0.86 + wallView.index * 0.31
    const orbit = wallView.isOrchestrator ? 10.8 : 5.1
    sendBatch(webView, [
      {
        cmd: {
          type: 'default_camera_look_at',
          center: wallView.center,
          sequence: step,
          up: { x: 0, y: 0, z: 1 },
          vantage: {
            x: format(wallView.center.x + Math.cos(angle) * orbit),
            y: format(wallView.center.y + Math.sin(angle) * orbit),
            z: format(wallView.isOrchestrator ? 5.8 : 3.2 + (step % 3) * 0.24),
          },
        },
        cmd_id: randomId(),
      },
    ])
    step += 1
  }

  window.setTimeout(() => {
    tick()
    window.setInterval(tick, 850 + wallView.index * 35)
  }, 450 + wallView.index * 90)
}

const writeLog = (log: HTMLElement, line: string, direction: 'in' | 'out' | 'sys' = 'sys') => {
  const row = document.createElement('div')
  row.classList.add('log-row', `log-${direction}`)
  row.textContent = line
  log.appendChild(row)
  log.scrollTop = log.scrollHeight
}

const attachWorkerDebugLog = (webView: ZooWebView, log: HTMLElement) => {
  const deadline = window.performance.now() + 8000
  const attach = () => {
    const worker = webView.rtc?.workerWebRTC
    if (worker !== undefined) {
      worker.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { from?: string, payload?: { status?: string, url?: string, data?: string } }
        if (data.from === 'debug' && data.payload?.status !== undefined) {
          const url = data.payload.url === undefined ? '' : ` ${data.payload.url.replace(/([?&]token=)[^&]+/g, '$1[redacted]')}`
          writeLog(log, `rtc: ${data.payload.status}${url}`)
        }
        if (data.from === 'websocket' && data.payload?.data !== undefined) {
          const raw = data.payload.data
          let text = raw
          try {
            const parsed = JSON.parse(raw) as { resp?: { type?: string, data?: unknown }, type?: string }
            text = parsed.resp?.type ?? parsed.type ?? raw
            if (parsed.resp?.type === 'ice_server_info') {
              const iceServers = (parsed.resp.data as { ice_servers?: unknown[] } | undefined)?.ice_servers ?? []
              text = `${text} ice_servers=${iceServers.length}`
            }
          } catch {
            text = raw
          }
          writeLog(log, `ws: ${text.slice(0, 180)}`, 'in')
        }
      })
      return
    }
    if (window.performance.now() < deadline) window.setTimeout(attach, 50)
  }
  attach()
}

const fetchPromptPlan = async (prompt: string) => {
  const response = await fetch('/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const payload = await response.json() as { plan?: unknown, error?: string }
  if (!response.ok || payload.plan === undefined) {
    throw new Error(payload.error ?? `planner failed with HTTP ${response.status}`)
  }
  const plan = sanitizePlan(payload.plan)
  if (plan.parts.length === 0) throw new Error('planner returned no parts')
  return plan
}

const submitRuntimeProject = async (
  runtime: RuntimeView,
  project: Map<string, string>,
  label: string,
) => {
  runtime.pendingProject = project
  runtime.wallView.project = project
  runtime.wallView.filePath = label
  writeLog(runtime.log, `loading ${label}`)

  if (!runtime.ready) {
    writeLog(runtime.log, 'queued until engine is ready')
    return
  }

  const executor = runtime.webView.rtc?.executor()
  if (executor === undefined) {
    writeLog(runtime.log, 'engine executor unavailable')
    return
  }

  if (runtime.state !== null) runtime.state.textContent = 'rendering'
  try {
    await executor.submit(project)
    runtime.pendingProject = undefined
    if (runtime.state !== null) runtime.state.textContent = 'live'
    writeLog(runtime.log, `submitted ${project.size} KCL file${project.size === 1 ? '' : 's'}`, 'in')
    sendInitialCamera(runtime.webView)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (runtime.state !== null) runtime.state.textContent = 'error'
    writeLog(runtime.log, `render failed: ${message}`)
  }
}

const applyPromptPlan = async (plan: PromptPlan, runtimes: Map<number, RuntimeView>) => {
  const centerRuntime = runtimes.get(centerIndex)
  if (centerRuntime !== undefined) {
    if (centerRuntime.role !== null) centerRuntime.role.textContent = plan.title
    writeLog(centerRuntime.log, `planner: ${plan.summary || `generated ${plan.parts.length} parts`}`)
    await submitRuntimeProject(centerRuntime, projectForAssembly(plan), 'prompted-assembly.kcl')
  }

  await Promise.all(plan.parts.map(async (part, partIndex) => {
    const tileIndex = perimeterOrder[partIndex]
    if (tileIndex === undefined) return
    const runtime = runtimes.get(tileIndex)
    if (runtime === undefined) return
    runtime.wallView.role = part.name
    runtime.wallView.filePath = `parts/${slugify(part.name)}.kcl`
    runtime.wallView.color = part.color
    runtime.wallView.center = { x: 0, y: 0, z: part.position.z }
    runtime.webView.el.parentElement?.parentElement?.style.setProperty('--accent', part.color)
    if (runtime.role !== null) runtime.role.textContent = part.name.toUpperCase()
    writeLog(runtime.log, `assignment: ${part.role}`)
    if (part.description.length > 0) writeLog(runtime.log, `prompt context: ${part.description}`)
    await submitRuntimeProject(runtime, projectForPart(part, partIndex), runtime.wallView.filePath)
  }))
}

const createPromptPanel = (
  tile: HTMLElement,
  runtimes: Map<number, RuntimeView>,
) => {
  const panel = document.createElement('form')
  panel.classList.add('prompt-panel')
  panel.innerHTML = `
    <label class="prompt-label" for="zookeeper-prompt">Orchestrator Prompt</label>
    <textarea id="zookeeper-prompt" class="prompt-input" rows="4" spellcheck="false"></textarea>
    <div class="prompt-actions">
      <button class="prompt-button" type="submit">Run Prompt</button>
      <div class="prompt-status">ready</div>
    </div>
  `

  const input = panel.querySelector<HTMLTextAreaElement>('.prompt-input')
  const button = panel.querySelector<HTMLButtonElement>('.prompt-button')
  const status = panel.querySelector<HTMLElement>('.prompt-status')
  const url = new URL(window.location.href)
  input!.value = url.searchParams.get('prompt') ?? 'Design a compact lunar sample processing station as an eight-part assembly. Use distinct modules for intake, crushing, sorting, heating, spectrometry, sample storage, power electronics, and a frame. Keep the parts spatially separated but visibly related as one machine.'

  const run = async () => {
    const prompt = input?.value.trim() ?? ''
    if (prompt.length === 0) return
    if (button !== null) button.disabled = true
    if (status !== null) status.textContent = 'prompting'
    const centerRuntime = runtimes.get(centerIndex)
    if (centerRuntime !== undefined) writeLog(centerRuntime.log, `prompt: ${prompt}`)
    try {
      const plan = await fetchPromptPlan(prompt)
      if (status !== null) status.textContent = `${plan.parts.length} assignments`
      await applyPromptPlan(plan, runtimes)
      if (status !== null) status.textContent = 'rendered'
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (status !== null) status.textContent = 'error'
      if (centerRuntime !== undefined) writeLog(centerRuntime.log, `planner failed: ${message}`)
    } finally {
      if (button !== null) button.disabled = false
    }
  }

  panel.addEventListener('submit', (event) => {
    event.preventDefault()
    void run()
  })

  tile.appendChild(panel)

  if (url.searchParams.get('autoPrompt') === '1') {
    url.searchParams.delete('autoPrompt')
    window.history.replaceState({}, '', url)
    window.setTimeout(() => void run(), 3500)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  installWorkerWebSocketSendQueuePatch()
  installWebRTCNoIceServerOfferPatch()
  document.body.replaceChildren()

  const root = document.createElement('main')
  root.classList.add('wall-root')
  document.body.appendChild(root)

  const wallViews = createWallViews()
  const tiles = new Map<number, HTMLElement>()
  const runtimes = new Map<number, RuntimeView>()

  for (let index = 0; index < rows * cols; index += 1) {
    const tile = document.createElement('section')
    tile.classList.add('wall-tile')
    tile.dataset.index = String(index)
    root.appendChild(tile)
    tiles.set(index, tile)
  }

  requestAnimationFrame(() => {
    wallViews.forEach((wallView) => {
      const tile = tiles.get(wallView.index)
      if (tile === undefined) return

      tile.classList.add(wallView.isOrchestrator === true ? 'orchestrator-tile' : 'worker-tile')
      tile.style.setProperty('--accent', wallView.color)

      const viewerSlot = document.createElement('div')
      viewerSlot.classList.add('viewer-slot')

      const overlay = document.createElement('div')
      overlay.classList.add('tile-overlay')
      overlay.innerHTML = `
        <div>
          <div class="tile-name">${wallView.name}</div>
          <div class="tile-role">${wallView.role}</div>
        </div>
        <div class="tile-state">starting</div>
      `

      const log = document.createElement('div')
      log.classList.add('tile-log')
      writeLog(log, `loading ${wallView.filePath}`)

      const webView = new ZooWebView({
        zooClient: createZooClient(),
        size: viewSizeForTile(tile),
        allowMultiple: true,
        autoStart: true,
      })
      webView.el.classList.add('wall-view')
      attachWorkerDebugLog(webView, log)

      const state = overlay.querySelector<HTMLElement>('.tile-state')
      const name = overlay.querySelector<HTMLElement>('.tile-name')
      const role = overlay.querySelector<HTMLElement>('.tile-role')
      const runtime: RuntimeView = {
        wallView,
        webView,
        log,
        state,
        name,
        role,
        ready: false,
      }
      runtimes.set(wallView.index, runtime)

      webView.addEventListener('ready', (event: Event) => {
        const currentView = event.currentTarget
        if (!(currentView instanceof ZooWebView)) return
        if (state !== null) state.textContent = 'rendering'
        writeLog(log, 'engine websocket connected', 'in')
        runtime.ready = true

        void submitRuntimeProject(runtime, runtime.pendingProject ?? wallView.project, wallView.filePath).then(() => {
          startInspectionCamera(currentView, wallView)
        })
      })

      viewerSlot.appendChild(webView.el)
      tile.append(viewerSlot, overlay, log)
      if (wallView.isOrchestrator === true) createPromptPanel(tile, runtimes)
    })
  })

  window.addEventListener('resize', () => {
    const size = tileSize()
    document.documentElement.style.setProperty('--tile-width', `${size.width}px`)
    document.documentElement.style.setProperty('--tile-height', `${size.height}px`)
  })
})
