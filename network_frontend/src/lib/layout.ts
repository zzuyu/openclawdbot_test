import ELK from 'elkjs/lib/elk.bundled.js'

export type GraphNode = {
  id: string
  width?: number
  height?: number
  layer?: 'igp' | 'bgp' | 'access'
}

export type GraphEdge = {
  id: string
  sources: string[]
  targets: string[]
}

export type LayoutResult = {
  nodes: Record<string, { x: number; y: number; width: number; height: number }>
  edges: Array<{ id: string; points: Array<{ x: number; y: number }> }>
  width: number
  height: number
}

const elk = new ELK()

export async function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<LayoutResult> {
  const g = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '28',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width ?? 160,
      height: n.height ?? 56,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: e.sources,
      targets: e.targets,
    })),
  }

  // ELK types are not shipped; keep the boundary here explicit.
  type AnyRec = Record<string, unknown>
  const res = (await elk.layout(g as unknown as any)) as AnyRec
  const w = (res as AnyRec).width
  const h = (res as AnyRec).height
  const out: LayoutResult = {
    nodes: {},
    edges: [],
    width: typeof w === 'number' ? w : 1200,
    height: typeof h === 'number' ? h : 800,
  }

  const children = (res as AnyRec).children as unknown
  const edgesOut = (res as AnyRec).edges as unknown

  for (const c of (Array.isArray(children) ? children : []) as AnyRec[]) {
    out.nodes[c.id as string] = {
      x: typeof c.x === 'number' ? (c.x as number) : 0,
      y: typeof c.y === 'number' ? (c.y as number) : 0,
      width: typeof c.width === 'number' ? (c.width as number) : 160,
      height: typeof c.height === 'number' ? (c.height as number) : 56,
    }
  }

  for (const e of (Array.isArray(edgesOut) ? edgesOut : []) as AnyRec[]) {
    const secs = ((e.sections as unknown) as AnyRec[] | undefined)?.[0]
    const pts: Array<{ x: number; y: number }> = []
    if (secs) {
      const sp = (secs.startPoint as AnyRec) || {}
      const ep = (secs.endPoint as AnyRec) || {}
      pts.push({ x: (sp.x as number) ?? 0, y: (sp.y as number) ?? 0 })
      const bends = secs.bendPoints as unknown
      for (const bp of (Array.isArray(bends) ? bends : []) as AnyRec[]) {
        pts.push({ x: (bp.x as number) ?? 0, y: (bp.y as number) ?? 0 })
      }
      pts.push({ x: (ep.x as number) ?? 0, y: (ep.y as number) ?? 0 })
    }
    out.edges.push({ id: (e.id as string) ?? 'edge', points: pts })
  }

  return out
}
