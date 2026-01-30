import type { Device, NetworkSnapshot, Tunnel, ServicePath } from './network'

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0')
}

function loop(i: number) {
  return `10.255.${Math.floor(i / 254)}.${(i % 254) + 1}/32`
}

export function generateLargeSnapshot(opts?: { pops?: number; pesPerPop?: number; cesPerPe?: number }) {
  const pops = opts?.pops ?? 8
  const pesPerPop = opts?.pesPerPop ?? 6
  const cesPerPe = opts?.cesPerPe ?? 3

  const igpType = (pop: number) => (pop % 2 === 0 ? 'IS-IS' : 'OSPF') as 'OSPF' | 'IS-IS'

  // ~ (RR 2) + (P 8) + (PE 48) + (CE 144) = 202 nodes
  const devices: Device[] = []

  const asn = 65000

  const rr: Device[] = [
    {
      id: 'rr1',
      name: 'RR1',
      vendor: 'Huawei',
      model: 'NE40E-X8A',
      kind: 'RR',
      loopback: '10.255.0.254/32',
      asn,
      igp: { type: 'OSPF', processId: '1', area: '0.0.0.0' },
      ifaces: [],
      bgp: { routerId: '10.255.0.254', peers: [], vpnv4Enabled: true, rr: true },
      routes: [],
    },
    {
      id: 'rr2',
      name: 'RR2',
      vendor: 'Huawei',
      model: 'NE40E-X8A',
      kind: 'RR',
      loopback: '10.255.0.253/32',
      asn,
      igp: { type: 'IS-IS', processId: '1', area: '49.0001' },
      ifaces: [],
      bgp: { routerId: '10.255.0.253', peers: [], vpnv4Enabled: true, rr: true },
      routes: [],
    },
  ]

  devices.push(...rr)

  // Core P nodes (one per POP)
  const ps: Device[] = []
  for (let p = 1; p <= pops; p++) {
    const igp = igpType(p)
    ps.push({
      id: `p${p}`,
      name: `P${p}`,
      vendor: 'Huawei',
      model: 'NE40E-X16A',
      kind: 'P',
      loopback: `10.255.10.${p}/32`,
      asn,
      igp: igp === 'OSPF' ? { type: 'OSPF', processId: '1', area: '0.0.0.0' } : { type: 'IS-IS', processId: '1', area: '49.0001' },
      ifaces: [],
      bgp: { routerId: `10.255.10.${p}`, peers: [], vpnv4Enabled: false },
      routes: [],
    })
  }
  devices.push(...ps)

  // Build PE/CE per POP
  let idx = 1
  for (let pop = 1; pop <= pops; pop++) {
    for (let k = 1; k <= pesPerPop; k++) {
      const peId = `pe${pad(pop)}-${pad(k)}`
      const igp = igpType(pop)
      const pe: Device = {
        id: peId,
        name: `PE${pop}-${k}`,
        vendor: 'Huawei',
        model: 'NE40E-X8A',
        kind: 'PE',
        loopback: loop(idx++),
        asn,
        igp: igp === 'OSPF' ? { type: 'OSPF', processId: '1', area: '0.0.0.0' } : { type: 'IS-IS', processId: '1', area: '49.0001' },
        ifaces: [],
        bgp: {
          routerId: loop(idx - 1).split('/')[0],
          vpnv4Enabled: true,
          peers: [
            { peerIp: rr[0].loopback.split('/')[0], peerAsn: asn, afi: 'vpnv4', state: 'Established' },
            { peerIp: rr[1].loopback.split('/')[0], peerAsn: asn, afi: 'vpnv4', state: 'Established' },
          ],
        },
        routes: [],
      }

      // Link PE to P(pop)
      pe.ifaces.push({
        name: 'GE0/0/0',
        ip: `172.${pop}.0.${k * 2 - 1}/30`,
        peer: { nodeId: `p${pop}`, iface: `GE0/0/${k}` },
        igpCost: 10,
      })

      // CE(s)
      for (let c = 1; c <= cesPerPe; c++) {
        const ceId = `ce${pad(pop)}-${pad(k)}-${pad(c)}`
        const ceIgp = (c % 2 === 0 ? 'OSPF' : 'IS-IS') as 'OSPF' | 'IS-IS'
        const ce: Device = {
          id: ceId,
          name: `CE${pop}-${k}-${c}`,
          vendor: 'Huawei',
          model: 'AR2240',
          kind: 'CE',
          loopback: `10.${pop}.${k}.${c}/32`,
          asn: 65100 + pop,
          igp: ceIgp === 'OSPF' ? { type: 'OSPF', processId: String(100 + pop), area: '0.0.0.0' } : { type: 'IS-IS', processId: String(100 + pop), area: '49.1000' },
          ifaces: [
            {
              name: 'GE0/0/0',
              ip: `192.168.${pop}.${k * 10 + c}/30`,
              peer: { nodeId: peId, iface: `GE0/0/${c}` },
            },
          ],
          bgp: {
            routerId: `10.${pop}.${k}.${c}`,
            vpnv4Enabled: false,
            peers: [{ peerIp: pe.ifaces[0].ip.split('/')[0], peerAsn: asn, afi: 'ipv4', state: 'Established' }],
          },
          routes: [],
        }
        // Link PE to CE iface list
        pe.ifaces.push({
          name: `GE0/0/${c}`,
          ip: `192.168.${pop}.${k * 10 + c - 1}/30`,
          peer: { nodeId: ceId, iface: 'GE0/0/0' },
        })

        devices.push(ce)
      }

      devices.push(pe)
    }
  }

  // Link each P to RR1/RR2 (simplified)
  for (let pop = 1; pop <= pops; pop++) {
    const p = devices.find((d) => d.id === `p${pop}`)!
    p.ifaces.push(
      {
        name: 'GE0/0/0',
        ip: `172.${pop}.255.1/30`,
        peer: { nodeId: 'rr1', iface: `GE0/0/${pop}` },
        igpCost: 10,
      },
      {
        name: 'GE0/0/1',
        ip: `172.${pop}.255.5/30`,
        peer: { nodeId: 'rr2', iface: `GE0/0/${pop}` },
        igpCost: 10,
      },
    )
  }

  // Tunnels: mix MPLS (LDP) + SR-TE, per POP pair
  const tunnels: Tunnel[] = []
  for (let pop = 1; pop <= pops; pop++) {
    const peA = `pe${pad(pop)}-${pad(1)}`
    const peB = `pe${pad(((pop % pops) + 1))}-${pad(1)}`
    tunnels.push(
      {
        id: `t-ldp-${pad(pop)}`,
        type: 'LDP-LSP',
        from: peA,
        to: peB,
        labels: [16000 + pop, 16010 + pop, 16020 + pop],
        status: pop % 7 === 0 ? 'Down' : 'Up',
        latencyMs: 3 + (pop % 5),
      },
      {
        id: `t-srte-${pad(pop)}`,
        type: 'SR-TE',
        from: peA,
        to: peB,
        labels: [900000 + pop, 900100 + pop, 900200 + pop],
        status: 'Up',
        bandwidthMbps: 200 + pop * 10,
        latencyMs: 2 + (pop % 3),
      },
    )
  }

  const servicePaths: ServicePath[] = []
  // Create a handful of services across POPs
  for (let s = 1; s <= Math.min(18, pops * 2); s++) {
    const popA = ((s - 1) % pops) + 1
    const popB = ((s + 2) % pops) + 1
    const peA = `pe${pad(popA)}-${pad(1)}`
    const peB = `pe${pad(popB)}-${pad(1)}`
    const ceA = `ce${pad(popA)}-${pad(1)}-${pad(1)}`
    const ceB = `ce${pad(popB)}-${pad(1)}-${pad(1)}`

    const useSr = s % 2 === 0
    const tunId = useSr ? `t-srte-${pad(popA)}` : `t-ldp-${pad(popA)}`

    servicePaths.push({
      id: `svc-${s}`,
      name: `VPN-A: ${ceA.toUpperCase()} -> ${ceB.toUpperCase()} (APP-${s})`,
      vrf: 'VPN-A',
      src: `192.168.${popA}.0/24`,
      dst: `192.168.${popB}.0/24`,
      policy: useSr ? 'sr-te' : 'bestpath',
      tunnels: [tunId],
      hops: [
        { nodeId: ceA, outIface: 'GE0/0/0', nextHopIp: `192.168.${popA}.0.1` },
        { nodeId: peA, inLabel: 10000 + s, outLabel: useSr ? 900000 + popA : 16000 + popA, nextHopIp: `172.${popA}.0.2` },
        { nodeId: `p${popA}`, inLabel: useSr ? 900000 + popA : 16000 + popA, outLabel: useSr ? 900100 + popA : 16010 + popA, nextHopIp: `172.${popA}.255.2` },
        { nodeId: 'rr1', inLabel: useSr ? 900100 + popA : 16010 + popA, outLabel: useSr ? 900200 + popA : 16020 + popA, nextHopIp: `172.${popB}.255.2` },
        { nodeId: peB, inLabel: useSr ? 900200 + popA : 16020 + popA, outLabel: 20000 + s, nextHopIp: `192.168.${popB}.0.2` },
        { nodeId: ceB },
      ],
    })
  }

  const snap: NetworkSnapshot = {
    id: 'snap-large-200',
    ts: '2026-01-30 23:52',
    region: 'CN-East-1',
    devices,
    tunnels,
    servicePaths,
  }

  return snap
}
