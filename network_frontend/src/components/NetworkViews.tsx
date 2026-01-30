import { useMemo, useState } from 'react'
import type { NetworkSnapshot } from '../mock/network'
import TopologyView from './TopologyView'
import DeviceNeighborhoodView from './DeviceNeighborhoodView'

export default function NetworkViews({ snapshot }: { snapshot: NetworkSnapshot }) {
  const [section, setSection] = useState<'GLOBAL' | 'DEVICE'>('GLOBAL')
  const [globalTab, setGlobalTab] = useState<'PHYSICAL' | 'IGP' | 'TRANSPORT'>('PHYSICAL')

  const devices = useMemo(() => snapshot.devices.filter((d) => d.kind !== 'CE').slice(0, 400), [snapshot])
  const [deviceId, setDeviceId] = useState<string>(() => devices.find((d) => d.kind === 'PE')?.id || snapshot.devices[0]?.id)

  return (
    <>
      <div className="h2">视角</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className={`pill ${section === 'GLOBAL' ? 'treeItemActive' : ''}`} onClick={() => setSection('GLOBAL')}>整网拓扑</span>
        <span className={`pill ${section === 'DEVICE' ? 'treeItemActive' : ''}`} onClick={() => setSection('DEVICE')}>单设备周边</span>
      </div>

      {section === 'GLOBAL' ? (
        <>
          <div className="h2">整网 · 图层</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className={`pill ${globalTab === 'PHYSICAL' ? 'treeItemActive' : ''}`} onClick={() => setGlobalTab('PHYSICAL')}>物理拓扑</span>
            <span className={`pill ${globalTab === 'IGP' ? 'treeItemActive' : ''}`} onClick={() => setGlobalTab('IGP')}>IGP（OSPF/IS-IS）</span>
            <span className={`pill ${globalTab === 'TRANSPORT' ? 'treeItemActive' : ''}`} onClick={() => setGlobalTab('TRANSPORT')}>承载/隧道</span>
          </div>

          {globalTab === 'TRANSPORT' ? (
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              承载层（MPLS/LDP 与 SR-TE）图层下一步会做成 overlay：
              选中一条隧道/业务后，在整网拓扑上高亮承载链路与 label stack。
            </div>
          ) : (
            <TopologyView snapshot={snapshot} />
          )}
        </>
      ) : (
        <>
          <div className="h2">选择设备</div>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.role} · {d.igp.type}
              </option>
            ))}
          </select>
          <DeviceNeighborhoodView snapshot={snapshot} deviceId={deviceId} />
        </>
      )}
    </>
  )
}
