import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import { CAST_ORDER, avatarStyle, personaColor } from '../castConfig'
import { useEpisode } from '../hooks/useEpisode'

const W = 400, H = 250, NODE_R = 22

function useForceGraph(nodes, links) {
  const [positions, setPositions] = useState({})
  const simRef = useRef(null)

  useEffect(() => {
    // Stop any previous simulation
    if (simRef.current) simRef.current.stop()

    if (!nodes.length) return

    // Init in a circle so nodes never start on top of each other
    const simNodes = nodes.map((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2
      return { id: n, x: W / 2 + Math.cos(angle) * 90, y: H / 2 + Math.sin(angle) * 70 }
    })
    const simLinks = links.map((l) => ({ ...l }))

    const snap = () => {
      const pos = {}
      for (const n of simNodes) {
        pos[n.id] = {
          x: Math.max(NODE_R + 32, Math.min(W - NODE_R - 32, n.x)),
          y: Math.max(NODE_R + 12, Math.min(H - NODE_R - 14, n.y)),
        }
      }
      setPositions({ ...pos })
    }

    const sim = d3
      .forceSimulation(simNodes)
      .force('link', d3.forceLink(simLinks).id((d) => d.id).distance(110).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(NODE_R + 12))
      .alphaDecay(0.03)
      .on('end', snap) // single state update when settled

    // Show initial circle positions immediately, then snap when settled
    snap()

    simRef.current = sim
    return () => sim.stop()
  }, [nodes.length, links.length]) // re-run when cast/edge count changes

  return positions
}

export default function AllianceGraph() {
  const { edges, personas } = useEpisode()

  // Use CAST_ORDER for consistent node ordering
  const nodes = CAST_ORDER

  const links = edges.map((e) => ({
    source: e.a,
    target: e.b,
    weight: e.weight,
    type: e.type,
  }))

  const positions = useForceGraph(nodes, links)

  return (
    <div
      style={{
        background: 'var(--panel-bg)',
        border: 'var(--panel-border)',
        borderRadius: 'var(--panel-radius)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: 'var(--panel-header-border)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '.18em',
            color: 'var(--gold-text)',
          }}
        >
          Alliances
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink-muted)' }}>
          <span style={{ color: 'var(--gold-text-2)' }}>— ally</span>
          <span style={{ color: '#a3262b' }}>- - feud</span>
        </div>
      </div>

      <div style={{ position: 'relative', width: W, height: H, margin: '10px auto 14px' }}>
        {/* Edges */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        >
          {links.map((link, i) => {
            const s = positions[link.source]
            const t = positions[link.target]
            if (!s || !t) return null
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={link.type === 'ally' ? '#b48a35' : '#b2393f'}
                strokeWidth={Math.max(1, link.weight)}
                strokeDasharray={link.type === 'feud' ? '5 5' : undefined}
                strokeLinecap="round"
                opacity={0.85}
              />
            )
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((name) => {
          const pos = positions[name]
          if (!pos) return null
          const isIsolated = links.length > 0 && !links.some(
            (l) => l.source === name || l.target === name
          )
          return (
            <div
              key={name}
              style={{
                position: 'absolute',
                left: pos.x - 32,
                top: pos.y - 22,
                width: 64,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: '2px solid var(--gold-fill-2)',
                  backgroundColor: '#fff',
                  ...avatarStyle(name, 44),
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {name.split(' ')[0]}
              </div>
              {isIsolated && (
                <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                  no known ties
                </div>
              )}
            </div>
          )
        })}

        {/* Empty state */}
        {links.length === 0 && Object.keys(positions).length > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: 'var(--ink-muted)',
              pointerEvents: 'none',
            }}
          >
            Alliances form as the evening unfolds
          </div>
        )}
      </div>
    </div>
  )
}
