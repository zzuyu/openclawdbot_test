export type NodeKind = 'PE' | 'P' | 'RR' | 'CE' | 'MAR'

export type Role = 'MER' | 'MAR' | 'MCR' | 'RR' | 'CE'

export type Iface = {
  name: string
  ip: string
  peer: { nodeId: string; iface: string }
  igpCost?: number
  igp?: {
    protocol: 'OSPF' | 'IS-IS'
    isisLevel?: 1 | 2
    area?: string
    cost?: number
  }
}

export type BgpPeer = {
  peerIp: string
  peerAsn: number
  afi: 'ipv4' | 'ipv6' | 'vpnv4'
  state: 'Established' | 'Idle' | 'Active'
  rrClient?: boolean
}

export type Tunnel = {
  id: string
  type: 'LDP-LSP' | 'RSVP-TE' | 'SR-TE'
  from: string
  to: string
  labels: number[]
  status: 'Up' | 'Down'
  bandwidthMbps?: number
  latencyMs?: number
}

export type RouteEntry = {
  prefix: string
  protocol: 'OSPF' | 'IS-IS' | 'BGP' | 'DIRECT' | 'STATIC'
  nextHop: string
  outIface: string
  metric?: number
  vrf?: string
}

export type ServicePathHop = {
  nodeId: string
  inLabel?: number
  outLabel?: number
  outIface?: string
  nextHopIp?: string
}

export type ServicePath = {
  id: string
  name: string
  vrf: string
  src: string
  dst: string
  policy: 'bestpath' | 'sr-te' | 'te'
  tunnels: string[]
  hops: ServicePathHop[]
}

export type Device = {
  id: string
  name: string
  vendor: 'Huawei'
  model: string
  kind: NodeKind
  role: Role
  loopback: string
  asn: number
  igp: { type: 'OSPF' | 'IS-IS'; processId: string; area: string }
  ifaces: Iface[]
  bgp: { routerId: string; peers: BgpPeer[]; vpnv4Enabled: boolean; rr?: boolean }
  routes: RouteEntry[]
}

export type NetworkSnapshot = {
  id: string
  ts: string
  region: string
  devices: Device[]
  tunnels: Tunnel[]
  servicePaths: ServicePath[]
}

export const snapshot: NetworkSnapshot = {
  id: 'snap-20260130-2352',
  ts: '2026-01-30 23:52',
  region: 'CN-East-1',
  devices: [
    {
      id: 'pe1',
      name: 'PE1',
      vendor: 'Huawei',
      model: 'NE40E-X8A',
      kind: 'PE',
      role: 'MER',
      loopback: '10.255.0.1/32',
      asn: 65000,
      igp: { type: 'OSPF', processId: '1', area: '0.0.0.0' },
      ifaces: [
        { name: 'GE0/0/0', ip: '172.16.1.1/30', peer: { nodeId: 'p1', iface: 'GE0/0/0' }, igpCost: 10 },
        { name: 'GE0/0/1', ip: '192.168.10.1/30', peer: { nodeId: 'ce1', iface: 'GE0/0/0' } },
      ],
      bgp: {
        routerId: '10.255.0.1',
        vpnv4Enabled: true,
        peers: [
          { peerIp: '10.255.0.254', peerAsn: 65000, afi: 'vpnv4', state: 'Established' },
          { peerIp: '10.255.0.254', peerAsn: 65000, afi: 'ipv4', state: 'Established' },
        ],
      },
      routes: [
        { prefix: '10.255.0.254/32', protocol: 'OSPF', nextHop: '172.16.1.2', outIface: 'GE0/0/0', metric: 10 },
        { prefix: '192.168.20.0/24', protocol: 'BGP', nextHop: '10.255.0.254', outIface: 'LoopBack0', vrf: 'VPN-A' },
        { prefix: '192.168.10.0/24', protocol: 'DIRECT', nextHop: '0.0.0.0', outIface: 'GE0/0/1', vrf: 'VPN-A' },
      ],
    },
    {
      id: 'p1',
      name: 'P1',
      vendor: 'Huawei',
      model: 'NE40E-X16A',
      kind: 'P',
      role: 'MCR',
      loopback: '10.255.0.11/32',
      asn: 65000,
      igp: { type: 'OSPF', processId: '1', area: '0.0.0.0' },
      ifaces: [
        { name: 'GE0/0/0', ip: '172.16.1.2/30', peer: { nodeId: 'pe1', iface: 'GE0/0/0' }, igpCost: 10 },
        { name: 'GE0/0/1', ip: '172.16.2.1/30', peer: { nodeId: 'rr1', iface: 'GE0/0/0' }, igpCost: 10 },
      ],
      bgp: { routerId: '10.255.0.11', vpnv4Enabled: false, peers: [] },
      routes: [
        { prefix: '10.255.0.1/32', protocol: 'OSPF', nextHop: '172.16.1.1', outIface: 'GE0/0/0', metric: 10 },
        { prefix: '10.255.0.254/32', protocol: 'OSPF', nextHop: '172.16.2.2', outIface: 'GE0/0/1', metric: 10 },
      ],
    },
    {
      id: 'rr1',
      name: 'RR1',
      vendor: 'Huawei',
      model: 'NE40E-X8A',
      kind: 'RR',
      role: 'RR',
      loopback: '10.255.0.254/32',
      asn: 65000,
      igp: { type: 'OSPF', processId: '1', area: '0.0.0.0' },
      ifaces: [
        { name: 'GE0/0/0', ip: '172.16.2.2/30', peer: { nodeId: 'p1', iface: 'GE0/0/1' }, igpCost: 10 },
        { name: 'GE0/0/1', ip: '172.16.3.1/30', peer: { nodeId: 'pe2', iface: 'GE0/0/0' }, igpCost: 10 },
      ],
      bgp: {
        routerId: '10.255.0.254',
        vpnv4Enabled: true,
        rr: true,
        peers: [
          { peerIp: '10.255.0.1', peerAsn: 65000, afi: 'vpnv4', state: 'Established', rrClient: true },
          { peerIp: '10.255.0.2', peerAsn: 65000, afi: 'vpnv4', state: 'Established', rrClient: true },
        ],
      },
      routes: [
        { prefix: '10.255.0.1/32', protocol: 'OSPF', nextHop: '172.16.2.1', outIface: 'GE0/0/0', metric: 20 },
        { prefix: '10.255.0.2/32', protocol: 'OSPF', nextHop: '172.16.3.2', outIface: 'GE0/0/1', metric: 20 },
      ],
    },
    {
      id: 'pe2',
      name: 'PE2',
      vendor: 'Huawei',
      model: 'NE40E-X8A',
      kind: 'PE',
      role: 'MER',
      loopback: '10.255.0.2/32',
      asn: 65000,
      igp: { type: 'OSPF', processId: '1', area: '0.0.0.0' },
      ifaces: [
        { name: 'GE0/0/0', ip: '172.16.3.2/30', peer: { nodeId: 'rr1', iface: 'GE0/0/1' }, igpCost: 10 },
        { name: 'GE0/0/1', ip: '192.168.20.1/30', peer: { nodeId: 'ce2', iface: 'GE0/0/0' } },
      ],
      bgp: {
        routerId: '10.255.0.2',
        vpnv4Enabled: true,
        peers: [
          { peerIp: '10.255.0.254', peerAsn: 65000, afi: 'vpnv4', state: 'Established' },
          { peerIp: '10.255.0.254', peerAsn: 65000, afi: 'ipv4', state: 'Established' },
        ],
      },
      routes: [
        { prefix: '10.255.0.254/32', protocol: 'OSPF', nextHop: '172.16.3.1', outIface: 'GE0/0/0', metric: 10 },
        { prefix: '192.168.10.0/24', protocol: 'BGP', nextHop: '10.255.0.254', outIface: 'LoopBack0', vrf: 'VPN-A' },
        { prefix: '192.168.20.0/24', protocol: 'DIRECT', nextHop: '0.0.0.0', outIface: 'GE0/0/1', vrf: 'VPN-A' },
      ],
    },
    {
      id: 'ce1',
      name: 'CE1',
      vendor: 'Huawei',
      model: 'AR2240',
      kind: 'CE',
      role: 'CE',
      loopback: '10.10.10.1/32',
      asn: 65101,
      igp: { type: 'OSPF', processId: '10', area: '0.0.0.0' },
      ifaces: [{ name: 'GE0/0/0', ip: '192.168.10.2/30', peer: { nodeId: 'pe1', iface: 'GE0/0/1' } }],
      bgp: { routerId: '10.10.10.1', vpnv4Enabled: false, peers: [{ peerIp: '192.168.10.1', peerAsn: 65000, afi: 'ipv4', state: 'Established' }] },
      routes: [
        { prefix: '192.168.20.0/24', protocol: 'BGP', nextHop: '192.168.10.1', outIface: 'GE0/0/0' },
        { prefix: '192.168.10.0/24', protocol: 'DIRECT', nextHop: '0.0.0.0', outIface: 'GE0/0/0' },
      ],
    },
    {
      id: 'ce2',
      name: 'CE2',
      vendor: 'Huawei',
      model: 'AR2240',
      kind: 'CE',
      role: 'CE',
      loopback: '10.20.20.1/32',
      asn: 65102,
      igp: { type: 'OSPF', processId: '20', area: '0.0.0.0' },
      ifaces: [{ name: 'GE0/0/0', ip: '192.168.20.2/30', peer: { nodeId: 'pe2', iface: 'GE0/0/1' } }],
      bgp: { routerId: '10.20.20.1', vpnv4Enabled: false, peers: [{ peerIp: '192.168.20.1', peerAsn: 65000, afi: 'ipv4', state: 'Established' }] },
      routes: [
        { prefix: '192.168.10.0/24', protocol: 'BGP', nextHop: '192.168.20.1', outIface: 'GE0/0/0' },
        { prefix: '192.168.20.0/24', protocol: 'DIRECT', nextHop: '0.0.0.0', outIface: 'GE0/0/0' },
      ],
    },
  ],
  tunnels: [
    {
      id: 't-lsp-001',
      type: 'LDP-LSP',
      from: 'pe1',
      to: 'pe2',
      labels: [16001, 16011, 160254, 16002],
      status: 'Up',
      latencyMs: 4,
    },
    {
      id: 't-srte-010',
      type: 'SR-TE',
      from: 'pe1',
      to: 'pe2',
      labels: [16001, 900011, 900254, 900002],
      status: 'Up',
      bandwidthMbps: 500,
      latencyMs: 3,
    },
  ],
  servicePaths: [
    {
      id: 'svc-a',
      name: 'VPN-A: CE1 -> CE2 (HTTP)',
      vrf: 'VPN-A',
      src: '192.168.10.0/24',
      dst: '192.168.20.0/24',
      policy: 'sr-te',
      tunnels: ['t-srte-010'],
      hops: [
        { nodeId: 'ce1', outIface: 'GE0/0/0', nextHopIp: '192.168.10.1' },
        { nodeId: 'pe1', inLabel: 10010, outLabel: 900011, nextHopIp: '172.16.1.2' },
        { nodeId: 'p1', inLabel: 900011, outLabel: 900254, nextHopIp: '172.16.2.2' },
        { nodeId: 'rr1', inLabel: 900254, outLabel: 900002, nextHopIp: '172.16.3.2' },
        { nodeId: 'pe2', inLabel: 900002, outLabel: 20020, nextHopIp: '192.168.20.2' },
        { nodeId: 'ce2' },
      ],
    },
  ],
}
