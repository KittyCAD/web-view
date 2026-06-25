import fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin, PluginOption, Rollup } from 'vite'

export const webViewKclWasmFileName =
  'kittycad-web-view-kcl_wasm_lib_bg.wasm'
export const webViewKclWasmUrlProperty = 'kcl_wasm_lib_bg_wasm_url'

const webViewKclWasmPackagePath = [
  'node_modules',
  '@kittycad',
  'kcl-wasm-lib',
  'kcl_wasm_lib_bg.wasm',
]
const kittyCadLibBundleRegex =
  /(?:^|[\\/])@kittycad[\\/]lib[\\/]dist[\\/](?:mjs[\\/]index\.js|cjs[\\/]index\.cjs)(?:\?.*)?$/
const kittyCadLibWorkerPayloadRegex =
  /([A-Za-z_$][\w$]*)\("([A-Za-z0-9+/=]+)",null,!1\)/g
const workerFetchSnippet =
  'await fetch(new URL("/kcl_wasm_lib_bg.wasm",location.origin)).then((e=>e.arrayBuffer())).then((e=>hr({module_or_path:e})))'
const workerFetchReplacement = `await fetch(e.${webViewKclWasmUrlProperty}??new URL("/${webViewKclWasmFileName}",location.origin)).then((e=>e.arrayBuffer())).then((e=>hr({module_or_path:e})))`

const isKittyCadLibBundle = (id: string) => kittyCadLibBundleRegex.test(id)

const hasKittyCadLibWorkerPayload = (code: string) => {
  kittyCadLibWorkerPayloadRegex.lastIndex = 0
  return kittyCadLibWorkerPayloadRegex.test(code)
}

const rewriteKittyCadLibWorkerWasmUrl = (
  code: string,
  id: string,
  { strict = true } = {}
) => {
  let replacements = 0
  kittyCadLibWorkerPayloadRegex.lastIndex = 0
  const updatedCode = code.replaceAll(
    kittyCadLibWorkerPayloadRegex,
    (call, factoryName: string, encodedWorker: string) => {
      const workerCode = Buffer.from(encodedWorker, 'base64').toString('utf8')
      if (!workerCode.includes(workerFetchSnippet)) return call

      const updatedWorkerCode = workerCode.replace(
        workerFetchSnippet,
        workerFetchReplacement
      )
      const updatedEncodedWorker = Buffer.from(
        updatedWorkerCode,
        'utf8'
      ).toString('base64')

      replacements += 1
      return `${factoryName}("${updatedEncodedWorker}",null,!1)`
    }
  )

  if (replacements === 0) {
    if (!strict) return code

    throw new Error(`Could not find @kittycad/lib wasm fetch in ${id}`)
  }

  return updatedCode
}

const rewriteGeneratedBundleWorkerPayloads = (bundle: Rollup.OutputBundle) => {
  for (const asset of Object.values(bundle)) {
    if (asset.type !== 'chunk') continue
    if (!hasKittyCadLibWorkerPayload(asset.code)) continue

    asset.code = rewriteKittyCadLibWorkerWasmUrl(asset.code, asset.fileName, {
      strict: false,
    })
  }
}

const kittyCadWebViewWorkerWasmPlugin = (): Plugin => ({
  name: 'kittycad-web-view-wasm-worker',
  enforce: 'pre',
  transform(code, id) {
    if (!isKittyCadLibBundle(id)) return
    if (!hasKittyCadLibWorkerPayload(code)) return

    return {
      code: rewriteKittyCadLibWorkerWasmUrl(code, id),
      map: null,
    }
  },
  generateBundle(_options, bundle) {
    rewriteGeneratedBundleWorkerPayloads(bundle)
  },
})

export function kittyCadWebViewWasmPlugin(): Plugin {
  let root = process.cwd()
  const wasmFilePath = () => path.resolve(root, ...webViewKclWasmPackagePath)

  const writeWasmResponse = (res: ServerResponse) => {
    const sourcePath = wasmFilePath()
    if (!fs.existsSync(sourcePath)) {
      res.statusCode = 404
      res.end(`Missing ${sourcePath}`)
      return
    }

    res.setHeader('Content-Type', 'application/wasm')
    fs.createReadStream(sourcePath).pipe(res)
  }

  return {
    name: 'kittycad-web-view-wasm',
    enforce: 'pre',
    config(config) {
      const existingWorkerPlugins = config.worker?.plugins
      const workerPlugins = (): PluginOption[] => [
        ...(existingWorkerPlugins?.() ?? []),
        kittyCadWebViewWorkerWasmPlugin(),
      ]

      return {
        optimizeDeps: {
          esbuildOptions: {
            plugins: [
              {
                name: 'kittycad-web-view-wasm',
                setup(build) {
                  build.onLoad(
                    {
                      filter:
                        /@kittycad[\\/]lib[\\/]dist[\\/](?:mjs[\\/]index\.js|cjs[\\/]index\.cjs)$/,
                    },
                    async (args) => {
                      const code = await fs.promises.readFile(args.path, 'utf8')
                      return {
                        contents: rewriteKittyCadLibWorkerWasmUrl(
                          code,
                          args.path
                        ),
                        loader: 'js',
                      }
                    }
                  )
                },
              },
            ],
          },
        },
        worker: {
          ...(config.worker ?? {}),
          plugins: workerPlugins,
        },
      }
    },
    configResolved(config) {
      root = config.root
    },
    transform(code, id) {
      if (!isKittyCadLibBundle(id)) return
      if (!hasKittyCadLibWorkerPayload(code)) return

      return {
        code: rewriteKittyCadLibWorkerWasmUrl(code, id),
        map: null,
      }
    },
    configureServer(server) {
      server.middlewares.use(`/${webViewKclWasmFileName}`, (_req, res) => {
        writeWasmResponse(res)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(`/${webViewKclWasmFileName}`, (_req, res) => {
        writeWasmResponse(res)
      })
    },
    generateBundle(_options, bundle) {
      rewriteGeneratedBundleWorkerPayloads(bundle)

      this.emitFile({
        type: 'asset',
        fileName: webViewKclWasmFileName,
        source: fs.readFileSync(wasmFilePath()),
      })
    },
  }
}
