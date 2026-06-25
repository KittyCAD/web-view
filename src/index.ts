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

export const webViewKclWasmFileName =
  'kittycad-web-view-kcl_wasm_lib_bg.wasm'

export type Size = {
  width: number,
  height: number,
}

type WebRTCArgs = ConstructorParameters<typeof zoo.WebRTC>[0] & {
  kcl_wasm_lib_bg_wasm_url?: string,
}

export type ZooWebViewArgs = {
  zooClient: zoo.Client,
  size: Size,
  allowMultiple?: boolean,
  autoStart?: boolean,
  kclWasmUrl?: string,
  webRtcOptions?: Partial<
    Omit<WebRTCArgs, 'client' | 'video_res_width' | 'video_res_height'>
  >,
}

export type ZooWebViewWorkerMessage =
  | {
      from: 'websocket',
      payload: {
        type: 'message',
        data: unknown,
      },
    }
  | {
      from: 'wasm',
      payload: {
        type: 'message' | 'execute',
        data: unknown,
      },
    }

export type ZooWebViewEventDetail = {
  webView: ZooWebView,
  rtc: zoo.WebRTC | undefined,
  videoElement: HTMLVideoElement | undefined,
  peerConnection: RTCPeerConnection | undefined,
  mediaStream: MediaStream | undefined,
  dataChannel: RTCDataChannel | undefined,
}

export type ZooWebViewWorkerMessageEventDetail = ZooWebViewEventDetail & {
  message: ZooWebViewWorkerMessage,
}

const preventDefault = (e: Event) => e.preventDefault()

export enum ZooWebViewState {
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
  public allowMultiple: boolean = false
  public autoStart: boolean = false

  private sizeAdjusted: Size
  private startElement: HTMLElement | undefined
  private removeRtcEventListeners: (() => void)[] = []
  private removeWorkerMessageListener: (() => void) | undefined

  constructor(private readonly args: ZooWebViewArgs) {
    super()

    this.size = args.size
    this.allowMultiple = args.allowMultiple ?? false
    this.autoStart = args.autoStart ?? false

    this.sizeAdjusted = {
      width: args.size.width - args.size.width % 4,
      height: args.size.height - args.size.height % 4,
    }

    this.el = ZooWebView.createElements({
      size: this.sizeAdjusted,
      autoStart: this.autoStart,
    })

    const elVideo = this.videoElement
    if (elVideo === undefined) return
    elVideo.addEventListener('contextmenu', preventDefault)

    this.startElement = this.el.querySelector<HTMLElement>('div.start') ?? undefined
    if (this.startElement === undefined) return

    window.zoo?.kittycadWebViews?.push(this)

    this.startElement.addEventListener('click', () => {
      this.start()
    })

    if (this.autoStart) {
      // Start on the next frame, after DOM has elements attached.
      requestAnimationFrame(() => this.start())
    }
  }

  get videoElement(): HTMLVideoElement | undefined {
    return this.el.querySelector<HTMLVideoElement>('video') ?? undefined
  }

  get peerConnection(): RTCPeerConnection | undefined {
    return (
      this.rtc as unknown as { rtcPeerConnection?: RTCPeerConnection }
    )?.rtcPeerConnection
  }

  get mediaStream(): MediaStream | undefined {
    return this.rtc?.track?.streams[0]
  }

  get dataChannel(): RTCDataChannel | undefined {
    return this.rtc?.channel
  }

  get executor() {
    return this.rtc?.executor()
  }

  start() {
    if (![ZooWebViewState.Fresh, ZooWebViewState.Killed].includes(this.state)) {
      return
    }

    const elStart = this.startElement
    if (elStart === undefined) return

    ZooWebView.decoOn(this.sizeAdjusted, this.el, elStart)
    this.startZooWebRTC()
  }

  send(...args: Parameters<zoo.WebRTC['send']>) {
    return this.rtc?.send(...args)
  }

  removeMouseEvents() {
    this.rtc?.removeMouseEvents()
  }

  removeResizeObserver() {
    this.rtc?.removeResizeObserver()
  }

  deconstructor() {
    if (this.state === ZooWebViewState.Killed) { return }

    this.state = ZooWebViewState.Killed

    this.removeRtcEventListeners.forEach(remove => remove())
    this.removeRtcEventListeners = []
    this.removeWorkerMessageListener?.()
    this.removeWorkerMessageListener = undefined

    if (this.allowMultiple) {
      const index = window.zoo?.kittycadWebViews?.indexOf(this) ?? -1
      if (index >= 0) {
        window.zoo?.kittycadWebViews?.splice(index, 1)
      }
    }

    const elVideo = this.videoElement
    if (elVideo === undefined) return
    elVideo.pause()

    const elStart = this.startElement
    if (elStart === undefined) return
    ZooWebView.decoOff(this.size, this.el, elStart)

    return Promise.allSettled([
      this.rtc?.deconstructor(),
    ])
  }

  private startZooWebRTC() {
    // Owns setting up the WebSocket. Because the WebSocket is only good for a
    // single WebRTC handshake, and it's to be used as the ICE information
    // exchange, any other usage by an application is unexpected.
    const zooWebRTC = new zoo.WebRTC({
      order_independent_transparency: true,
      show_grid: true,
      post_effect: 'ssao',
      fps: 30,
      ...this.args.webRtcOptions,
      client: this.args.zooClient,
      video_res_width: this.sizeAdjusted.width,
      video_res_height: this.sizeAdjusted.height,
      kcl_wasm_lib_bg_wasm_url: this.args.kclWasmUrl,
    } as WebRTCArgs)
    this.rtc = zooWebRTC
    this.dispatchZooWebViewEvent('webrtc')

    if (this.allowMultiple !== true) {
      window.zoo?.kittycadWebViews
        ?.filter(v => [ZooWebViewState.Running, ZooWebViewState.Starting].indexOf(v.state) >= 0)
        .forEach(v => v.deconstructor())
    }
    this.state = ZooWebViewState.Starting

    this.bridgeWorkerMessages()

    const onClose = () => {
      this.dispatchZooWebViewEvent('close')
      this.deconstructor()
    }
    zooWebRTC.addEventListener('close', onClose, { once: true })
    this.removeRtcEventListeners.push(() => {
      zooWebRTC.removeEventListener('close', onClose)
    })

    const onTrack = (event: Event) => {
      if (!(event.target instanceof zoo.WebRTC)) return

      const elVideo = this.videoElement
      if (elVideo !== undefined) {
        elVideo.muted = true
        elVideo.srcObject = event.target.track?.streams[0] ?? null
      }

      this.dispatchZooWebViewEvent('track')
    }
    zooWebRTC.addEventListener('track', onTrack, { once: true })
    this.removeRtcEventListeners.push(() => {
      zooWebRTC.removeEventListener('track', onTrack)
    })

    const onDataChannel = () => {
      this.dispatchZooWebViewEvent('datachannel')
    }
    zooWebRTC.addEventListener('datachannel', onDataChannel, { once: true })
    this.removeRtcEventListeners.push(() => {
      zooWebRTC.removeEventListener('datachannel', onDataChannel)
    })

    const onConnected = () => {
      void this.videoElement?.play().catch(console.warn)

      this.state = ZooWebViewState.Running
      this.dispatchZooWebViewEvent('connected')
      this.dispatchZooWebViewEvent('ready')
      this.rtc?.addResizeObserver(this.el)
    }

    zooWebRTC.addMouseEvents(this.videoElement!)
    zooWebRTC.addEventListener('connected', onConnected, { once: true })
    this.removeRtcEventListeners.push(() => {
      zooWebRTC.removeEventListener('connected', onConnected)
    })

    void zooWebRTC.start()
  }

  private bridgeWorkerMessages() {
    const executor = this.executor
    if (executor === undefined) return

    const onWorkerMessage = (event: MessageEvent<ZooWebViewWorkerMessage>) => {
      this.dispatchEvent(
        new CustomEvent<ZooWebViewWorkerMessageEventDetail>('workerMessage', {
          detail: {
            ...this.eventDetail(),
            message: event.data,
          },
        })
      )
    }

    executor.addEventListener(onWorkerMessage)
    this.removeWorkerMessageListener = () => {
      executor.removeEventListener(onWorkerMessage)
    }
  }

  private eventDetail(): ZooWebViewEventDetail {
    return {
      webView: this,
      rtc: this.rtc,
      videoElement: this.videoElement,
      peerConnection: this.peerConnection,
      mediaStream: this.mediaStream,
      dataChannel: this.dataChannel,
    }
  }

  private dispatchZooWebViewEvent(type: string) {
    this.dispatchEvent(
      new CustomEvent<ZooWebViewEventDetail>(type, {
        detail: this.eventDetail(),
      })
    )
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

  static createElements(args: { size: Size, autoStart: boolean }) {
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

    if (args.autoStart) {
      elStart.style.display = 'none'
    }

    return elZooWebView
  }
}
