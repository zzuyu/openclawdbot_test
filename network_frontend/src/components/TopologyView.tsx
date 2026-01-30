import { useEffect, useMemo, useState } from 'react'
import { Server, Router, Repeat2, Building2 } from 'lucide-react'

import { layoutGraph, type LayoutResult } from '../lib/layout'
import { buildTopologyFromSnapshot, toGraph } from '../lib/topology'
import type { NetworkSnapshot } from '../mock/network'
import './topology.css'

function iconFor(kind: string) {
  if (kind === 'RR') return <Repeat2 size={16} />
  if (kind === 'P') return <Router size={16} />
  if (kind === 'PE') return <Server size={16} />
  return <Building2 size={16} />
}

export default function TopologyView({ snapshot }: { snapshot: NetworkSnapshot }) {
  const topo = useMemo(() => buildTopologyFromSnapshot(snapshot), [snapshot])
  const graph = useMemo(() => toGraph(topo), [topo])

  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let cancelled = false
    layoutGraph(graph.nodes, graph.edges).then((l) => {
      if (!cancelled) setLayout(l)
    })
    return () => {
      cancelled = true
    }
  }, [graph.edges, graph.nodes])

  const neighbors = useMemo(() => {
    if (!hovered) return new Set<string>()
    const set = new Set<string>([hovered])
    for (const e of topo.edges) {
      if (e.a === hovered) set.add(e.b)
      if (e.b === hovered) set.add(e.a)
    }
    return set
  }, [hovered, topo.edges])

  if (!layout) {
    return <div className="muted">布局计算中…</div>
  }

  const W = Math.max(1400, layout.width + 140)
  const H = Math.max(800, layout.height + 140)

  return (
    <div className="topoWrap">
      <div className="topoToolbar">
        <span className="pill" onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}>Zoom +</span>
        <span className="pill" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}>Zoom -</span>
        <span className="pill" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Reset</span>
        <span className="pill">Nodes: {topo.nodes.length}</span>
        <span className="pill">Links: {topo.edges.length}</span>
      </div>

      <svg
        width={W}
        height={H}
        className="topoSvg"
        onWheel={(e) => {
          e.preventDefault()
          const dir = e.deltaY > 0 ? -1 : 1
          setZoom((z) => Math.max(0.35, Math.min(3.0, z + dir * 0.08)))
        }}
        onMouseDown={(e) => {
          const start = { x: e.clientX, y: e.clientY }
          const base = pan
          const onMove = (ev: MouseEvent) => {
            setPan({ x: base.x + (ev.clientX - start.x), y: base.y + (ev.clientY - start.y) })
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      >
        <g transform={`translate(${40 + pan.x},${40 + pan.y}) scale(${zoom})`}>
          {layout.edges.map((e) => {
            // highlight edges connected to hovered node
            const raw = topo.edges.find((x) => x.id === e.id)
            const hi = raw && hovered && (raw.a === hovered || raw.b === hovered)
            return (
              <polyline
                key={e.id}
                className={hi ? 'topoEdge topoEdgeHi' : 'topoEdge'}
                points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
              />
            )
          })}

          {topo.nodes.map((n) => {
            const pos = layout.nodes[n.id]
            if (!pos) return null
            const active = selected === n.id
            return (
              <g
                key={n.id}
                transform={`translate(${pos.x},${pos.y})`}
                className={`topoNode ${active ? 'topoNodeActive' : ''} ${hovered === n.id ? 'topoNodeHover' : ''} ${hovered && !neighbors.has(n.id) ? 'topoNodeDim' : ''}`}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(n.id)}
              >
                <rect width={pos.width} height={pos.height} rx={14} ry={14} />
                <g transform="translate(12,12)" className="topoNodeIcon">
                  {iconFor(n.kind)}
                </g>
                <text x={36} y={26} className="topoNodeTitle">
                  {n.label}
                </text>
                <text x={36} y={45} className="topoNodeSub">
                  {n.kind} · {n.igp}{n.vpnv4 ? ' · VPNv4' : ''}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
