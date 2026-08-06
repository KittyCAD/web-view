#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const port = process.env.WALL_CDP_PORT ?? (
  (
    process.argv.includes('--debug-controller') ||
    process.argv.includes('--debug-work-status') ||
    process.argv.includes('--probe-event-poll') ||
    process.argv.includes('--debug-heap') ||
    process.argv.includes('--purge-memory') ||
    process.argv.some(value => value.startsWith('--force-review='))
  ) ? '19223' : '19222'
)
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const wallPages = pages
  .filter(page => page.type === 'page' && page.url.includes('wallTile='))
  .sort((left, right) => (
    Number(new URL(left.url).searchParams.get('wallTile')) -
    Number(new URL(right.url).searchParams.get('wallTile'))
  ))

const evaluate = async (page, expression) => {
  const socketUrl = page.webSocketDebuggerUrl.replace(
    '127.0.0.1:9222',
    `127.0.0.1:${port}`,
  )
  const socket = new WebSocket(socketUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  const response = await new Promise((resolve) => {
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id === 1) resolve(message)
    }
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }))
  })
  socket.close()
  const value = response?.result?.result?.value
  return typeof value === 'string' ? JSON.parse(value) : value
}

const command = async (page, method, params = {}) => {
  const socketUrl = page.webSocketDebuggerUrl.replace(
    '127.0.0.1:9222',
    `127.0.0.1:${port}`,
  )
  const socket = new WebSocket(socketUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  const response = await new Promise((resolve) => {
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id === 1) resolve(message)
    }
    socket.send(JSON.stringify({ id: 1, method, params }))
  })
  socket.close()
  return response?.result
}

const captureScreenshot = async (page) => {
  const socketUrl = page.webSocketDebuggerUrl.replace(
    '127.0.0.1:9222',
    `127.0.0.1:${port}`,
  )
  const socket = new WebSocket(socketUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  const response = await new Promise((resolve) => {
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id === 1) resolve(message)
    }
    socket.send(JSON.stringify({
      id: 1,
      method: 'Page.captureScreenshot',
      params: { format: 'png', fromSurface: true },
    }))
  })
  socket.close()
  const data = response?.result?.data
  if (typeof data !== 'string') throw new Error('CDP screenshot returned no image')
  return Buffer.from(data, 'base64')
}

const screenshotArg = process.argv.find(value => value.startsWith('--screenshot-dir='))
const forceReviewArg = process.argv.find(value => value.startsWith('--force-review='))
if (screenshotArg !== undefined) {
  const screenshotDir = path.resolve(screenshotArg.slice('--screenshot-dir='.length))
  await mkdir(screenshotDir, { recursive: true })
  for (const page of wallPages) {
    const tile = Number(new URL(page.url).searchParams.get('wallTile'))
    await writeFile(
      path.join(screenshotDir, `wall-tile-${tile}.png`),
      await captureScreenshot(page),
    )
  }
}

if (
  process.argv.includes('--debug-controller') ||
  process.argv.includes('--debug-work-status') ||
  process.argv.includes('--probe-event-poll') ||
  process.argv.includes('--debug-heap') ||
  process.argv.includes('--purge-memory') ||
  forceReviewArg !== undefined
) {
  const controller = pages.find(page => (
    page.type === 'page' &&
    new URL(page.url).searchParams.get('wallController') === '1'
  ))
  if (controller === undefined) throw new Error('wall controller page not found')
  if (process.argv.includes('--purge-memory')) {
    await command(controller, 'Memory.forciblyPurgeJavaScriptMemory')
    console.log(JSON.stringify({
      heap: await command(controller, 'Runtime.getHeapUsage'),
      dom: await command(controller, 'Memory.getDOMCounters'),
    }, null, 2))
    process.exit(0)
  }
  if (forceReviewArg !== undefined) {
    const agentId = forceReviewArg.slice('--force-review='.length).trim()
    if (agentId.length === 0) throw new Error('--force-review requires an agent ID')
    const result = await evaluate(
      controller,
      `JSON.stringify(window.__zooWallForceReview?.(${JSON.stringify(agentId)}) ?? { ok: false, error: 'force-review hook unavailable' })`,
    )
    console.log(JSON.stringify(result, null, 2))
    process.exit(result?.ok ? 0 : 1)
  }
  if (process.argv.includes('--debug-heap')) {
    const [heap, dom, performance] = await Promise.all([
      command(controller, 'Runtime.getHeapUsage'),
      command(controller, 'Memory.getDOMCounters'),
      command(controller, 'Performance.getMetrics'),
    ])
    console.log(JSON.stringify({ heap, dom, performance }, null, 2))
    process.exit(0)
  }
  if (process.argv.includes('--probe-event-poll')) {
    const result = await evaluate(
      controller,
      `(async () => {
        const startedAt = performance.now()
        const response = await fetch(
          '/api/zookeeper/events-poll?sessionId=diagnostic-browser-probe&limit=1',
          { cache: 'no-store' },
        )
        const text = await response.text()
        return JSON.stringify({
          ok: response.ok,
          status: response.status,
          durationMs: performance.now() - startedAt,
          responseBytes: text.length,
          response: JSON.parse(text),
        })
      })()`,
    )
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  }
  if (process.argv.includes('--debug-work-status')) {
    const status = await evaluate(
      controller,
      `fetch('/api/zookeeper/work-status?sessionId=' + encodeURIComponent(window.__zooWallDebug?.().sessionId ?? ''), { cache: 'no-store' })
        .then(response => response.json())
        .then(value => JSON.stringify(value))`,
    )
    console.log(JSON.stringify(status, null, 2))
    process.exit(0)
  }
  const debug = await evaluate(
    controller,
    `JSON.stringify({
      ...(window.__zooWallDebug?.() ?? {}),
      documentVisibilityState: document.visibilityState,
      documentHidden: document.hidden,
      documentHasFocus: document.hasFocus(),
      pageShowState: performance.getEntriesByType('navigation')[0]?.type ?? '',
      recentEventPollResources: performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('/api/zookeeper/events-poll'))
        .slice(-12)
        .map(entry => ({
          startTime: entry.startTime,
          duration: entry.duration,
          responseStart: entry.responseStart,
          responseEnd: entry.responseEnd,
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
        })),
    })`,
  )
  console.log(JSON.stringify(debug, null, 2))
  process.exit(0)
}

const expression = `JSON.stringify((() => {
  const root = document.querySelector('main.wall-root')
  const cards = [...document.querySelectorAll('.agent-card')]
  const visibleCards = cards.filter(card => {
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
  const nodes = [...document.querySelectorAll('.graph-node')]
  const placeholders = [...document.querySelectorAll('.agent-viewer-placeholder')]
    .filter(element => {
      const rect = element.getBoundingClientRect()
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < innerWidth &&
        rect.top < innerHeight
      )
    })
    .map(element => element.textContent?.trim() ?? '')
  const issueCards = visibleCards
    .map(card => ({
      id: card.dataset.agentId ?? '',
      name: card.querySelector('.agent-title')?.textContent?.trim() ?? '',
      role: card.querySelector('.agent-role')?.textContent?.trim() ?? '',
      status: card.dataset.status ?? '',
      placeholder: card.querySelector('.agent-viewer-placeholder')?.textContent?.trim() ?? '',
      hasImage: Boolean(card.querySelector('.agent-viewer-slot img')),
    }))
    .filter(card => !card.hasImage || card.placeholder.includes('unavailable'))
  return {
    phase: root?.dataset.runPhase,
    rootStatus: root?.dataset.rootStatus,
    blockers: root?.dataset.completionBlockers ?? '',
    cards: cards.length,
    visibleCards: visibleCards.length,
    images: document.querySelectorAll('img.agent-cad-snapshot').length,
    placeholders: placeholders.reduce((counts, text) => {
      counts[text] = (counts[text] ?? 0) + 1
      return counts
    }, {}),
    graphNodes: nodes.length,
    graphStatuses: nodes.reduce((counts, node) => {
      const status = [...node.classList].find(name => name.startsWith('graph-status-'))
      counts[status] = (counts[status] ?? 0) + 1
      return counts
    }, {}),
    aggregate: document.querySelector('.aggregate-time')?.textContent,
    centerStatus: document.querySelector('.center-status')?.textContent,
    issueCards,
  }
})())`

const output = []
for (const page of wallPages) {
  output.push({
    tile: Number(new URL(page.url).searchParams.get('wallTile')),
    ...await evaluate(page, expression),
  })
}

if (process.argv.includes('--summary')) {
  const center = output.find(item => item.tile === 4)
  const border = output.filter(item => item.tile !== 4)
  console.log(JSON.stringify({
    center,
    border: {
      cards: border.reduce((sum, item) => sum + item.cards, 0),
      visibleCards: border.reduce((sum, item) => sum + item.visibleCards, 0),
      images: border.reduce((sum, item) => sum + item.images, 0),
      placeholders: border.reduce((counts, item) => {
        for (const [label, count] of Object.entries(item.placeholders)) {
          counts[label] = (counts[label] ?? 0) + count
        }
        return counts
      }, {}),
    },
    tiles: border.map(item => ({
      tile: item.tile,
      cards: item.cards,
      visibleCards: item.visibleCards,
      images: item.images,
      issueCards: item.issueCards,
    })),
  }, null, 2))
} else {
  console.log(JSON.stringify(output, null, 2))
}
