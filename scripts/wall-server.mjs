import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const port = Number(process.env.PORT || 3000)
const publicDir = resolve(process.env.WALL_PUBLIC_DIR || join(process.cwd(), 'public'))
const zooApiToken = process.env.ZOO_API_TOKEN || ''

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
