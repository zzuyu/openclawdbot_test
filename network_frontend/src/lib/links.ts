import type { NetworkSnapshot } from '../mock/network'

export type LinkProtocol = 'OSPF' | 'IS-IS' | 'ETH'

export type Link = {
  id: string
  a: string
  b: string
  protocol: LinkProtocol
  isisLevel?: 1 | 2
  cost?: number
  aIf?: string
  bIf?: string
}

export function buildLinks(snapshot: NetworkSnapshot, opts?: { aggregateAccess?: boolean }): Link[] {
  const aggregateAccess = opts?.aggregateAccess ?? snapshot.devices.length > 120

  const devById = new Map(snapshot.devices.map((d) => [d.id, d]))
  const seen = new Set<string>()
  const links: Link[] = []

  for (const d of snapshot.devices) {
    for (const i of d.ifaces) {
      const a = d.id
      const b = i.peer.nodeId
      const peer = devById.get(b)

      if (aggregateAccess) {
        if (d.kind === 'CE' || peer?.kind === 'CE') continue
      }

      const key = [a, b].sort().join('--')
      if (seen.has(key)) continue
      seen.add(key)

      const proto = i.igp?.protocol ?? (d.igp.type as LinkProtocol)
      links.push({
        id: `l-${key}`,
        a,
        b,
        protocol: peer ? proto : 'ETH',
        isisLevel: i.igp?.isisLevel,
        cost: i.igp?.cost ?? i.igpCost,
        aIf: i.name,
        bIf: i.peer.iface,
      })
    }
  }

  // aggregated access edges
  if (aggregateAccess) {
    const ceByPe = new Map<string, number>()
    for (const d of snapshot.devices) {
      if (d.kind !== 'CE') continue
      const peId = d.ifaces?.[0]?.peer?.nodeId
      if (!peId) continue
      ceByPe.set(peId, (ceByPe.get(peId) ?? 0) + 1)
    }
    for (const peId of ceByPe.keys()) {
      links.push({
        id: `l-${peId}--acc:${peId}`,
        a: peId,
        b: `acc:${peId}`,
        protocol: 'ETH',
      })
    }
  }

  return links
}
