# @kittycad/web-view

Various helpers to get a Zoo KittyCAD WebRTC stream onto a web page!

## Features

* Each instance runs on a Web Worker, preventing main worker blocking.
* Take KCL as a string input, or a map of `path -> string`s.
* Supports raw scene and modeling commands.
* Managed multiplexing so that many can be used at once on a page.
* Supports Zoo camera controls (middle to pan, right to rotate, wheel to zoom).
* Written in vanilla TypeScript for easy porting to other frameworks.

## Installation

```sh
npm install @kittycad/web-view @kittycad/lib
```

You will need to copy `node_modules/@kittycad/kcl-wasm-lib/kcl_wasm_lib_bg.wasm`
to the root of a directory that will be served by your web server.

## Quick demo

```sh
make serve
```

The demo page on this branch is a 3x3 Zookeeper orchestration wall. Span the
browser window across the nine displays, refresh the page, then click **Start
Zookeeper** to run the mock recursive assembly workflow with 50 live sub-agent
viewer sessions.

The 50 sample KCL assets live in `public/sample-kcl`. Their filenames match the
mock agent IDs, so `Zookeeper Worker 0001` loads
`/sample-kcl/worker-0001.kcl` and `Zookeeper Sub-Orchestrator 0001` loads
`/sample-kcl/sub-orchestrator-0001.kcl`.

## Building

```sh
make build
```

## Example

```ts
import * as zoo from '@kittycad/lib'
import { ZooWebView } from '@kittycad/web-view'

document.addEventListener('DOMContentLoaded', () => {
  const token = 'api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

  const zooClient = new zoo.Client({
    token,
    baseUrl: 'wss://api.zoo.dev',
  })

  const zooWebView = new ZooWebView({
    zooClient,
    size: {
      width: 256,
      height: 256,
    },
  })
  
  document.body.appendChild(zooWebView.el)
  
  zooWebView.addEventListener('ready', (ev: Event) => {
    const executor = ev.target.rtc.executor()
    const project = new Map<string, string>()
    project.set('main.kcl', `
      import "ok.kcl"
      sketch001 = startSketchOn(XY)
      profile001 = startProfile(sketch001, at = [-3.5, -2.23])
        |> line(end = [4.53, 5.73])
        |> line(end = [5.18, -3.74])
        |> line(endAbsolute = [profileStartX(%), profileStartY(%)])
        |> close()
      extrude001 = extrude(profile001, length = 5 * 1)
      |> appearance(color="#0000FF")
    `)
    project.set('ok.kcl', `
      sketch001 = startSketchOn(XY)
      profile001 = startProfile(sketch001, at = [-1.5, -2.23])
        |> line(end = [4.53, 5.73])
        |> line(end = [5.18, -3.74])
        |> line(endAbsolute = [profileStartX(%), profileStartY(%)])
        |> close()
      extrude001 = extrude(profile001, length = 5 * 1)
      |> appearance(color="#FF0000")
    `)
    void executor.submit(project).then(() => {
      console.log('All done running!')
    })
  })
})
```

## Pretty screenshot of making tons of these
![nice screenshot](./screenshot.png)
