import type { Device, NetworkSnapshot } from '../mock/network'
import type { GraphEdge, GraphNode } from './layout'

export type TopoNode = {
  id: string
  label: string
  kind: Device['kind']
  loopback: string
}

export type Topology = {
  nodes: TopoNode[]
  edges: { id: string; a: string; b: string }[]
}

export function buildTopologyFromSnapshot(snapshot: NetworkSnapshot): Topology {
  const nodes: TopoNode[] = snapshot.devices.map((d) => ({
    id: d.id,
    label: d.name,
    kind: d.kind,
    loopback: d.loopback,
  }))

  const seen = new Set<string>()
  const edges: { id: string; a: string; b: string }[] = []

  for (const d of snapshot.devices) {
    for (const i of d.ifaces) {
      const a = d.id
      const b = i.peer.nodeId
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
