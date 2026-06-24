import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const port = Number(process.env.PORT || 3000)
const publicDir = resolve(process.env.WALL_PUBLIC_DIR || join(process.cwd(), 'public'))
const zooApiToken = process.env.ZOO_API_TOKEN || ''
const openaiApiKey = process.env.OPENAI_API_KEY || ''
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4.1'

const plannerSystemPrompt = `You are the Zookeeper Orchestrator for a nine-screen CAD wall demo.
Given the user's assembly prompt, produce a compact JSON object that assigns
the assembly into between 3 and 8 visually distinct CAD parts. Each part will be
rendered by a separate worker screen and placed into a combined center assembly.
Return JSON only with this exact shape:
{
  "title": "short assembly title",
  "summary": "one sentence about the decomposition",
  "parts": [
    {
      "name": "short part name",
      "role": "what this part does",
      "description": "specific local modeling instruction for the worker",
      "color": "#RRGGBB",
      "width": 1.2,
      "height": 0.8,
      "depth": 0.9,
      "position": {"x": -2.5, "y": 1.0, "z": 0.6}
    }
  ]
}
Use dimensions roughly in the 0.4 to 3.0 range. Spread positions across x
-4.0..4.0 and y -2.2..2.2 so parts do not overlap. Keep z around 0.4..1.2.
Do not include markdown, comments, imports, or extra keys.`

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
])

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, headers)
  response.end(body)
}

const sendJson = (response, status, payload) => {
  send(response, status, JSON.stringify(payload), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
}

const readBody = (request, maxBytes = 20000) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  request.on('data', chunk => {
    size += chunk.length
    if (size > maxBytes) {
      reject(new Error('request body too large'))
      request.destroy()
      return
    }
    chunks.push(chunk)
  })
  request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  request.on('error', reject)
})

const requestOpenAIPlan = async (prompt) => {
  if (!openaiApiKey) throw new Error('OPENAI_API_KEY is not set on the wall server')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${openaiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: plannerSystemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`OpenAI planner returned HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`)
  }
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('OpenAI planner returned no message content')
  return JSON.parse(content)
}

const safePathFor = (requestPath) => {
  const pathname = new URL(requestPath, `http://127.0.0.1:${port}`).pathname
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const filePath = resolve(publicDir, normalized === '/' ? 'index.html' : normalized.slice(1))
  if (!filePath.startsWith(publicDir)) return undefined
  return filePath
}

const server = createServer(async (request, response) => {
  if (request.url === undefined) {
    send(response, 400, 'missing url')
    return
  }

  const pathname = new URL(request.url, `http://127.0.0.1:${port}`).pathname

  if (request.method === 'POST' && pathname === '/plan') {
    try {
      const body = JSON.parse(await readBody(request))
      if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        throw new Error('prompt is required')
      }
      const plan = await requestOpenAIPlan(body.prompt.trim())
      sendJson(response, 200, { plan })
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (pathname === '/config.js') {
    send(
      response,
      200,
      `window.ZOO_API_TOKEN = ${JSON.stringify(zooApiToken || undefined)};\n`,
      {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
      },
    )
    return
  }

  const filePath = safePathFor(request.url)
  if (filePath === undefined) {
    send(response, 403, 'forbidden')
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      send(response, 404, 'not found')
      return
    }

    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    createReadStream(filePath).pipe(response)
  } catch {
    send(response, 404, 'not found')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Zoo Web View Wall serving ${publicDir} on http://127.0.0.1:${port}`)
})
