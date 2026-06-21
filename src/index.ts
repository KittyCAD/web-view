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

type ZooClientWithOAuthShim = {
  token?: string,
  oauth2?: {
    getAccessToken: () => Promise<undefined>,
    fetchAuthorizationCode: () => Promise<void>,
  },
}

const preventDefault = (e: Event) => e.preventDefault()

const adjustSize = (size: Size): Size => ({
  width: size.width - size.width % 4,
  height: size.height - size.height % 4,
})

const capStreamSize = (size: Size): Size => {
  const maxDimension = 2560
  const scale = Math.min(1, maxDimension / size.width, maxDimension / size.height)
  return adjustSize({
    width: Math.floor(size.width * scale),
    height: Math.floor(size.height * scale),
  })
}

const ensureTokenClientCanStartWebRTC = (client: zoo.Client) => {
  const clientWithShim = client as unknown as ZooClientWithOAuthShim
  if (clientWithShim.token === undefined || clientWithShim.oauth2 !== undefined) return

  clientWithShim.oauth2 = {
    getAccessToken: async () => undefined,
    fetchAuthorizationCode: async () => {},
  }
}

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
  private readonly allowConcurrentViews: boolean
  private readonly elStart: HTMLElement
  private readonly elVideo: HTMLVideoElement
  private readonly sizeAdjusted: Size
  private readonly streamSize: Size
  private readonly zooClient: zoo.Client
 
  constructor(args: {
    zooClient: zoo.Client,
    size: Size,
    allowConcurrentViews?: boolean,
    showStartLogo?: boolean,
  }) {
    super()
    
    this.size = args.size
    this.sizeAdjusted = adjustSize(args.size)
    this.streamSize = capStreamSize(this.sizeAdjusted)
    this.zooClient = args.zooClient
    this.allowConcurrentViews = args.allowConcurrentViews ?? false
    this.el = ZooWebView.createElements({
      size: this.sizeAdjusted,
      showStartLogo: args.showStartLogo ?? true,
    })
    
    const elVideo = this.el.querySelector<HTMLVideoElement>('video')
    if (elVideo === null) throw new Error('ZooWebView video element is missing')
    this.elVideo = elVideo
    elVideo.addEventListener('contextmenu', preventDefault)
   
    const elStart = this.el.querySelector<HTMLElement>('div.start')
    if (elStart === null) throw new Error('ZooWebView start element is missing')
    this.elStart = elStart
    
    this.state = ZooWebViewState.Fresh
    
    window.zoo?.kittycadWebViews?.push(this)
    
    const elStartClick = () => {
      this.start()
    }
    elStart.addEventListener('click', elStartClick)
  }

  start() {
    if ([ZooWebViewState.Running, ZooWebViewState.Starting].indexOf(this.state) >= 0) return

    this.dispatchEvent(new CustomEvent('status', { detail: 'starting' }))
    ZooWebView.decoOn(this.sizeAdjusted, this.el, this.elStart)
    ensureTokenClientCanStartWebRTC(this.zooClient)

    // Owns setting up the WebSocket. Because the WebSocket is only good for a
    // single WebRTC handshake, and it's to be used as the ICE information
    // exchange, any other usage by an application is unexpected.
    const zooWebRTC = new zoo.WebRTC({
      client: this.zooClient,
      video_res_width: this.streamSize.width,
      video_res_height: this.streamSize.height,
      order_independent_transparency: true,
      show_grid: true,
      post_effect: 'ssao',
      fps: 30,
    })
    this.rtc = zooWebRTC

    zooWebRTC.addResizeObserver(this.el)

    const workerWebRTC = (zooWebRTC as unknown as { workerWebRTC?: Worker }).workerWebRTC
    workerWebRTC?.addEventListener('message', (event: MessageEvent) => {
      const data = event.data
      if (data?.from !== 'debug') return
      const payload = data.payload
      const status = typeof payload === 'string' ? payload : payload?.status
      if (status === 'ws-message') return
      if (this.state === ZooWebViewState.Running && status?.startsWith('ws-')) return
      if (typeof status === 'string') {
        this.dispatchEvent(new CustomEvent('status', { detail: status }))
      }
    })
    workerWebRTC?.addEventListener('error', (event: ErrorEvent) => {
      this.dispatchEvent(new CustomEvent('status', { detail: event.message }))
    })

    if (!this.allowConcurrentViews) {
      window.zoo?.kittycadWebViews
        ?.filter(v => [ZooWebViewState.Running, ZooWebViewState.Starting].indexOf(v.state) >= 0)
        .forEach(v => v.deconstructor())
    }

    this.state = ZooWebViewState.Starting

    const onClose = () => {
      this.deconstructor()
    }
    zooWebRTC.addEventListener('close', onClose, { once: true })

    const onTrack = (event: Event) => {
      if (!(event.target instanceof zoo.WebRTC)) return
      this.elVideo.srcObject = event.target.track?.streams[0] ?? null
    }
    zooWebRTC.addEventListener('track', onTrack, { once: true })

    const onConnected = (_event: Event) => {
      void this.elVideo.play().catch(console.warn)

      this.rtc = zooWebRTC
      this.state = ZooWebViewState.Running
      this.dispatchEvent(new CustomEvent('status', { detail: 'connected' }))
      this.dispatchEvent(new Event('ready'))
    }

    zooWebRTC.addMouseEvents(this.elVideo)
    zooWebRTC.addEventListener('connected', onConnected, { once: true })

    void zooWebRTC.start().catch((error: unknown) => {
      this.state = ZooWebViewState.Killed
      console.error('ZooWebView failed to start', error)
      this.dispatchEvent(new CustomEvent('status', { detail: 'start failed' }))
      this.dispatchEvent(new CustomEvent('error', { detail: error }))
    })
  }
  
  deconstructor() {
    this.state = ZooWebViewState.Killed
    
    // Never remove this event listener.
    // elStart.removeEventListener('click', elStartClick)
    
    this.elVideo.pause()
    
    ZooWebView.decoOff(this.size, this.el, this.elStart)
    
    return Promise.allSettled([
      this.rtc?.deconstructor()
    ]).finally(() => {
      this.rtc = undefined
    })
  }

  static decoOff(size: Size, elZooWebView: HTMLElement, elStart: HTMLElement) {
    elZooWebView.style.width = `${size.width}px`
    elZooWebView.style.height = `${size.height}px`
    
    elZooWebView.style.justifyContent = 'center'
    elZooWebView.style.alignItems = 'center'
    elZooWebView.style.cursor = 'pointer'
    elZooWebView.style.backgroundColor = '#1c1c1c'
    
    elStart.style.paddingTop = ''
    elStart.style.paddingRight = ''
    elStart.style.width = `${size.width / 2}px`
    elStart.style.position = 'absolute'
    elStart.style.color = 'hsl(154deg 100% 25%)'
  }

  static decoOn(size: Size, elZooWebView: HTMLElement, elStart: HTMLElement) {
    elZooWebView.style.justifyContent = 'right'
    elZooWebView.style.alignItems = 'flex-start'
    elStart.style.width = `${size.width / 4}px`
    elStart.style.color = 'hsl(154deg 100% 58%)'
    elStart.style.paddingTop = '0.5em'
    elStart.style.paddingRight = '0.5em'
  }

  static createElements(args: { size: Size, showStartLogo?: boolean }) {
    const elZooWebView = document.createElement('div')
    const elVideo = document.createElement('video')
    const elStart = document.createElement('div')
    
    elStart.classList.add('start')
    if (args.showStartLogo ?? true) {
      elStart.innerHTML = svgZoo
    }
    
    elVideo.width = args.size.width - args.size.width % 4
    elVideo.height = args.size.height - args.size.height % 4
    elVideo.autoplay = true
    elVideo.muted = true
    elVideo.playsInline = true
    elVideo.style.display = 'block'
    elVideo.style.width = '100%'
    elVideo.style.height = '100%'
    elVideo.style.objectFit = 'cover'
    
    elZooWebView.style.display = 'flex'
    elZooWebView.style.position = 'relative'
    elZooWebView.style.overflow = 'hidden'
    elZooWebView.style.overscrollBehavior = 'contain'

    ZooWebView.decoOff(args.size, elZooWebView, elStart)
      
    elZooWebView.appendChild(elVideo)
    elZooWebView.appendChild(elStart)
    return elZooWebView
  }
}
