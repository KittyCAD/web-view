#!/usr/bin/env node

const port = process.env.WALL_CDP_PORT ?? '19222'
const rendererOrigin = process.argv[2] ?? 'http://127.0.0.1:3001'
const pauseCenter = process.argv.includes('--pause-center')
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const center = pages.find(page => (
  page.type === 'page' &&
  page.url.includes('wallTile=4')
))
if (center === undefined) throw new Error('wall center page was not found')

const socket = new WebSocket(center.webSocketDebuggerUrl.replace(
  '127.0.0.1:9222',
  `127.0.0.1:${port}`,
))
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
})

const expression = `(() => {
  const rendererOrigin = ${JSON.stringify(rendererOrigin)}
  const pauseCenter = ${JSON.stringify(pauseCenter)}
  if (window.__wallNativeFetch === undefined) {
    window.__wallNativeFetch = window.fetch.bind(window)
  }
  const nativeFetch = window.__wallNativeFetch
  window.__wallSnapshotRoutingPauseCenter = pauseCenter
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === '/api/render-snapshot' && typeof init?.body === 'string') {
      try {
        const body = JSON.parse(init.body)
        if (typeof body.label === 'string' && body.label.startsWith('agent ')) {
          return nativeFetch(rendererOrigin + url, init)
        }
        if (typeof body.label === 'string' && body.label.startsWith('center ') && pauseCenter) {
          const currentSnapshot = document.querySelector(
            '.assembly-renderer img.agent-cad-snapshot, .orchestrator-view img.agent-cad-snapshot',
          )?.getAttribute('src')
          return Promise.resolve(new Response(JSON.stringify(
            typeof currentSnapshot === 'string' && currentSnapshot.length > 0
              ? { dataUrl: currentSnapshot }
              : { error: 'center snapshot temporarily paused while worker visuals drain' },
          ), {
            status: typeof currentSnapshot === 'string' && currentSnapshot.length > 0 ? 200 : 503,
            headers: { 'content-type': 'application/json' },
          }))
        }
      } catch {
        // Preserve the normal request path if the payload is not JSON.
      }
    }
    return nativeFetch(input, init)
  }
  return { rendererOrigin, pauseCenter, patched: true }
})()`

const response = await new Promise((resolve) => {
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id === 1) resolve(message)
  }
  socket.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true },
  }))
})
socket.close()
console.log(JSON.stringify(response.result.result.value))
