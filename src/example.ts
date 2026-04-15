import * as zoo from '@kittycad/lib'
import { ZooWebView } from '.'

document.addEventListener('DOMContentLoaded', () => {
  const token = 'api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

  const zooClient = new zoo.Client({
    token,
    baseUrl: 'wss://api.dev.zoo.dev',
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
