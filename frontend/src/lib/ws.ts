export type ServerMsg = { type: string; data: any }

export type ClientMsg = { type: string; data?: any }

export function connectWS(url: string, onMsg: (m: ServerMsg) => void) {
  const ws = new WebSocket(url)
  ws.onmessage = (ev) => {
    try {
      onMsg(JSON.parse(ev.data))
    } catch {
      // ignore
    }
  }
  return ws
}
