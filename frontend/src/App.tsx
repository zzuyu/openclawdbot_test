import { useEffect, useMemo, useRef, useState } from 'react'
import { connectWS, type ServerMsg } from './lib/ws'

type Player = { id: string; name: string; score: number }

type StateMsg = {
  roomId: string
  players: Player[]
  drawerId: string | null
  category: string
  phase: 'LOBBY' | 'IN_ROUND'
  round: { startedMs: number | null; endsMs: number | null; durationS: number }
}

type DrawEvt = {
  kind: 'stroke'
  points: { x: number; y: number }[]
  color: string
  size: number
}

function wsURL() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function maskedWord(w: string) {
  if (!w) return ''
  return w.replace(/./g, '▢')
}

export default function App() {
  const [phase, setPhase] = useState<'lobby' | 'room'>('lobby')
  const [toast, setToast] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('hanfeng')

  const [clientId, setClientId] = useState<string | null>(null)
  const [state, setState] = useState<StateMsg | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [word, setWord] = useState('')
  const [chat, setChat] = useState<{ system?: boolean; name?: string; text: string }[]>([])

  const [color, setColor] = useState('#e5e7eb')
  const [size, setSize] = useState(5)

  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const isDrawer = useMemo(() => {
    if (!state || !clientId) return false
    return state.drawerId === clientId
  }, [state, clientId])

  const roundLeft = useMemo(() => {
    if (!state?.round.startedMs) return null
    const end = state.round.endsMs ?? state.round.startedMs + state.round.durationS * 1000
    return Math.max(0, end - Date.now())
  }, [state?.round.startedMs, state?.round.endsMs, state?.round.durationS])

  useEffect(() => {
    const t = setInterval(() => {
      // force re-render for timer
      if (state?.round.startedMs) setState((s) => (s ? { ...s } : s))
    }, 250)
    return () => clearInterval(t)
  }, [state?.round.startedMs])

  useEffect(() => {
    // fetch wordbank categories
    fetch('/api/wordbank')
      .then((r) => r.json())
      .then((d) => {
        const cats = Object.keys(d.categories || {})
        setCategories(cats)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  function addChat(line: { system?: boolean; name?: string; text: string }) {
    setChat((c) => [...c.slice(-150), line])
  }

  function send(type: string, data?: any) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type, data }))
  }

  function ensureCanvasDPR() {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.floor(rect.width * dpr))
    const h = Math.max(1, Math.floor(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      const ctx = canvas.getContext('2d')!
      // keep content when resizing (simple: clear)
      canvas.width = w
      canvas.height = h
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      clearCanvas()
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // light paper texture lines
    ctx.save()
    ctx.globalAlpha = 0.06
    ctx.strokeStyle = '#1f2937'
    for (let y = 24; y < canvas.height; y += 28) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  function drawStroke(evt: DrawEvt) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = evt.color
    ctx.lineWidth = evt.size * (window.devicePixelRatio || 1)
    const pts = evt.points
    if (!pts || pts.length < 2) return

    ctx.beginPath()
    ctx.moveTo(pts[0].x * canvas.width, pts[0].y * canvas.height)
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * canvas.width, pts[i].y * canvas.height)
    }
    ctx.stroke()
  }

  useEffect(() => {
    ensureCanvasDPR()
    window.addEventListener('resize', ensureCanvasDPR)
    return () => window.removeEventListener('resize', ensureCanvasDPR)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function join() {
    if (!name.trim()) {
      addChat({ system: true, text: '先起个名字。不然系统只能叫你“无名氏”，太掉价。' })
      return
    }

    const ws = connectWS(wsURL(), onServerMsg)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', data: { name: name.trim(), roomId: roomId.trim() } }))
      setPhase('room')
      setChat([])
      setWord('')
      clearCanvas()
    }

    ws.onclose = () => {
      addChat({ system: true, text: '连接断了。不是你的错，可能是我在后台摸鱼。' })
      setClientId(null)
      setState(null)
      setWord('')
    }
  }

  function onServerMsg(m: ServerMsg) {
    if (m.type === 'joined') {
      setClientId(m.data.clientId)
    } else if (m.type === 'state') {
      setState(m.data)
    } else if (m.type === 'word') {
      setWord(m.data.word || '')
    } else if (m.type === 'chat') {
      addChat({ system: !!m.data.system, name: m.data.name, text: m.data.text })
    } else if (m.type === 'draw') {
      drawStroke(m.data as DrawEvt)
    } else if (m.type === 'drawReplay') {
      ;(m.data.events as DrawEvt[]).forEach((e) => drawStroke(e))
    } else if (m.type === 'clear') {
      clearCanvas()
    } else if (m.type === 'roundOver') {
      addChat({ system: true, text: `本轮结束，答案：${m.data.word}` })
      setWord('')
    } else if (m.type === 'error') {
      addChat({ system: true, text: `后端说：${m.data.message}` })
    }
  }

  function pointerPos(ev: PointerEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = clamp((ev.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((ev.clientY - rect.top) / rect.height, 0, 1)
    return { x, y }
  }

  function onPointerDown(ev: React.PointerEvent) {
    if (!isDrawer) return
    if (!state?.round.startedMs) return
    drawing.current = true
    lastPoint.current = pointerPos(ev.nativeEvent)
    ;(ev.target as HTMLElement).setPointerCapture(ev.pointerId)
  }

  function onPointerMove(ev: React.PointerEvent) {
    if (!drawing.current) return
    const p = pointerPos(ev.nativeEvent)
    const prev = lastPoint.current
    if (!prev) {
      lastPoint.current = p
      return
    }
    lastPoint.current = p

    const evt: DrawEvt = { kind: 'stroke', points: [prev, p], color, size }
    drawStroke(evt)
    send('draw', evt)
  }

  function onPointerUp() {
    drawing.current = false
    lastPoint.current = null
  }

  const [guess, setGuess] = useState('')
  const solo = (state?.players?.length || 0) === 1
  const canSendGuess = !isDrawer || solo
  function sendGuess() {
    const t = guess.trim()
    if (!t) return
    send('chat', { text: t })
    setGuess('')
  }

  const prettyWord = useMemo(() => {
    if (!state?.round.startedMs) return '等待开局'
    if (isDrawer) return `题目：${word || '…'}`
    // viewers get masked word from server; still mask to be safe.
    return `题目：${maskedWord(word)}`
  }, [isDrawer, word, state?.round.startedMs])

  const phaseLabel = useMemo(() => {
    if (!state) return 'OFFLINE'
    return state.round.startedMs ? 'IN ROUND' : 'LOBBY'
  }, [state])

  const drawerName = useMemo(() => {
    if (!state?.drawerId) return '—'
    return state.players.find((p) => p.id === state.drawerId)?.name || '—'
  }, [state])

  const mmss = (ms: number | null) => {
    if (ms == null) return '--:--'
    const s = Math.max(0, Math.ceil(ms / 1000))
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <div className="title">
            <span>你画我猜</span>
            <span className="badge">墨 · 白</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {state ? `${state.players.length} 人在线` : '未连接'}
          </div>
        </div>

        {toast ? <div className="toast">{toast}</div> : null}

        <div className="hud">
          <div className="hudLeft">
            <div className="hudTitle">{state?.roomId || roomId}</div>
            <div className="hudMeta">
              <span className="hudPill">{phaseLabel}</span>
              <span className="hudPill">分类：{state?.category || '默认'}</span>
              <span className="hudPill">画手：{drawerName}</span>
            </div>
          </div>
          <div className="hudRight">
            <div className="hudTimer">{mmss(roundLeft)}</div>
            <div className="hudSub">{state ? `${state.players.length} ONLINE` : '—'}</div>
          </div>
        </div>

        {phase === 'lobby' ? (
          <div className="lobbyWrap">
            <div className="panel lobbyPanel">
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, letterSpacing: '.08em' }}>开局</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  单人可自练，多人自动轮换画手。
                </div>
              </div>

              <div className="row">
                <div style={{ flex: 1 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    昵称
                  </div>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="比如：诸葛亮" />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    房间号
                  </div>
                  <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="比如：hanfeng" />
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    开始
                  </div>
                  <button className="primary" onClick={join}>
                    进房
                  </button>
                </div>
              </div>
              <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                进入房间后开始一局即可开打：系统自动轮换画手，题库支持分类与上传。
              </div>
            </div>
          </div>
        ) : (
          <div className="grid">
            <div className="panel">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14 }}>{prettyWord}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    你是：{isDrawer ? '画师' : '猜测者'}
                    {roundLeft != null ? ` · 剩余 ${(roundLeft / 1000).toFixed(0)}s` : ''}
                    {state?.category ? ` · 分类：${state.category}` : ''}
                  </div>
                </div>

                <div className="row">
                  <button onClick={() => send(state?.round.startedMs ? 'skipRound' : 'startRound')} className="primary">
                    {state?.round.startedMs ? '跳过本轮' : '开局'}
                  </button>
                  <button onClick={() => send('clear')} className="danger">
                    清屏
                  </button>
                </div>
              </div>

              <div className="row" style={{ marginBottom: 10, gap: 10 }}>
                <label className="muted" style={{ fontSize: 12 }}>题库分类</label>
                <select
                  value={state?.category || '默认'}
                  onChange={(e) => send('setCategory', { category: e.target.value })}
                  style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(31,41,55,.10)', background: 'rgba(255,255,255,.65)' }}
                >
                  {(categories.length ? categories : ['默认']).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <input
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    try {
                      const text = await f.text()
                      const payload = JSON.parse(text)
                      const r = await fetch('/api/wordbank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                      const d = await r.json()
                      if (d.ok) {
                        const wb = await (await fetch('/api/wordbank')).json()
                        setCategories(Object.keys(wb.categories || {}))
                        setToast(`题库已更新：${Object.keys(wb.categories || {}).join('、')}`)
                        addChat({ system: true, text: `题库已更新：${Object.keys(wb.categories || {}).join('、')}` })
                      } else {
                        setToast('题库更新失败')
                        addChat({ system: true, text: '题库更新失败。' })
                      }
                    } catch {
                      setToast('文件不是合法 JSON')
                      addChat({ system: true, text: '文件不是合法 JSON。' })
                    }
                  }}
                />
              </div>

              <div className="row" style={{ marginBottom: 10, gap: 12 }}>
                <label className="muted" style={{ fontSize: 12 }}>
                  墨色
                </label>
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={!isDrawer}
                  style={{ width: 140 }}
                >
                  <option value="#ffffff">雪白</option>
                  <option value="#e5e7eb">雾白</option>
                  <option value="#9ca3af">烟灰</option>
                  <option value="#111827">墨黑</option>
                </select>
                <label className="muted" style={{ fontSize: 12 }}>
                  笔触
                </label>
                <input
                  type="range"
                  min={2}
                  max={18}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  disabled={!isDrawer}
                />
                <span className="muted" style={{ fontSize: 12, width: 26 }}>
                  {size}
                </span>
              </div>

              <div className="canvasWrap">
                <canvas
                  ref={canvasRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              </div>

              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                规则很朴素：猜中 +10 分。画师别用文字提示，不然我就把你拉去写单元测试。
              </div>
            </div>

            <div className="panel">
              <div style={{ marginBottom: 10 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  玩家
                </div>
                <div>
                  {state?.players
                    ?.slice()
                    .sort((a, b) => b.score - a.score)
                    .map((p) => (
                      <div key={p.id} className="kv">
                        <span>
                          {p.name}
                          {state.drawerId === p.id ? '（画）' : ''}
                        </span>
                        <span>{p.score}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                聊天 / 猜词
              </div>
              <div className="chat">
                {chat.map((c, i) => (
                  <div key={i} className={`chatLine ${c.system ? 'chatSystem' : ''}`}>
                    {c.system ? (
                      <span>{c.text}</span>
                    ) : (
                      <span>
                        <b>{c.name}</b>：{c.text}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <input
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder={canSendGuess ? (solo ? '自练：输入答案推进下一轮' : '输入你的猜测，比如：熊猫') : '你是画师：专心画，别用嘴泄题'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendGuess()
                  }}
                  disabled={!canSendGuess}
                />
                <button className="primary" onClick={sendGuess} disabled={!canSendGuess}>
                  发送
                </button>
              </div>

              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                房间：{state?.roomId || roomId}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
