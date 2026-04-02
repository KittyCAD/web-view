import * as zoo from '@kittycad/lib'
import svgZoo from './svg-zoo'

// TODO: THROTTLE MOUSE EVENTS TO 30 EPS
// TODO: "TURN OFF" ALL OTHER STREAMS WHEN A NEW ONE IS STARTED

type Size = {
  width: number,
  height: number,
}

const zooWebViewDecoOff = (size: Size, elZooWebView: HTMLDivElement) => {
  elZooWebView.style.width = size.width.toString()
  elZooWebView.style.height = size.height.toString()
  
  elZooWebView.style.justifyContent = 'center'
  elZooWebView.style.alignItems = 'center'
  elZooWebView.style.cursor = 'pointer'
  elZooWebView.style.backgroundColor = '#1c1c1c'
}

const zooWebViewDecoOn = (size: Size, elZooWebView: HTMLDivElement, elStart: HTMLDivElement) => {
  elZooWebView.style.justifyContent = 'right'
  elZooWebView.style.alignItems = 'flex-start'
  elStart.style.width = (size.width / 4).toString()
  elStart.style.color = 'hsl(154deg 100% 58%)'
  elStart.style.paddingTop = '2px'
  elStart.style.paddingRight = '2px'
}

const createZooWebViewHTML = (args: { size: Size }) => {
  const elZooWebView = document.createElement('div')
  const elVideo = document.createElement('video')
  const elStart = document.createElement('div')
  
  elStart.classList.add('start')
  elStart.innerHTML = svgZoo
  elStart.style.width = (args.size.width / 2).toString()
  elStart.style.position = 'absolute'
  elStart.style.color = 'hsl(154deg 100% 25%)'
  
  elVideo.width = args.size.width - args.size.width % 4
  elVideo.height = args.size.height - args.size.height % 4
  
  elZooWebView.style.display = 'flex'

  zooWebViewDecoOff(args.size, elZooWebView)
    
  elZooWebView.appendChild(elVideo)
  elZooWebView.appendChild(elStart)
  return elZooWebView
}

const preventDefault = (e: Event) => e.preventDefault()

const createZooWebView = (args: {
  zooClient: zoo.Client,
  size: Size,
  onReady: () => void,
}) => {
  const sizeAdjusted: Size = {
    width: args.size.width - args.size.width % 4,
    height: args.size.height - args.size.height % 4,
  }
  
  const elZooWebView = createZooWebViewHTML({ size: sizeAdjusted })
  
  const elVideo = elZooWebView.querySelector('video')
  if (elVideo === null) return
  elVideo.addEventListener('contextmenu', preventDefault)
 
  const elStart = elZooWebView.querySelector('div.start')
  if (elStart === null) return
  
  const promiseWebRTC = Promise.withResolvers()
  const startZooWebRTC = () => {
    // Owns setting up the WebSocket. Because the WebSocket is only good for a
    // single WebRTC handshake, and it's to be used as the ICE information
    // exchange, any other usage by an application is unexpected.
    const zooWebRTC = new zoo.WebRTC({
      client: args.zooClient,
      video_res_width: sizeAdjusted.width,
      video_res_height: sizeAdjusted.height,
      show_grid: true,
      post_effect: 'ssao',
      fps: 30,
    })

    const onTrack = (event: Event) => {
      elVideo.srcObject = event.target.track?.streams[0]
    }
    zooWebRTC.addEventListener('track', onTrack, { once: true })
    
    const onConnected = (event: Event) => {
      void elVideo.play().catch(console.warn)
      
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
      
      promiseWebRTC.resolve(zooWebRTC)
    }
    
    zooWebRTC.addMouseEvents(elVideo)
    zooWebRTC.addEventListener('connected', onConnected, { once: true })
    
    zooWebRTC.start()
  }
  
  const elStartClick = () => {
    zooWebViewDecoOn(sizeAdjusted, elZooWebView, elStart)
    startZooWebRTC()
  }
  elStart.addEventListener('click', elStartClick)
  
  return {
    el: elZooWebView,
    rtc: promiseWebRTC.promise,
    deconstructor: () => {
      elStart.removeEventListener('click', elStartClick)
      elVideo.removeEventListener('contextmenu', preventDefault)
      return Promise.allSettled([
        promiseWebRTC.promise.then((rtc) => rtc.deconstructor())
      ])
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const token = 'api-564d9062-9a7a-41ee-944e-db5a3dcedc2a'

  const zooClient = new zoo.Client({
    token,
    baseUrl: 'wss://api.dev.zoo.dev',
  })
  
  new Array(9).fill(0).forEach((_e, idx) => {
    const zooWebView = createZooWebView({
      zooClient,
      size: {
        width: 256,
        height: 256,
      },
    })
    document.body.appendChild(zooWebView.el)
    
    zooWebView.rtc.then(async (rtc) => {
      const cmds = await rtc.prepareToExecuteKcl(`
        sketch001 = startSketchOn(XY)
        profile001 = startProfile(sketch001, at = [-3.5, -2.23])
          |> line(end = [4.53, 5.73])
          |> line(end = [5.18, -3.74])
          |> line(endAbsolute = [profileStartX(%), profileStartY(%)])
          |> close()
        extrude001 = extrude(profile001, length = 5 * ${idx})
      `)
      // There's also stream.removeEventListener which should be
      // called when no more events.
      cmds.addEventListener((ev) => {
        // receieve responses in ev.data
        console.log(ev.data)
      })
      cmds.start()
    })
  })
})
