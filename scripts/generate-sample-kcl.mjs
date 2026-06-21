import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outputDir = join(process.cwd(), 'public', 'sample-kcl')
const colors = [
  '#00A3FF',
  '#FF4F8B',
  '#F5C542',
  '#44D07B',
  '#C084FC',
  '#FF8A3D',
  '#2DD4BF',
  '#94A3B8',
  '#F97316',
  '#22C55E',
  '#38BDF8',
  '#E879F9',
]

const topLevelRoles = [
  'combustion sub-assembly',
  'feed system sub-assembly',
  'structure and controls',
  'nozzle and plume shaping',
  'regen cooling system',
  'thrust vector control',
  'instrumentation harness',
  'mounting and ground support',
]
const nestedRoles = [
  'injector face decomposition',
  'turbopump integration',
  'cooling channel recursion',
  'nozzle extension recursion',
  'sensor package recursion',
  'mount load-path recursion',
]
const workerRoles = [
  'chamber liner',
  'nozzle contour',
  'injector plate',
  'fuel valve block',
  'oxidizer valve block',
  'turbopump package',
  'thrust frame',
  'sensor harness',
  'regen cooling jacket',
  'film cooling slots',
  'igniter boss',
  'pressure transducer port',
  'gimbal ring',
  'actuator clevis',
  'mounting flange',
  'purge manifold',
  'thermal shield',
  'bell extension',
  'flex line bracket',
  'controller enclosure',
  'cable strain relief',
  'valve actuator housing',
  'interface adapter',
  'hot-fire test lug',
  'seal groove',
  'flow straightener',
  'swirl element',
  'bolt circle',
  'coolant inlet',
  'coolant outlet',
  'inspection window',
  'support strut',
  'instrument rail',
  'connector plate',
  'drain fitting',
  'assembly datum target',
]

const format = (value) => Number(value.toFixed(3))

const createOrchestratorKcl = (index, role, color) => {
  const width = format(4.2 + index * 0.14)
  const height = format(2.2 + index * 0.08)
  const depth = format(0.55 + (index % 4) * 0.14)
  const tower = format(1.2 + index * 0.08)
  const left = format(-width / 2)
  const bottom = format(-height / 2)
  const ribX = format(-width / 4)
  const podX = format(width / 4 - 0.55)

  return `
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [${left}, ${bottom}])
  |> line(end = [${width}, 0])
  |> line(end = [0, ${height}])
  |> line(end = [${-width}, 0])
  |> close()
extrude001 = extrude(profile001, length = ${depth})
  |> appearance(color="${color}")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [${ribX}, ${format(-height / 3)}])
  |> line(end = [0.82, 0])
  |> line(end = [0, ${format(height * 0.66)}])
  |> line(end = [-0.82, 0])
  |> close()
extrude002 = extrude(profile002, length = ${tower})
  |> appearance(color="#F8FAFC")

sketch003 = startSketchOn(XY)
profile003 = startProfile(sketch003, at = [${podX}, ${format(-height / 4)}])
  |> line(end = [1.1, 0])
  |> line(end = [0, ${format(height / 2)}])
  |> line(end = [-1.1, 0])
  |> close()
extrude003 = extrude(profile003, length = ${format(tower + 0.45)})
  |> appearance(color="${color}")
`.trimStart()
}

const createWorkerKcl = (index, role, color) => {
  const width = format(1.35 + (index % 6) * 0.22)
  const height = format(0.95 + (index % 5) * 0.16)
  const length = format(1.0 + index * 0.09)
  const left = format(-width / 2)
  const bottom = format(-height / 2)
  const capWidth = format(width * 0.48)
  const capHeight = format(height * 0.22)

  return `
sketch001 = startSketchOn(XY)
profile001 = startProfile(sketch001, at = [${left}, ${bottom}])
  |> line(end = [${width}, 0])
  |> line(end = [0, ${height}])
  |> line(end = [${-width}, 0])
  |> close()
extrude001 = extrude(profile001, length = ${length})
  |> appearance(color="${color}")

sketch002 = startSketchOn(XY)
profile002 = startProfile(sketch002, at = [${format(-capWidth / 2)}, ${format(height * 0.18)}])
  |> line(end = [${capWidth}, 0])
  |> line(end = [0, ${capHeight}])
  |> line(end = [${-capWidth}, 0])
  |> close()
extrude002 = extrude(profile002, length = ${format(length + 0.35)})
  |> appearance(color="#FFFFFF")

sketch003 = startSketchOn(XY)
profile003 = startProfile(sketch003, at = [${format(-width * 0.12)}, ${format(-height * 0.12)}])
  |> line(end = [${format(width * 0.24)}, 0])
  |> line(end = [0, ${format(height * 0.24)}])
  |> line(end = [${format(-width * 0.24)}, 0])
  |> close()
extrude003 = extrude(profile003, length = ${format(length + 0.7)})
  |> appearance(color="${color}")
`.trimStart()
}

rmSync(outputDir, { force: true, recursive: true })
mkdirSync(outputDir, { recursive: true })

const orchestrators = [...topLevelRoles, ...nestedRoles]
orchestrators.forEach((role, index) => {
  const id = `sub-orchestrator-${String(index + 1).padStart(4, '0')}`
  const color = colors[index % colors.length]
  writeFileSync(join(outputDir, `${id}.kcl`), createOrchestratorKcl(index + 1, role, color))
})

workerRoles.forEach((role, index) => {
  const id = `worker-${String(index + 1).padStart(4, '0')}`
  const color = colors[(orchestrators.length + index) % colors.length]
  writeFileSync(join(outputDir, `${id}.kcl`), createWorkerKcl(index + 1, role, color))
})

console.log(`Wrote ${orchestrators.length + workerRoles.length} KCL files to ${outputDir}`)
