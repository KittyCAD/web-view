import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { extname, join, normalize, resolve } from 'node:path'

const port = Number(process.env.PORT || 3000)
const publicDir = resolve(process.env.WALL_PUBLIC_DIR || join(process.cwd(), 'public'))
const openaiApiKey = process.env.OPENAI_API_KEY
const openaiModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini'
const rootFilePath = 'main.kcl'
const maxDefaultAgents = 50

const colors = [
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

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.json', 'application/json; charset=utf-8'],
  ['.kcl', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
])

const format = value => Number(value.toFixed(3))

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const slug = value => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'agent'

const sanitizeText = (value, fallback) => String(value || fallback)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 220) || fallback

const colorFor = value => {
  const hash = createHash('sha1').update(String(value)).digest()
  return colors[hash[0] % colors.length]
}

const mainFileFor = filePaths => `${filePaths.map(filePath => `import "${filePath}"`).join('\n')}\n`

const extractImportLines = kcl => String(kcl || '')
  .split('\n')
  .filter(line => line.trim().startsWith('import '))
  .join('\n')

const stripImportLines = kcl => String(kcl || '')
  .split('\n')
  .filter(line => !line.trim().startsWith('import '))
  .join('\n')

const stripMarkdownFences = value => String(value || '')
  .trim()
  .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
  .replace(/\s*```$/, '')
  .trim()

const cleanModelKcl = value => `${stripImportLines(stripMarkdownFences(value)).trim()}\n`

const attachImports = (imports, bodyKcl) => {
  const cleanBody = String(bodyKcl || '').trim()
  if (!String(imports || '').trim()) return `${cleanBody}\n`
  return `${imports.trim()}\n\n${cleanBody}\n`
}

const kclSanityError = kcl => {
  const text = String(kcl || '')
  const forbidden = ['```', 'import ', 'function ', 'fn ', 'for ', 'while ', 'return ', 'export ']
  for (const token of forbidden) {
    if (text.includes(token)) return `contains unsupported token ${token.trim()}`
  }
  const required = ['startSketchOn', 'startProfile', 'line(end =', 'close()', 'extrude', 'appearance']
  for (const token of required) {
    if (!text.includes(token)) return `missing required KCL primitive ${token}`
  }
  if (!/#[0-9a-fA-F]{6}/.test(text)) return 'missing hex appearance color'
  return undefined
}

const createWorkerKcl = (index, role, color, scale = 1) => {
  const width = format((1.35 + (index % 6) * 0.22) * scale)
  const height = format((0.95 + (index % 5) * 0.16) * scale)
  const length = format((1.0 + index * 0.09) * scale)
  const left = format(-width / 2)
  const bottom = format(-height / 2)
  const capWidth = format(width * 0.48)
  const capHeight = format(height * 0.22)
  const capY = format(height * 0.18)

  return `
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [${left}, ${bottom}])
  |> line(end = [${width}, 0])
  |> line(end = [0, ${height}])
  |> line(end = [${-width}, 0])
  |> close()
extrude001 = extrude(profile001, length = ${length})
  |> appearance(color="${color}")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [${format(-capWidth / 2)}, ${capY}])
  |> line(end = [${capWidth}, 0])
  |> line(end = [0, ${capHeight}])
  |> line(end = [${-capWidth}, 0])
  |> close()
extrude002 = extrude(profile002, length = ${format(length + 0.28)})
  |> appearance(color="#F8FAFC")
`.trimStart()
}

const createOrchestratorKcl = (index, role, color, scale = 1) => {
  const width = format((4.2 + index * 0.14) * scale)
  const height = format((2.2 + index * 0.08) * scale)
  const depth = format((0.55 + (index % 4) * 0.14) * scale)
  const tower = format((1.2 + index * 0.08) * scale)
  const left = format(-width / 2)
  const bottom = format(-height / 2)
  const ribX = format(-width / 4)
  const podX = format(width / 4 - 0.55 * scale)

  return `
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [${left}, ${bottom}])
  |> line(end = [${width}, 0])
  |> line(end = [0, ${height}])
  |> line(end = [${-width}, 0])
  |> close()
extrude001 = extrude(profile001, length = ${depth})
  |> appearance(color="${color}")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [${ribX}, ${format(-height / 3)}])
  |> line(end = [${format(0.82 * scale)}, 0])
  |> line(end = [0, ${format(height * 0.66)}])
  |> line(end = [${format(-0.82 * scale)}, 0])
  |> close()
extrude002 = extrude(profile002, length = ${tower})
  |> appearance(color="#F8FAFC")

sketch003 = startSketchOn(XY)
profile003 = startProfile(sketch003, at = [${podX}, ${format(-height / 4)}])
  |> line(end = [${format(1.1 * scale)}, 0])
  |> line(end = [0, ${format(height / 2)}])
  |> line(end = [${format(-1.1 * scale)}, 0])
  |> close()
extrude003 = extrude(profile003, length = ${format(tower + 0.45 * scale)})
  |> appearance(color="${color}")
`.trimStart()
}

const createRootKcl = () => `
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
`.trimStart()

const fallbackAgents = maxAgents => {
  const seeds = []
  const orchestratorIds = []
  topLevelRoles.forEach((role, index) => {
    const id = `sub-orchestrator-${String(index + 1).padStart(4, '0')}`
    orchestratorIds.push(id)
    seeds.push({
      id,
      parentId: 'zookeeper-orchestrator-root',
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
      parentId: orchestratorIds[index % topLevelRoles.length],
      kind: 'orchestrator',
      name: `Zookeeper Sub-Orchestrator ${String(topLevelRoles.length + index + 1).padStart(4, '0')}`,
      role,
      instruction: `Recursively decompose ${role}. Request worker KCL for concrete parts and maintain a renderable assembly file.`,
      filePath: `generated/${id}.kcl`,
      source: 'fallback',
    })
  })
  workerRoles.forEach((role, index) => {
    const id = `worker-${String(index + 1).padStart(4, '0')}`
    seeds.push({
      id,
      parentId: orchestratorIds[index % orchestratorIds.length],
      kind: 'worker',
      name: `Zookeeper Worker ${String(index + 1).padStart(4, '0')}`,
      role,
      instruction: `Produce clean, renderable KCL for the ${role}. Keep the part simple enough to update quickly in the wall renderer.`,
      filePath: `generated/${id}.kcl`,
      source: 'fallback',
    })
  })
  return seeds.slice(0, maxAgents)
}

const buildFiles = agents => {
  const files = {}
  const topLevelFiles = agents
    .filter(agent => agent.parentId === 'zookeeper-orchestrator-root')
    .map(agent => agent.filePath)
  files[rootFilePath] = `${mainFileFor(topLevelFiles)}\n${createRootKcl()}`

  agents.forEach((agent, index) => {
    const childFiles = agents
      .filter(child => child.parentId === agent.id)
      .map(child => child.filePath)
    const imports = mainFileFor(childFiles)
    const body = agent.kind === 'orchestrator'
      ? createOrchestratorKcl(index + 1, agent.role, colorFor(agent.id))
      : createWorkerKcl(index + 1, agent.role, colorFor(agent.id))
    files[agent.filePath] = `${imports}\n${body}`
  })

  return files
}

const fallbackPlan = (prompt, maxAgents, note = 'Using deterministic fallback plan.') => {
  const agents = fallbackAgents(maxAgents)
  return {
    sessionId: `fallback-${Date.now()}`,
    source: 'fallback',
    prompt,
    root: {
      instruction: `Plan and merge a renderable assembly for: ${prompt}`,
      filePath: rootFilePath,
    },
    agents,
    files: buildFiles(agents),
    notes: [note],
  }
}

const planSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    assembly_title: { type: 'string' },
    root_instruction: { type: 'string' },
    agents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          parent_key: { type: 'string' },
          kind: { type: 'string', enum: ['orchestrator', 'worker'] },
          role: { type: 'string' },
          instruction: { type: 'string' },
        },
        required: ['key', 'parent_key', 'kind', 'role', 'instruction'],
      },
    },
  },
  required: ['assembly_title', 'root_instruction', 'agents'],
}

const workSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    kcl: { type: 'string' },
  },
  required: ['summary', 'kcl'],
}

const outputText = data => {
  if (typeof data.output_text === 'string') return data.output_text
  const chunks = []
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text)
    }
  }
  return chunks.join('\n')
}

const openaiJson = async ({ name, schema, instructions, input }) => {
  if (!openaiApiKey) throw new Error('OPENAI_API_KEY is not set')
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${openaiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: openaiModel,
      instructions,
      input,
      text: {
        format: {
          type: 'json_schema',
          name,
          strict: true,
          schema,
        },
      },
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI ${response.status}`)
  }

  const text = outputText(data)
  if (!text) throw new Error('OpenAI response had no output text')
  return JSON.parse(text)
}

const normalizePlan = (rawPlan, prompt, maxAgents) => {
  const rawAgents = Array.isArray(rawPlan.agents) ? rawPlan.agents.slice(0, maxAgents) : []
  if (rawAgents.length === 0) throw new Error('OpenAI plan did not include agents')

  const keyToId = new Map()
  let orchestratorCount = 0
  let workerCount = 0

  rawAgents.forEach(rawAgent => {
    const kind = rawAgent.kind === 'orchestrator' ? 'orchestrator' : 'worker'
    const count = kind === 'orchestrator' ? ++orchestratorCount : ++workerCount
    const prefix = kind === 'orchestrator' ? 'sub-orchestrator' : 'worker'
    keyToId.set(String(rawAgent.key), `${prefix}-${String(count).padStart(4, '0')}`)
  })

  const agents = rawAgents.map(rawAgent => {
    const kind = rawAgent.kind === 'orchestrator' ? 'orchestrator' : 'worker'
    const id = keyToId.get(String(rawAgent.key))
    const parentKey = String(rawAgent.parent_key || 'root')
    const parentId = parentKey === 'root'
      ? 'zookeeper-orchestrator-root'
      : keyToId.get(parentKey) || 'zookeeper-orchestrator-root'
    const sequence = id.match(/(\d{4})$/)?.[1] || '0000'
    const label = kind === 'orchestrator' ? 'Sub-Orchestrator' : 'Worker'
    const role = sanitizeText(rawAgent.role, kind === 'orchestrator' ? 'sub-assembly' : 'part')
    return {
      id,
      parentId,
      kind,
      name: `Zookeeper ${label} ${sequence}`,
      role,
      instruction: sanitizeText(rawAgent.instruction, `Work on ${role}.`),
      filePath: `generated/${slug(role)}-${sequence}.kcl`,
      source: 'openai',
    }
  })

  return {
    sessionId: randomUUID(),
    source: 'openai',
    prompt,
    root: {
      instruction: sanitizeText(rawPlan.root_instruction, `Coordinate the generated assembly for: ${prompt}`),
      filePath: rootFilePath,
    },
    agents,
    files: buildFiles(agents),
    notes: [`OpenAI model: ${openaiModel}`],
  }
}

const orchestrate = async body => {
  const prompt = sanitizeText(body.prompt, 'Design a small rocket engine assembly')
  const maxAgents = clamp(Number(body.maxAgents || maxDefaultAgents), 1, maxDefaultAgents)
  try {
    const rawPlan = await openaiJson({
      name: 'zookeeper_orchestration_plan',
      schema: planSchema,
      instructions: [
        'You are the parent Zookeeper Orchestrator for a CAD wall demo.',
        'Create a nested plan of sub-orchestrators and workers for the requested assembly.',
        'Use parent_key "root" for top-level sub-orchestrators.',
        'Prefer around 50 agents unless the requested assembly is clearly small.',
        'Workers should own concrete CAD parts. Orchestrators should own sub-assemblies.',
        'Keep roles short, physical, and suitable as graph labels.',
      ].join(' '),
      input: `Prompt: ${prompt}\nMaximum agents: ${maxAgents}`,
    })
    return normalizePlan(rawPlan, prompt, maxAgents)
  } catch (error) {
    return fallbackPlan(prompt, maxAgents, `OpenAI orchestration failed: ${error.message}`)
  }
}

const agentWork = async body => {
  const agent = body.agent || {}
  const role = sanitizeText(agent.role, 'part')
  const instruction = sanitizeText(agent.instruction, `Work on ${role}.`)
  const index = Number(agent.id?.match(/(\d{4})$/)?.[1] || 1)
  const imports = extractImportLines(body.currentKcl)
  const currentKcl = String(body.currentKcl || '')
  const renderError = sanitizeText(body.renderError, '')
  const attempt = clamp(Number(body.attempt || 0), 0, 4)
  const fallbackColor = colorFor(agent.id || role)

  try {
    const result = await openaiJson({
      name: 'zookeeper_agent_kcl',
      schema: workSchema,
      instructions: [
        'You are an individual Zookeeper CAD worker directly authoring KCL.',
        'Return complete renderable KCL for this one agent file, not a diff and not markdown.',
        'The kcl field must contain only the file body; omit import lines because they are reattached by the server.',
        'Use only this safe KCL subset: variable assignments, startSketchOn(XY), startProfile(sketch, at = [x, y]), line(end = [x, y]), close(), extrude(profile, length = n), appearance(color="#RRGGBB"), and the pipe operator |>. ',
        'Do not use comments, functions, loops, imports, booleans, ellipses, external references, unsupported primitives, or markdown fences.',
        'Iterate from the current KCL. If a renderer error is provided, fix that error while preserving the assigned part intent.',
        'Use two to four simple extruded profiles so the wall viewer visibly changes when this agent works.',
      ].join(' '),
      input: [
        `Assembly prompt: ${sanitizeText(body.prompt, 'assembly')}`,
        `Agent: ${sanitizeText(agent.name, 'Zookeeper Agent')}`,
        `Role: ${role}`,
        `Instruction: ${instruction}`,
        `Root instruction: ${sanitizeText(body.rootInstruction, 'Coordinate the assembly.')}`,
        `Agent kind: ${sanitizeText(agent.kind, 'worker')}`,
        `Repair attempt: ${attempt}`,
        `Existing import lines to preserve outside the kcl body:\n${imports || '(none)'}`,
        `Renderer error to repair:\n${renderError || '(none)'}`,
        'Current KCL to revise:',
        currentKcl.slice(0, 6000),
        'Return JSON with summary and kcl only.',
      ].join('\n'),
    })
    const bodyKcl = cleanModelKcl(result.kcl)
    const sanityError = kclSanityError(bodyKcl)
    if (sanityError !== undefined) throw new Error(`OpenAI KCL failed sanity check: ${sanityError}`)
    return {
      source: 'openai',
      summary: sanitizeText(result.summary, `Authored renderable KCL for ${role}.`),
      kcl: attachImports(imports, bodyKcl),
    }
  } catch (error) {
    const bodyKcl = agent.kind === 'orchestrator'
      ? createOrchestratorKcl(index, role, fallbackColor, 1)
      : createWorkerKcl(index, role, fallbackColor, 1)
    return {
      source: 'fallback',
      summary: `Fallback KCL retained for ${role}: ${error.message}`,
      kcl: attachImports(imports, bodyKcl),
    }
  }
}

const readJson = request => new Promise((resolveJson, rejectJson) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('error', rejectJson)
  request.on('end', () => {
    try {
      resolveJson(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
    } catch (error) {
      rejectJson(error)
    }
  })
})

const sendJson = (response, status, value) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

const serveStatic = async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = decodeURIComponent(url.pathname)
  const requested = pathname === '/' ? '/index.html' : pathname
  const filePath = normalize(join(publicDir, requested))
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  try {
    const file = await readFile(filePath)
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(filePath)) || 'application/octet-stream',
      'cache-control': requested.endsWith('.html') || requested.endsWith('.js') ? 'no-store' : 'public, max-age=3600',
    })
    response.end(file)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/api/orchestrate') {
      sendJson(response, 200, await orchestrate(await readJson(request)))
      return
    }
    if (request.method === 'POST' && request.url === '/api/zookeeper/work') {
      sendJson(response, 200, await agentWork(await readJson(request)))
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405)
      response.end('Method not allowed')
      return
    }
    await serveStatic(request, response)
  } catch (error) {
    sendJson(response, 500, { error: error.message || String(error) })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`web-view wall server listening on http://127.0.0.1:${port}`)
  console.log(openaiApiKey ? `OpenAI model: ${openaiModel}` : 'OPENAI_API_KEY is not set; fallback plans will be used.')
})
