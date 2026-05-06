import * as zoo from '@kittycad/lib'
import { ZooWebView } from '.'

document.addEventListener('DOMContentLoaded', () => {
  const zooClient = new zoo.Client({
    baseUrl: 'https://api.zoo.dev',
    clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    redirectUrl: 'http://localhost:3000',
    scopes: ['modeling'],
  })
  
  void zooClient.isReturningFromAuthServer()
  .then(async (hasAuthCode) => {
    if (!hasAuthCode) return
    const data = await zooClient.getAccessToken()
    zooClient.token = data.token.value
  })
  
  const parentElRect = document.body.getBoundingClientRect()
  
  const zooWebView = new ZooWebView({
    zooClient,
    size: {
      width: parentElRect.width,
      height: parentElRect.height,
    },
  })
  
  document.body.appendChild(zooWebView.el)
  
  const observerResize = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      zooWebView.el.style.width = entry.contentRect.width
      zooWebView.el.style.height = entry.contentRect.height
    })
  })
  
  observerResize.observe(document.body)
  
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
      ev.target.rtc.send(JSON.stringify({
        "type": "modeling_cmd_batch_req",
        "requests": [
            {
                "cmd": {
                    "type": "edge_lines_visible",
                    "hidden": false
                },
                "cmd_id": "00000000-0000-0000-0000-000000000000"
            },
            {
                "cmd": {
                    "type": "zoom_to_fit",
                    "object_ids": [],
                    "padding": 0.0,
                },
                "cmd_id": "00000000-0000-0000-0000-000000000000"
            }
        ],
        "batch_id": "00000000-0000-0000-0000-000000000000",
        "responses": true
      }))
    })
  })
})
