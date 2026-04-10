import * as zoo from '@kittycad/lib'
import svgZoo from './svg-zoo'

window.zoo ??= {}
window.zoo.kittycadWebViews ??= []

type Size = {
  width: number,
  height: number,
}

const preventDefault = (e: Event) => e.preventDefault()

enum ZooWebViewState {
  Fresh = 'fresh',
  Starting = 'starting',
  Running = 'running',
  Killed = 'killed',
}

class ZooWebView extends EventTarget {
  public el: HTMLDivElement
  public rtc: zoo.WebRTC | undefined = undefined
  public size: Size
 
  constructor(args: {
    zooClient: zoo.Client,
    size: Size,
  }) {
    super()
    
    this.size = args.size
    
    const sizeAdjusted: Size = {
      width: args.size.width - args.size.width % 4,
      height: args.size.height - args.size.height % 4,
    }
    
    const elZooWebView = ZooWebView.createElements({ size: sizeAdjusted })
    
    const elVideo = elZooWebView.querySelector('video')
    if (elVideo === null) return
    elVideo.addEventListener('contextmenu', preventDefault)
   
    const elStart = elZooWebView.querySelector('div.start')
    if (elStart === null) return
    
    const startZooWebRTC = () => {
      // Make sure no other web view components are running. In the future we
      // may allow it.
      window.zoo.kittycadWebViews
        .filter(v => [ZooWebViewState.Running, ZooWebViewState.Starting].includes(v.state))
        .forEach(v => v.deconstructor())
      
      this.state = ZooWebViewState.Starting
      
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
     
      const onClose = () => {
        this.deconstructor()
      }
      zooWebRTC.addEventListener('close', onClose, { once: true })

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
        
        this.rtc = zooWebRTC
        this.state = ZooWebViewState.Running
        this.dispatchEvent(new Event('ready'))
      }
      
      zooWebRTC.addMouseEvents(elVideo)
      zooWebRTC.addEventListener('connected', onConnected, { once: true })
      
      zooWebRTC.start()
    }
    
    this.state = ZooWebViewState.Fresh
    this.el = elZooWebView
    
    window.zoo.kittycadWebViews.push(this)
    
    const elStartClick = () => {
      ZooWebView.decoOn(sizeAdjusted, elZooWebView, elStart)
      startZooWebRTC()
    }
    elStart.addEventListener('click', elStartClick)
  }
  
  deconstructor() {
    this.state = ZooWebViewState.Killed
    
    // Never remove this event listener.
    // elStart.removeEventListener('click', elStartClick)
    
    const elVideo = this.el.querySelector('video')
    if (elVideo === null) return
    elVideo.pause()
    
    const elStart = this.el.querySelector('div.start')
    if (elStart === null) return
    ZooWebView.decoOff(this.size, this.el, elStart)
    
    return Promise.allSettled([
      this.rtc?.deconstructor()
    ])
  }

  static decoOff(size: Size, elZooWebView: HTMLDivElement, elStart: HTMLDivElement) {
    elZooWebView.style.width = size.width.toString()
    elZooWebView.style.height = size.height.toString()
    
    elZooWebView.style.justifyContent = 'center'
    elZooWebView.style.alignItems = 'center'
    elZooWebView.style.cursor = 'pointer'
    elZooWebView.style.backgroundColor = '#1c1c1c'
    
    elStart.style.paddingTop = undefined
    elStart.style.paddingRight = undefined
    elStart.style.width = (size.width / 2).toString()
    elStart.style.position = 'absolute'
    elStart.style.color = 'hsl(154deg 100% 25%)'
  }

  static decoOn(size: Size, elZooWebView: HTMLDivElement, elStart: HTMLDivElement) {
    elZooWebView.style.justifyContent = 'right'
    elZooWebView.style.alignItems = 'flex-start'
    elStart.style.width = (size.width / 4).toString()
    elStart.style.color = 'hsl(154deg 100% 58%)'
    elStart.style.paddingTop = '2px'
    elStart.style.paddingRight = '2px'
  }

  static createElements(args: { size: Size }) {
    const elZooWebView = document.createElement('div')
    const elVideo = document.createElement('video')
    const elStart = document.createElement('div')
    
    elStart.classList.add('start')
    elStart.innerHTML = svgZoo
    
    elVideo.width = args.size.width - args.size.width % 4
    elVideo.height = args.size.height - args.size.height % 4
    
    elZooWebView.style.display = 'flex'
    elZooWebView.style.overflow = 'auto'
    elZooWebView.style.overscrollBehavior = 'contain'

    ZooWebView.decoOff(args.size, elZooWebView, elStart)
      
    elZooWebView.appendChild(elVideo)
    elZooWebView.appendChild(elStart)
    return elZooWebView
  }
}

