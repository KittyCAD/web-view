import * as zoo from '@kittycad/lib'
import svgZoo from './svg-zoo'

const token = 'api-564d9062-9a7a-41ee-944e-db5a3dcedc2a'

const zooClient = new zoo.Client({
  token,
  baseUrl: 'wss://api.dev.zoo.dev',
  fetch: window.fetch
})

// TODO: LOAD WASM BLOB INTO WEB WORKER FOR PARSING INTO JSON

type Size = {
  width: number,
  height: number,
}

const zooWebViewDecoOff = (size: Size, elZooWebView: HTMLDivElement) => {
  elZooWebView.style.width = size.width
  elZooWebView.style.height = size.height
  
  elZooWebView.style.display = 'flex'
  elZooWebView.style.justifyContent = 'center'
  elZooWebView.style.alignItems = 'center'
  elZooWebView.style.cursor = 'pointer'
  elZooWebView.style.backgroundColor = '#1c1c1c'
}

const zooWebViewDecoOn = (size: Size, elZooWebView: HTMLDivElement, elStart: HTMLDivElement) => {
  elZooWebView.style.justifyContent = 'right'
  elZooWebView.style.alignItems = 'flex-start'
  elStart.style.width = size.width / 4
  elStart.style.color = 'hsl(154deg 100% 58%)'
  elStart.style.paddingTop = '2px'
  elStart.style.paddingRight = '2px'
}

const createZooWebView = (args: { size: Size }) => {
  const elZooWebView = document.createElement('div')
  const elVideo = document.createElement('video')
  const elStart = document.createElement('div')
  elStart.classList.add('start')
  elStart.innerHTML = svgZoo
  elStart.style.width = args.size.width / 2
  elStart.style.position = 'absolute'
  elStart.style.color = 'hsl(154deg 100% 25%)'
  
  elVideo.width = args.size.width - args.size.width % 4
  elVideo.height = args.size.height - args.size.height % 4
  elVideo.addEventListener('contextmenu', (event) => {
    event.preventDefault()
  })

  zooWebViewDecoOff(args.size, elZooWebView)
    
  elZooWebView.appendChild(elVideo)
  elZooWebView.appendChild(elStart)
  return elZooWebView
}

    
document.addEventListener('DOMContentLoaded', () => {
  const width = 256
  const height = 256
  
  // Make sure no other ZooWebView are running.
  // window.zooWebViews.forEach((view) => {
  //   view.deconstructor()
  // })
  
  const size: Size = {
    width: width - width % 4,
    height: height - height % 4,
  }
  
  const elZooWebView = createZooWebView({ size })
  const elVideo = elZooWebView.querySelector('video')
  const elStart = elZooWebView.querySelector('div.start')

  elStart.addEventListener('click', () => {
    zooWebViewDecoOn(size, elZooWebView, elStart)
  
    // Owns setting up the WebSocket. Because the WebSocket is only good for a
    // single WebRTC handshake, and it's to be used as the ICE information
    // exchange, any other usage by an application is unexpected.
    const zooWebRTC = new zoo.WebRTC({
      client: zooClient,
      video_res_width: size.width,
      video_res_height: size.height,
      show_grid: true,
      post_effect: 'ssao',
      fps: 30,
    })

    // zooWebRTC.addEventListener('open', ...)

    zooWebRTC.addEventListener('track', (event) => {
      elVideo.srcObject = event.target.track?.streams[0]
    })
    
    zooWebRTC.addEventListener('connected', (event) => {
      void elVideo.play()
      zooWebRTC.send(JSON.stringify({
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
                    "type": "object_visible",
                    "object_id": "cfa78409-653d-4c26-96f1-7c45fb784840",
                    "hidden": false
                },
                "cmd_id": "00000000-0000-0000-0000-000000000000"
            },
            {
                "cmd": {
                    "type": "set_grid_scale",
                    "value": 10,
                    "units": "mm"
                },
                "cmd_id": "00000000-0000-0000-0000-000000000000"
            },
            {
                "cmd": {
                    "type": "object_visible",
                    "object_id": "10782f33-f588-4668-8bcd-040502d26590",
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

    // zooWebRTC.addEventListener('error', ...)
    // zooWebRTC.addEventListener('close', ...)
    
    const removeMouseEvents = zooWebRTC.addMouseEvents(elVideo)
  })
 
  document.body.appendChild(elZooWebView)
})
