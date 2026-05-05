import * as zoo from '@kittycad/lib'
import svgZoo from './svg-zoo'

declare global {
  interface Window {
    zoo?: {
      kittycadWebViews?: ZooWebView[]
    }
  }
}

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

export class ZooWebView extends EventTarget {
  public el: HTMLElement
  public rtc: zoo.WebRTC | undefined = undefined
  public size: Size
  public state: ZooWebViewState = ZooWebViewState.Fresh
 
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
    
    this.el = ZooWebView.createElements({ size: sizeAdjusted })
    
    const elVideo = this.el.querySelector<HTMLVideoElement>('video')
    if (elVideo === null) return
    elVideo.addEventListener('contextmenu', preventDefault)
   
    const elStart = this.el.querySelector<HTMLElement>('div.start')
    if (elStart === null) return
    
    // Owns setting up the WebSocket. Because the WebSocket is only good for a
    // single WebRTC handshake, and it's to be used as the ICE information
    // exchange, any other usage by an application is unexpected.
    const zooWebRTC = new zoo.WebRTC({
      client: args.zooClient,
      video_res_width: sizeAdjusted.width,
      video_res_height: sizeAdjusted.height,
      order_independent_transparency: true,
      show_grid: true,
      post_effect: 'ssao',
      fps: 30,
    })
  
    zooWebRTC.addResizeObserver(this.el)
   
    const startZooWebRTC = () => {
      // Make sure no other web view components are running. In the future we
      // may allow it.
      window.zoo?.kittycadWebViews
        ?.filter(v => [ZooWebViewState.Running, ZooWebViewState.Starting].indexOf(v.state) >= 0)
        .forEach(v => v.deconstructor())
      
      this.state = ZooWebViewState.Starting
      
      const onClose = () => {
        this.deconstructor()
      }
      zooWebRTC.addEventListener('close', onClose, { once: true })

      const onTrack = (event: Event) => {
        if (!(event.target instanceof zoo.WebRTC)) return
        elVideo.srcObject = event.target.track?.streams[0] ?? null
      }
      zooWebRTC.addEventListener('track', onTrack, { once: true })
      
      const onConnected = (_event: Event) => {
        void elVideo.play().catch(console.warn)
        
        this.rtc = zooWebRTC
        this.state = ZooWebViewState.Running
        this.dispatchEvent(new Event('ready'))
      }
      
      zooWebRTC.addMouseEvents(elVideo)
      zooWebRTC.addEventListener('connected', onConnected, { once: true })
      
      zooWebRTC.start()
    }
    
    this.state = ZooWebViewState.Fresh
    
    window.zoo?.kittycadWebViews?.push(this)
    
    const elStartClick = () => {
      ZooWebView.decoOn(sizeAdjusted, this.el, elStart)
      startZooWebRTC()
    }
    elStart.addEventListener('click', elStartClick)
  }
  
  deconstructor() {
    this.state = ZooWebViewState.Killed
    
    // Never remove this event listener.
    // elStart.removeEventListener('click', elStartClick)
    
    const elVideo = this.el.querySelector<HTMLVideoElement>('video')
    if (elVideo === null) return
    elVideo.pause()
    
    const elStart = this.el.querySelector<HTMLElement>('div.start')
    if (elStart === null) return
    ZooWebView.decoOff(this.size, this.el, elStart)
    
    return Promise.allSettled([
      this.rtc?.deconstructor()
    ])
  }

  static decoOff(size: Size, elZooWebView: HTMLElement, elStart: HTMLElement) {
    elZooWebView.style.width = size.width.toString()
    elZooWebView.style.height = size.height.toString()
    
    elZooWebView.style.justifyContent = 'center'
    elZooWebView.style.alignItems = 'center'
    elZooWebView.style.cursor = 'pointer'
    elZooWebView.style.backgroundColor = '#1c1c1c'
    
    elStart.style.paddingTop = ''
    elStart.style.paddingRight = ''
    elStart.style.width = (size.width / 2).toString()
    elStart.style.position = 'absolute'
    elStart.style.color = 'hsl(154deg 100% 25%)'
  }

  static decoOn(size: Size, elZooWebView: HTMLElement, elStart: HTMLElement) {
    elZooWebView.style.justifyContent = 'right'
    elZooWebView.style.alignItems = 'flex-start'
    elStart.style.width = (size.width / 4).toString()
    elStart.style.color = 'hsl(154deg 100% 58%)'
    elStart.style.paddingTop = '0.5em'
    elStart.style.paddingRight = '0.5em'
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

