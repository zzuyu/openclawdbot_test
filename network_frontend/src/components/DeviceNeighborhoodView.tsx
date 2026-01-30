import { useMemo, useState } from 'react'
import type { NetworkSnapshot } from '../mock/network'
import { buildLinks } from '../lib/links'
import { layoutGraph } from '../lib/layout'
import './topology.css'

export default function DeviceNeighborhoodView({ snapshot, deviceId }: { snapshot: NetworkSnapshot; deviceId: string }) {
  const agg = snapshot.devices.length > 120
  const devById = useMemo(() => new Map(snapshot.devices.map((d) => [d.id, d])), [snapshot])
  const center = devById.get(deviceId)

  const links = useMemo(() => buildLinks(snapshot, { aggregateAccess: agg }), [snapshot, agg])

  const neigh = useMemo(() => {
    const n = new Set<string>()
    for (const l of links) {
      if (l.a === deviceId) n.add(l.b)
      if (l.b === deviceId) n.add(l.a)
    }
    return Array.from(n)
  }, [links, deviceId])

  const nodes = useMemo(() => {
    const ids = [deviceId, ...neigh]
    return ids.map((id) => ({ id, width: id === deviceId ? 220 : 180, height: 62 }))
  }, [deviceId, neigh])

  const edges = useMemo(() => {
    const es = links
      .filter((l) => (l.a === deviceId && neigh.includes(l.b)) || (l.b === deviceId && neigh.includes(l.a)))
      .map((l) => ({ id: l.id, sources: [l.a], targets: [l.b] }))
    return es
  }, [links, deviceId, neigh])

  const [layout, setLayout] = useState<{
    nodes: Record<string, { x: number; y: number; width: number; height: number }>
    edges: Array<{ id: string; points: Array<{ x: number; y: number }> }>
    width: number
    height: number
  } | null>(null)

  // re-layout when device changes
  useMemo(() => {
    layoutGraph(nodes, edges).then((l) => setLayout(l))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  if (!center) return <div className="muted">设备不存在</div>
  if (!layout) return <div className="muted">生成周边拓扑…</div>

  const W = Math.max(900, layout.width + 140)
  const H = Math.max(520, layout.height + 140)

  const linkMeta = new Map(links.map((l) => [l.id, l]))

  return (
    <div>
      <div className="h2">中心设备</div>
      <div className="kv"><span className="muted">Name</span><span>{center.name}</span></div>
      <div className="kv"><span className="muted">Role</span><span>{center.role}</span></div>
      <div className="kv"><span className="muted">IGP</span><span>{center.igp.type} {center.igp.area}</span></div>
      <div className="kv"><span className="muted">VPNv4</span><span>{center.bgp.vpnv4Enabled ? 'Enabled' : '—'}</span></div>

      <div className="h2" style={{ marginTop: 14 }}>一跳周边拓扑</div>
      <svg width={W} height={H} className="topoSvg">
        <g transform="translate(40,40)">
          {layout.edges.map((e) => {
            const meta = linkMeta.get(e.id)
            const pts = e.points || []
            return (
              <g key={e.id}>
                <polyline className="topoEdge" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
                {meta && pts.length >= 2 ? (
                  <text className="topoEdgeLabel" x={(pts[0].x + pts[pts.length - 1].x) / 2} y={(pts[0].y + pts[pts.length - 1].y) / 2 - 6}>
                    {meta.protocol}{meta.protocol === 'IS-IS' && meta.isisLevel ? ` L${meta.isisLevel}` : ''}
                  </text>
                ) : null}
              </g>
            )
          })}

          {Object.entries(layout.nodes).map(([id, pos]) => {
            const d = devById.get(id)
            const title = d?.name ?? id
            const sub = d ? `${d.role} · ${d.igp.type}` : '—'
            const active = id === deviceId
            return (
              <g key={id} transform={`translate(${pos.x},${pos.y})`} className={`topoNode ${active ? 'topoNodeActive' : ''}`}>
                <rect width={pos.width} height={pos.height} rx={14} ry={14} />
                <text x={12} y={26} className="topoNodeTitle">{title}</text>
                <text x={12} y={45} className="topoNodeSub">{sub}</text>
              </g>
            )
          })}
        </g>
      </svg>

      <div className="h2" style={{ marginTop: 14 }}>关联说明（自动摘要）</div>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
        该视图展示 {center.name} 与一跳邻居的物理关联及协议关系：链路标签标注 IGP 类型与 IS-IS level。
        你可以基于这张图做“周边设备关联审计”（例如某条 IS-IS L2 上联异常、某条 OSPF cost 不一致）。
      </div>
    </div>
  )
}
