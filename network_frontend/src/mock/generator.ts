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
      igp: { type: 'OSPF', processId: '1', area: '0.0.0.0' },
      ifaces: [],
      bgp: { routerId: '10.255.0.253', peers: [], vpnv4Enabled: true, rr: true },
      routes: [],
    },
  ]

  devices.push(...rr)

  // Core P nodes (one per POP)
  const ps: Device[] = []
  for (let p = 1; p <= pops; p++) {
    ps.push({
      id: `p${p}`,
      name: `P${p}`,
      vendor: 'Huawei',
      model: 'NE40E-X16A',
      kind: 'P',
      loopback: `10.255.10.${p}/32`,
      asn,
      igp: { type: 'OSPF', processId: '1', area: '0.0.0.0' },
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
      const pe: Device = {
        id: peId,
        name: `PE${pop}-${k}`,
        vendor: 'Huawei',
        model: 'NE40E-X8A',
        kind: 'PE',
        loopback: loop(idx++),
        asn,
        igp: { type: 'OSPF', processId: '1', area: '0.0.0.0' },
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
        const ce: Device = {
          id: ceId,
          name: `CE${pop}-${k}-${c}`,
          vendor: 'Huawei',
          model: 'AR2240',
          kind: 'CE',
          loopback: `10.${pop}.${k}.${c}/32`,
          asn: 65100 + pop,
          igp: { type: 'OSPF', processId: String(100 + pop), area: '0.0.0.0' },
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

  const tunnels: Tunnel[] = []
  const servicePaths: ServicePath[] = []

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
