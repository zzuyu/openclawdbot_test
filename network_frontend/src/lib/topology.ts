import type { Device, NetworkSnapshot } from '../mock/network'
import type { GraphEdge, GraphNode } from './layout'

export type TopoNode = {
  id: string
  label: string
  kind: Device['kind']
  loopback: string
  igp: Device['igp']['type']
  vpnv4: boolean
}

export type Topology = {
  nodes: TopoNode[]
  edges: { id: string; a: string; b: string }[]
}

export function buildTopologyFromSnapshot(snapshot: NetworkSnapshot, opts?: { aggregateAccess?: boolean }): Topology {
  const aggregateAccess = opts?.aggregateAccess ?? snapshot.devices.length > 120

  // Build base nodes (optionally drop CEs in favor of aggregated access nodes).
  const nodes: TopoNode[] = []

  for (const d of snapshot.devices) {
    if (aggregateAccess && d.kind === 'CE') continue
    nodes.push({
      id: d.id,
      label: d.name,
      kind: d.kind,
      loopback: d.loopback,
      igp: d.igp.type,
      vpnv4: d.bgp.vpnv4Enabled,
    })
  }

  const seen = new Set<string>()
  const edges: { id: string; a: string; b: string }[] = []

  // Build aggregated access nodes per PE when enabled.
  if (aggregateAccess) {
    const ceByPe = new Map<string, number>()
    for (const d of snapshot.devices) {
      if (d.kind !== 'CE') continue
      const peId = d.ifaces?.[0]?.peer?.nodeId
      if (!peId) continue
      ceByPe.set(peId, (ceByPe.get(peId) ?? 0) + 1)
    }

    for (const [peId, count] of ceByPe.entries()) {
      const pe = snapshot.devices.find((x) => x.id === peId)
      nodes.push({
        id: `acc:${peId}`,
        label: `ACCESS x${count}`,
        // @ts-expect-error - ACC is a synthetic kind for visualization
        kind: 'ACC',
        loopback: pe?.loopback ?? '-',
        igp: pe?.igp.type ?? 'OSPF',
        vpnv4: false,
      })
      edges.push({ id: `e-${peId}--acc:${peId}`, a: peId, b: `acc:${peId}` })
    }
  }

  for (const d of snapshot.devices) {
    for (const i of d.ifaces) {
      const a = d.id
      const b = i.peer.nodeId

      if (aggregateAccess) {
        // Remove direct CE edges; handled by acc nodes.
        const peer = snapshot.devices.find((x) => x.id === b)
        if (d.kind === 'CE' || peer?.kind === 'CE') continue
      }

      const key = [a, b].sort().join('--')
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ id: `e-${key}`, a, b })
    }
  }

  return { nodes, edges }
}

export function toGraph(top: Topology): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: top.nodes.map((n) => ({ id: n.id, width: 170, height: 62 })),
    edges: top.edges.map((e) => ({ id: e.id, sources: [e.a], targets: [e.b] })),
  }
}
