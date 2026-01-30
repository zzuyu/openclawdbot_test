import { useEffect, useMemo, useState } from 'react'
import { Server, Router, Repeat2, Building2 } from 'lucide-react'

import { layoutGraph, type LayoutResult } from '../lib/layout'
import { buildTopologyFromSnapshot, toGraph } from '../lib/topology'
import './topology.css'

function iconFor(kind: string) {
  if (kind === 'RR') return <Repeat2 size={16} />
  if (kind === 'P') return <Router size={16} />
  if (kind === 'PE') return <Server size={16} />
  return <Building2 size={16} />
}

export default function TopologyView() {
  const topo = useMemo(() => buildTopologyFromSnapshot(), [])
  const graph = useMemo(() => toGraph(topo), [topo])

  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    layoutGraph(graph.nodes, graph.edges).then((l) => {
      if (!cancelled) setLayout(l)
    })
    return () => {
      cancelled = true
    }
  }, [graph.edges, graph.nodes])

  if (!layout) {
    return <div className="muted">布局计算中…</div>
  }

  const W = Math.max(1200, layout.width + 80)
  const H = Math.max(700, layout.height + 80)

  return (
    <div className="topoWrap">
      <svg width={W} height={H} className="topoSvg">
        <g transform="translate(40,40)">
          {layout.edges.map((e) => (
            <polyline
              key={e.id}
              className="topoEdge"
              points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
            />
          ))}

          {topo.nodes.map((n) => {
            const pos = layout.nodes[n.id]
            if (!pos) return null
            const active = selected === n.id
            return (
              <g
                key={n.id}
                transform={`translate(${pos.x},${pos.y})`}
                className={`topoNode ${active ? 'topoNodeActive' : ''}`}
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
                  {n.kind} · {n.loopback}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
