import { useMemo, useState } from 'react'
import './styles.css'
import { snapshot as smallSnapshot } from './mock/network'
import { generateLargeSnapshot } from './mock/generator'
import NetworkViews from './components/NetworkViews'

type View = { kind: 'topo' } | { kind: 'device'; id: string } | { kind: 'tunnel'; id: string } | { kind: 'service'; id: string }

export default function App() {
  const [mode, setMode] = useState<'SMALL' | 'LARGE'>('LARGE')
  const snapshot = useMemo(() => {
    return mode === 'LARGE' ? generateLargeSnapshot() : smallSnapshot
  }, [mode])

  const [view, setView] = useState<View>({ kind: 'topo' })

  const device = view.kind === 'device' ? snapshot.devices.find((d) => d.id === view.id) || null : null
  const tunnel = view.kind === 'tunnel' ? snapshot.tunnels.find((t) => t.id === view.id) || null : null
  const service = view.kind === 'service' ? snapshot.servicePaths.find((s) => s.id === view.id) || null : null

  const selectedTitle = useMemo(() => {
    if (view.kind === 'topo') return '拓扑布局'
    if (device) return `${device.name} · ${device.model}`
    if (tunnel) return `${tunnel.id} · ${tunnel.type}`
    if (service) return service.name
    return '—'
  }, [device, tunnel, service, view.kind])

  return (
    <div className="container">
      <div className="shell">
        <div className="topbar">
          <div className="brand">NET · IP RESTORE</div>
          <div className="pills">
            <span className="pill">Snapshot: {snapshot.id}</span>
            <span className="pill">Region: {snapshot.region}</span>
            <span className="pill">TS: {snapshot.ts}</span>
            <span className="pill" style={{ cursor: 'pointer' }} onClick={() => setMode(mode === 'LARGE' ? 'SMALL' : 'LARGE')}>
              MODE: {mode}
            </span>
          </div>
        </div>

        <div className="grid">
          <div className="panel">
            <div className="h2">结构</div>
            <div
              className={`treeItem ${view.kind === 'topo' ? 'treeItemActive' : ''}`}
              onClick={() => setView({ kind: 'topo' })}
            >
              <div style={{ fontSize: 12, letterSpacing: '.12em' }}>TOPOLOGY</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                设备布局 · 线路关系 · 可缩放
              </div>
            </div>
            <div className="treeItem">
              <div style={{ fontSize: 12, letterSpacing: '.12em' }}>IGP</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                OSPF Area 0 · Core + Edge
              </div>
            </div>

            <div className="h2">设备</div>
            {snapshot.devices.map((d) => (
              <div
                key={d.id}
                className={`treeItem ${view.kind === 'device' && view.id === d.id ? 'treeItemActive' : ''}`}
                onClick={() => setView({ kind: 'device', id: d.id })}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 12, letterSpacing: '.10em' }}>{d.name}</div>
                  <span className="pill">{d.kind}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Lo0: {d.loopback}
                </div>
              </div>
            ))}

            <div className="h2">协议层</div>
            <div className="treeItem">
              <div style={{ fontSize: 12, letterSpacing: '.12em' }}>协议概览</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                IGP(OSPF/IS-IS) · MP-BGP(VPNv4) · MPLS(LDP) · SR-TE
              </div>
            </div>

            <div className="h2">BGP / RR</div>
            {snapshot.devices
              .filter((d) => d.bgp.peers.length || d.kind === 'RR')
              .map((d) => (
                <div
                  key={`bgp-${d.id}`}
                  className={`treeItem ${view.kind === 'device' && view.id === d.id ? 'treeItemActive' : ''}`}
                  onClick={() => setView({ kind: 'device', id: d.id })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 12, letterSpacing: '.10em' }}>{d.name} · BGP</div>
                    <span className="pill">ASN {d.asn}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Router-ID: {d.bgp.routerId}
                  </div>
                </div>
              ))}

            <div className="h2">隧道</div>
            {snapshot.tunnels.map((t) => (
              <div
                key={t.id}
                className={`treeItem ${view.kind === 'tunnel' && view.id === t.id ? 'treeItemActive' : ''}`}
                onClick={() => setView({ kind: 'tunnel', id: t.id })}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 12, letterSpacing: '.10em' }}>{t.id}</div>
                  <span className={`badge ${t.status === 'Up' ? 'badgeUp' : 'badgeDown'}`}>{t.status}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {t.type} · {t.from.toUpperCase()} → {t.to.toUpperCase()}
                </div>
              </div>
            ))}

            <div className="h2">业务路径</div>
            {snapshot.servicePaths.map((s) => (
              <div
                key={s.id}
                className={`treeItem ${view.kind === 'service' && view.id === s.id ? 'treeItemActive' : ''}`}
                onClick={() => setView({ kind: 'service', id: s.id })}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 12, letterSpacing: '.10em' }}>{s.name}</div>
                  <span className="pill">{s.vrf}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {s.src} → {s.dst}
                </div>
              </div>
            ))}
          </div>

          <div className="center">
            <div className="canvas">
              <div className="h2">视图</div>
              <div style={{ fontSize: 14, letterSpacing: '.06em', marginBottom: 10 }}>{selectedTitle}</div>

              {view.kind === 'topo' ? (
                <>
                  <NetworkViews snapshot={snapshot} />
                </>
              ) : service ? (
                <>
                  <div className="h2">路径分层</div>
                  <div className="hop">
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: '.10em' }}>业务</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        VRF {service.vrf} · {service.src} → {service.dst}
                      </div>
                    </div>
                    <span className="pill">policy: {service.policy}</span>
                  </div>

                  <div className="hop">
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: '.10em' }}>隧道</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {service.tunnels.join(', ') || '—'}
                      </div>
                    </div>
                    <span className="pill">MPLS</span>
                  </div>

                  <div className="hop">
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: '.10em' }}>路由</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        IGP reachability + MP-BGP (VPNv4)
                      </div>
                    </div>
                    <span className="pill">IGP/BGP</span>
                  </div>

                  <div className="h2">逐跳还原（离散数据）</div>
                  {service.hops.map((h, idx) => (
                    <div key={idx} className="hop">
                      <div>
                        <div style={{ fontSize: 12, letterSpacing: '.10em' }}>{h.nodeId.toUpperCase()}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                          {h.nextHopIp ? `NH: ${h.nextHopIp}` : '终点'}
                          {h.outIface ? ` · Out: ${h.outIface}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {h.inLabel != null ? `in ${h.inLabel}` : ''} {h.outLabel != null ? `→ out ${h.outLabel}` : ''}
                        </div>
                        <span className="pill">hop {idx + 1}</span>
                      </div>
                    </div>
                  ))}
                </>
              ) : device ? (
                <>
                  <div className="h2">IGP</div>
                  <div className="kv"><span className="muted">Protocol</span><span>{device.igp.type}</span></div>
                  <div className="kv"><span className="muted">Process</span><span>{device.igp.processId}</span></div>
                  <div className="kv"><span className="muted">Area</span><span>{device.igp.area}</span></div>

                  <div className="h2">接口</div>
                  <table className="table">
                    <thead>
                      <tr><th>IF</th><th>IP</th><th>Peer</th><th>Cost</th></tr>
                    </thead>
                    <tbody>
                      {device.ifaces.map((i) => (
                        <tr key={i.name}>
                          <td>{i.name}</td>
                          <td>{i.ip}</td>
                          <td>{i.peer.nodeId.toUpperCase()}</td>
                          <td>{i.igpCost ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : tunnel ? (
                <>
                  <div className="h2">隧道详情</div>
                  <div className="kv"><span className="muted">Type</span><span>{tunnel.type}</span></div>
                  <div className="kv"><span className="muted">From</span><span>{tunnel.from.toUpperCase()}</span></div>
                  <div className="kv"><span className="muted">To</span><span>{tunnel.to.toUpperCase()}</span></div>
                  <div className="kv"><span className="muted">Status</span><span>{tunnel.status}</span></div>
                  <div className="kv"><span className="muted">Latency</span><span>{tunnel.latencyMs ?? '-'} ms</span></div>
                  <div className="kv"><span className="muted">BW</span><span>{tunnel.bandwidthMbps ?? '-'} Mbps</span></div>

                  <div className="h2">Label Stack</div>
                  <div className="muted" style={{ fontSize: 12 }}>{tunnel.labels.join(' · ')}</div>
                </>
              ) : (
                <div className="muted">选择一个对象查看还原详情。</div>
              )}
            </div>
          </div>

          <div className="panel panelRight">
            <div className="h2">细节</div>
            {device ? (
              <>
                <div className="kv"><span className="muted">Vendor</span><span>{device.vendor}</span></div>
                <div className="kv"><span className="muted">Model</span><span>{device.model}</span></div>
                <div className="kv"><span className="muted">Role</span><span>{device.kind}</span></div>
                <div className="kv"><span className="muted">Loopback</span><span>{device.loopback}</span></div>

                <div className="h2">BGP Peers</div>
                <table className="table">
                  <thead>
                    <tr><th>Peer</th><th>ASN</th><th>AFI</th><th>State</th></tr>
                  </thead>
                  <tbody>
                    {device.bgp.peers.length ? (
                      device.bgp.peers.map((p, idx) => (
                        <tr key={idx}>
                          <td>{p.peerIp}</td>
                          <td>{p.peerAsn}</td>
                          <td>{p.afi}</td>
                          <td>{p.state}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4} className="muted">—</td></tr>
                    )}
                  </tbody>
                </table>

                <div className="h2">路由（抽样）</div>
                <table className="table">
                  <thead>
                    <tr><th>Prefix</th><th>Proto</th><th>NH</th></tr>
                  </thead>
                  <tbody>
                    {device.routes.slice(0, 8).map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.prefix}</td>
                        <td>{r.protocol}</td>
                        <td>{r.nextHop}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : service ? (
              <>
                <div className="kv"><span className="muted">VRF</span><span>{service.vrf}</span></div>
                <div className="kv"><span className="muted">Policy</span><span>{service.policy}</span></div>
                <div className="kv"><span className="muted">Tunnels</span><span>{service.tunnels.join(', ')}</span></div>
                <div className="h2">分层说明</div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  IGP 负责底座可达性（Loopback/TE 节点），RR 汇聚 VPNv4 路由，MPLS/SR-TE 负责承载。
                  业务路径是“策略 + 路由 + 隧道 + 逐跳标签栈”的还原结果。
                </div>
              </>
            ) : tunnel ? (
              <>
                <div className="kv"><span className="muted">Status</span><span>{tunnel.status}</span></div>
                <div className="kv"><span className="muted">Labels</span><span>{tunnel.labels.length}</span></div>
                <div className="h2">提示</div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  这里展示的是“离散采样数据”的还原视图，后续可接入设备采集（Netconf/Telemetry/SNMP/CLI）。
                </div>
              </>
            ) : (
              <div className="muted">—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
