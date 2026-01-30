import type { LayoutResult } from './layout'
import type { Topology } from './topology'

export function layoutHierarchy(top: Topology): LayoutResult {
  const layers = [
    { key: 'RR', kinds: new Set(['RR']), y: 0 },
    { key: 'CORE', kinds: new Set(['P']), y: 220 },
    { key: 'EDGE', kinds: new Set(['PE']), y: 440 },
    { key: 'ACCESS', kinds: new Set(['CE', 'ACC']), y: 660 },
  ]

  const nodeW = 170
  const nodeH = 62
  const gapX = 54
  const gapY = 72

  const nodesByLayer: Record<string, string[]> = {}
  for (const l of layers) nodesByLayer[l.key] = []

  for (const n of top.nodes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = layers.find((l) => l.kinds.has(n.kind as unknown as any))
    ;(nodesByLayer[layer?.key ?? 'ACCESS'] ??= []).push(n.id)
  }

  const maxCols = 14
  const layout: LayoutResult = { nodes: {}, edges: [], width: 1400, height: 900 }

  const layerWidths: number[] = []

  for (const l of layers) {
    const ids = nodesByLayer[l.key] || []
    if (!ids.length) {
      layerWidths.push(0)
      continue
    }
    const cols = Math.min(maxCols, ids.length)
    // rows are implicit in y computation

    const layerW = cols * nodeW + (cols - 1) * gapX
    layerWidths.push(layerW)

    for (let i = 0; i < ids.length; i++) {
      const r = Math.floor(i / cols)
      const c = i % cols
      layout.nodes[ids[i]] = {
        x: c * (nodeW + gapX),
        y: l.y + r * (nodeH + gapY),
        width: nodeW,
        height: nodeH,
      }
    }
  }

  const widest = Math.max(1400, ...layerWidths.map((w) => w + 80))

  // Center layers horizontally
  for (const l of layers) {
    const ids = nodesByLayer[l.key] || []
    if (!ids.length) continue
    const xs = ids.map((id) => layout.nodes[id].x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const span = maxX - minX + nodeW
    const offset = Math.max(0, Math.floor((widest - span) / 2))
    for (const id of ids) layout.nodes[id].x += offset
  }

  // Edges -> orthogonal-ish polylines
  for (const e of top.edges) {
    const a = layout.nodes[e.a]
    const b = layout.nodes[e.b]
    if (!a || !b) continue

    const sx = a.x + a.width / 2
    const sy = a.y + a.height
    const tx = b.x + b.width / 2
    const ty = b.y

    const midY1 = sy + 18
    const midY2 = ty - 18

    layout.edges.push({
      id: e.id,
      points: [
        { x: sx, y: sy },
        { x: sx, y: midY1 },
        { x: tx, y: midY2 },
        { x: tx, y: ty },
      ],
    })
  }

  const all = Object.values(layout.nodes)
  const maxX = Math.max(...all.map((n) => n.x + n.width), 1400)
  const maxY = Math.max(...all.map((n) => n.y + n.height), 900)
  layout.width = maxX + 60
  layout.height = maxY + 60

  return layout
}
