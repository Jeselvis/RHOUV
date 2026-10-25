import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '../components/Header'
import { useEpisode } from '../hooks/useEpisode'
import {
  CAST_ORDER,
  FIRST_NAME_MAP,
  avatarStyle,
  brandTier,
  composureState,
  personaColor,
} from '../castConfig'

// ─── Generic D3 SVG chart wrapper ──────────────────────────────────────────

function D3Chart({ draw, data, width = 400, height = 150, style = {} }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current || !data) return
    const cleanup = draw(svgRef.current, data, width, height)
    return cleanup ?? undefined
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', ...style }}
    />
  )
}

// ─── Chart draw functions ──────────────────────────────────────────────────

function drawBrandOverTime(svg, data, W, H) {
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const PAD = { top: 8, right: 52, bottom: 12, left: 32 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const run = data[0]
  const allPoints = Object.values(run.brand_over_time).flat()
  if (!allPoints.length) {
    el.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#556173').text('No brand data in this episode')
    return
  }

  const xMax = d3.max(allPoints, (d) => d.idx) ?? 1
  const yMin = Math.min(d3.min(allPoints, (d) => d.score) - 5, 95)
  const yMax = Math.max(d3.max(allPoints, (d) => d.score) + 5, 105)
  const xScale = d3.scaleLinear([0, xMax], [0, iW])
  const yScale = d3.scaleLinear([yMin, yMax], [iH, 0])

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  // Baseline at 100
  g.append('line').attr('x1', 0).attr('y1', yScale(100)).attr('x2', iW).attr('y2', yScale(100))
    .attr('stroke', 'rgba(27,35,48,.15)').attr('stroke-width', 1).attr('stroke-dasharray', '3 3')
  g.append('text').attr('x', -4).attr('y', yScale(100) + 4)
    .attr('text-anchor', 'end').attr('font-size', 9).attr('fill', 'rgba(27,35,48,.4)').text('100')

  // Axis
  g.append('line').attr('x1', 0).attr('y1', iH).attr('x2', iW).attr('y2', iH)
    .attr('stroke', 'rgba(27,35,48,.25)').attr('stroke-width', 1)

  // Lines per persona + end label
  for (const [name, points] of Object.entries(run.brand_over_time)) {
    if (!points.length) continue
    const withStart = points[0]?.idx === 0 ? points : [{ idx: 0, score: 100 }, ...points]
    const line = d3.line().x((d) => xScale(d.idx)).y((d) => yScale(d.score)).curve(d3.curveMonotoneX)
    const color = personaColor(name)
    g.append('path').datum(withStart)
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('d', line)
    // End-of-line label
    const last = withStart[withStart.length - 1]
    g.append('text')
      .attr('x', xScale(last.idx) + 4).attr('y', yScale(last.score) + 4)
      .attr('font-size', 9).attr('fill', color).attr('font-weight', 600)
      .text(name.split(' ')[0])
  }
}

function drawFinalBrand(svg, data, W, H) {
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const PAD = { top: 8, right: 8, bottom: 20, left: 8 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const names = data[0]?.activeNames ?? CAST_ORDER
  const barW = Math.floor(iW / names.length) - 4
  const scores = names.map((n) => data[0]?.final_brand?.[n] ?? 100)
  const yMax = d3.max(scores) * 1.1 || 120
  const yScale = d3.scaleLinear([0, yMax], [iH, 0])

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  g.append('line').attr('x1', 0).attr('y1', iH).attr('x2', iW).attr('y2', iH)
    .attr('stroke', 'rgba(27,35,48,.25)').attr('stroke-width', 1)

  names.forEach((name, i) => {
    const x = i * (barW + 4) + 4
    const score = data[0]?.final_brand?.[name] ?? 100
    const h = iH - yScale(score)
    g.append('rect')
      .attr('x', x).attr('y', yScale(score)).attr('width', barW).attr('height', h)
      .attr('fill', personaColor(name))
    g.append('text')
      .attr('x', x + barW / 2).attr('y', iH + 14)
      .attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#3d4a5a')
      .text(name.split(' ')[0].slice(0, 3))
  })
}

function drawComposureTrajectory(svg, data, W, H) {
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const PAD = { top: 8, right: 50, bottom: 8, left: 8 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const run = data[0]
  // Seed with start points so the scale always includes 100 even if no drops yet
  const allPoints = Object.values(run.composure_over_time).flat()
  const yMin = allPoints.length ? Math.max(0, (d3.min(allPoints, (d) => d.value) ?? 100) - 8) : 0
  const yScale = d3.scaleLinear([yMin, 100], [iH, 0])

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  // Threshold bands — only draw bands that fall within the visible y range
  const bands = [
    { y1: 70, y2: 100, color: 'rgba(42,67,166,.07)',  label: 'normal' },
    { y1: 45, y2: 70,  color: 'rgba(180,138,53,.1)',  label: 'irritated' },
    { y1: 20, y2: 45,  color: 'rgba(204,110,50,.12)', label: 'slipping' },
    { y1: 0,  y2: 20,  color: 'rgba(178,50,50,.12)',  label: 'gone' },
  ]
  for (const b of bands) {
    const visY1 = Math.max(b.y1, yMin)
    const visY2 = Math.min(b.y2, 100)
    if (visY1 >= visY2) continue
    g.append('rect')
      .attr('x', 0).attr('y', yScale(visY2))
      .attr('width', iW).attr('height', yScale(visY1) - yScale(visY2))
      .attr('fill', b.color)
    // Only label if band has enough height to be legible
    if (yScale(visY1) - yScale(visY2) > 12) {
      g.append('text')
        .attr('x', iW + 4).attr('y', yScale((visY1 + visY2) / 2) + 4)
        .attr('font-size', 9).attr('fill', '#556173').text(b.label)
    }
  }

  if (!allPoints.length) return
  const xMax = d3.max(allPoints, (d) => d.idx) ?? 1
  const xScale = d3.scaleLinear([0, xMax], [0, iW])

  for (const [name, points] of Object.entries(run.composure_over_time)) {
    if (!points.length) continue
    const withStart = points[0]?.idx === 0 ? points : [{ idx: 0, value: 100 }, ...points]
    const line = d3.line().x((d) => xScale(d.idx)).y((d) => yScale(d.value)).curve(d3.curveMonotoneX)
    g.append('path').datum(withStart)
      .attr('fill', 'none')
      .attr('stroke', personaColor(name))
      .attr('stroke-width', 2)
      .attr('d', line)
  }
}

function drawBreakdownHistogram(svg, data, W, H) {
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const PAD = { top: 8, right: 8, bottom: 20, left: 8 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)
  g.append('line').attr('x1', 0).attr('y1', iH).attr('x2', iW).attr('y2', iH)
    .attr('stroke', 'rgba(27,35,48,.25)').attr('stroke-width', 1)

  const total = data[0]?.total ?? 1
  const breakdowns = Object.entries(data[0]?.first_breakdown ?? {})
    .filter(([, idx]) => idx !== null)
    .map(([name, idx]) => ({ name, idx }))

  if (!breakdowns.length) {
    g.append('text').attr('x', iW / 2).attr('y', iH / 2).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#556173').text('No breakdowns in this run')
    return
  }

  const xScale = d3.scaleLinear([0, total], [0, iW])
  const barH = iH / (breakdowns.length + 1)

  breakdowns.forEach(({ name, idx }, i) => {
    const y = i * (barH + 2) + 2
    g.append('rect').attr('x', 0).attr('y', y)
      .attr('width', xScale(idx)).attr('height', barH - 2)
      .attr('fill', personaColor(name))
    g.append('text').attr('x', xScale(idx) + 3).attr('y', y + barH / 2 + 4)
      .attr('font-size', 9).attr('fill', '#3d4a5a').text(name.split(' ')[0])
  })

  g.append('text').attr('x', 0).attr('y', iH + 14).attr('font-size', 9).attr('fill', '#3d4a5a').text('event 0')
  g.append('text').attr('x', iW).attr('y', iH + 14).attr('text-anchor', 'end').attr('font-size', 9).attr('fill', '#3d4a5a').text(`event ${total}`)
}

function drawEventMix(svg, data, W, H) {
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const PAD = { top: 8, right: 8, bottom: 8, left: 8 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  const COLORS = {
    table_talk: '#9fb3c8',
    confessional: '#2a43a6',
    twist: '#c9a24e',
    interrupt: '#b2393f',
  }
  const keys = ['table_talk', 'confessional', 'twist', 'interrupt']

  // Show all runs as stacked bars side by side
  const barW = data.length > 0 ? Math.max(20, iW / data.length - 4) : iW
  const maxTotal = d3.max(data, (r) => Object.values(r.event_counts).reduce((a, b) => a + b, 0)) || 1

  data.forEach((run, ri) => {
    const x = ri * (barW + 4)
    const total = Object.values(run.event_counts).reduce((a, b) => a + b, 0) || 1
    let y = iH
    for (const key of keys) {
      const count = run.event_counts[key] ?? 0
      const h = (count / total) * iH
      y -= h
      g.append('rect').attr('x', x).attr('y', y).attr('width', barW).attr('height', h)
        .attr('fill', COLORS[key])
    }
  })
}

function drawTwistImpact(svg, data, W, H) {
  const el = d3.select(svg)
  el.selectAll('*').remove()

  if (!data.length || !data[0].twists?.length) {
    el.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#556173').text('No twist events in current episodes')
    return
  }

  // Brand trajectories from run[0] with twist positions overlaid as vertical markers.
  // Answers: do lines change slope/direction at twist moments?
  const PAD = { top: 8, right: 52, bottom: 12, left: 32 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const run = data[0]
  const allPoints = Object.values(run.brand_over_time).flat()

  if (!allPoints.length) {
    el.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#556173').text('No brand data yet')
    return
  }

  const xMax = d3.max(allPoints, (d) => d.idx) ?? 1
  const yMin = Math.min(d3.min(allPoints, (d) => d.score) - 5, 95)
  const yMax = Math.max(d3.max(allPoints, (d) => d.score) + 5, 105)
  const xScale = d3.scaleLinear([0, xMax], [0, iW])
  const yScale = d3.scaleLinear([yMin, yMax], [iH, 0])

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  // Baseline
  g.append('line').attr('x1', 0).attr('y1', yScale(100)).attr('x2', iW).attr('y2', yScale(100))
    .attr('stroke', 'rgba(27,35,48,.15)').attr('stroke-width', 1).attr('stroke-dasharray', '3 3')
  g.append('text').attr('x', -4).attr('y', yScale(100) + 4)
    .attr('text-anchor', 'end').attr('font-size', 9).attr('fill', 'rgba(27,35,48,.4)').text('100')

  // Twist markers — gold verticals
  for (const { idx } of run.twists) {
    const x = xScale(idx)
    g.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', iH)
      .attr('stroke', '#c9a24e').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3').attr('opacity', 0.8)
    g.append('text').attr('x', x + 3).attr('y', 9)
      .attr('font-size', 8).attr('fill', '#a87f2f').text('twist')
  }

  // Brand lines + end labels
  for (const [name, points] of Object.entries(run.brand_over_time)) {
    if (!points.length) continue
    const withStart = points[0]?.idx === 0 ? points : [{ idx: 0, score: 100 }, ...points]
    const line = d3.line().x((d) => xScale(d.idx)).y((d) => yScale(d.score)).curve(d3.curveMonotoneX)
    const color = personaColor(name)
    g.append('path').datum(withStart)
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('d', line)
    const last = withStart[withStart.length - 1]
    g.append('text').attr('x', xScale(last.idx) + 4).attr('y', yScale(last.score) + 4)
      .attr('font-size', 9).attr('fill', color).attr('font-weight', 600).text(name.split(' ')[0])
  }

  // X axis
  g.append('line').attr('x1', 0).attr('y1', iH).attr('x2', iW).attr('y2', iH)
    .attr('stroke', 'rgba(27,35,48,.25)').attr('stroke-width', 1)
}

function drawAllianceHeatmap(svg, data, W, H) {
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const names = data[0]?.activeNames ?? CAST_ORDER
  const PAD = { top: 16, right: 8, bottom: 28, left: 60 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom
  const cellW = Math.floor(iW / names.length)
  const cellH = Math.floor(iH / names.length)

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  // Aggregate weights across all runs
  const weights = {}
  for (const run of data) {
    for (const [key, w] of Object.entries(run.alliance_weights ?? {})) {
      weights[key] = (weights[key] ?? 0) + w
    }
  }
  const maxW = d3.max(Object.values(weights)) || 1

  names.forEach((rowName, ri) => {
    // Row label
    el.append('text')
      .attr('x', PAD.left - 4).attr('y', PAD.top + ri * cellH + cellH / 2 + 4)
      .attr('text-anchor', 'end').attr('font-size', 9).attr('fill', '#3d4a5a')
      .text(rowName.split(' ')[0].slice(0, 3))

    names.forEach((colName, ci) => {
      const key = [rowName, colName].sort().join('|')
      const opacity = ri === ci ? 1 : (weights[key] ?? 0) / maxW
      g.append('rect')
        .attr('x', ci * cellW).attr('y', ri * cellH)
        .attr('width', cellW - 2).attr('height', cellH - 2)
        .attr('rx', 2)
        .attr('fill', ri === ci ? '#d9dee4' : '#a87f2f')
        .attr('fill-opacity', ri === ci ? 1 : opacity)
    })
  })

  // Column labels
  names.forEach((name, ci) => {
    el.append('text')
      .attr('x', PAD.left + ci * cellW + cellW / 2)
      .attr('y', PAD.top + iH + 14)
      .attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#3d4a5a')
      .text(name.split(' ')[0].slice(0, 3))
  })
}

function drawInCharacterScatter(svg, data, W, H) {
  const el = d3.select(svg)
  el.selectAll('*').remove()
  // Y-axis ("in-character score") requires an LLM critic pass over the transcript.
  // No fake data — render a clear placeholder until that eval exists.
  el.append('text').attr('x', W / 2).attr('y', H / 2 - 10).attr('text-anchor', 'middle')
    .attr('font-size', 12).attr('fill', '#556173').text('Needs LLM critic pass')
  el.append('text').attr('x', W / 2).attr('y', H / 2 + 8).attr('text-anchor', 'middle')
    .attr('font-size', 10).attr('fill', '#9aa7b4')
    .text('X: composure  ·  Y: in-character score (not yet scored)')
}

// ─── Control components ────────────────────────────────────────────────────

function Toggle({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: '#3d4a5a',
        }}
      >
        {label}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: 0,
          cursor: 'pointer',
          position: 'relative',
          background: value ? '#b48a35' : 'rgba(27,35,48,.2)',
          transition: 'background .2s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: value ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,.3)',
            transition: 'left .2s',
          }}
        />
      </button>
    </div>
  )
}

function ChartCard({ title, question, children, optional = false, dashed = false }) {
  return (
    <div
      style={{
        background: 'var(--panel-bg)',
        border: dashed
          ? '1px dashed rgba(160,124,52,.5)'
          : 'var(--panel-border)',
        borderRadius: 'var(--panel-radius)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '.08em',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{question}</div>
        </div>
        {optional && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--gold-text)',
              border: '1px solid rgba(160,124,52,.5)',
              padding: '3px 6px',
              borderRadius: 2,
              flexShrink: 0,
            }}
          >
            Optional · LLM critic
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Token cost table ──────────────────────────────────────────────────────

function CostTable({ data, loading, error, onRefresh }) {
  const [inputPrice, setInputPrice] = useState(0.25)   // $/M tokens
  const [outputPrice, setOutputPrice] = useState(1.25) // $/M tokens

  const hasAny = data.some((r) => r.run_meta)

  const fmt = (n) => (n ?? 0).toLocaleString()
  const cost = (prompt, completion) =>
    ((prompt / 1e6) * inputPrice + (completion / 1e6) * outputPrice).toFixed(4)

  return (
    <ChartCard
      title="Token usage & cost"
      question="How much did each run spend? Prices default to Claude Haiku 3 via Anthropic."
    >
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {loading && (
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Loading…</span>
        )}
        {error && (
          <span style={{ fontSize: 12, color: '#a3262b' }}>API unavailable — is the server running?</span>
        )}
        {!loading && !error && !data.length && (
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>No episodes found.</span>
        )}
        {!loading && !error && data.length > 0 && !hasAny && (
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            Existing episodes predate token tracking — film a new one to see costs.
          </span>
        )}
        <button
          onClick={onRefresh}
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.1em',
            padding: '4px 10px',
            border: '1px solid rgba(160,124,52,.4)',
            borderRadius: 3,
            background: 'transparent',
            color: '#3d4a5a',
            cursor: 'pointer',
          }}
        >
          Refresh episodes
        </button>
      </div>

      {/* Price inputs */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { label: 'Input $/M', value: inputPrice, set: setInputPrice },
          { label: 'Output $/M', value: outputPrice, set: setOutputPrice },
        ].map(({ label, value, set }) => (
          <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3d4a5a' }}>
            {label}
            <input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => set(parseFloat(e.target.value) || 0)}
              style={{
                width: 70,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                padding: '4px 6px',
                background: '#fff',
                border: '1px solid rgba(160,124,52,.35)',
                borderRadius: 3,
              }}
            />
          </label>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(160,124,52,.3)' }}>
              {['Run', 'Personality model', 'Cast', 'Input tok', 'Output tok', 'Total tok', 'Est. cost'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '5px 8px',
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: '#3d4a5a',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((run, i) => {
              const meta = run.run_meta
              const tok = meta?.tokens
              const model = meta?.models?.personality ?? '—'
              const shortModel = model.replace(/^openai\/~anthropic\//, '').replace(/^openai\//, '')
              const castSize = meta?.cast_size ?? '—'
              return (
                <tr
                  key={run.file}
                  style={{ borderBottom: '1px solid rgba(27,35,48,.08)', background: i % 2 ? 'rgba(255,255,255,.4)' : 'transparent' }}
                >
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3d4a5a', whiteSpace: 'nowrap' }}>
                    Episode {i + 1}
                  </td>
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {tok ? shortModel : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{castSize}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {tok ? fmt(tok.prompt) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {tok ? fmt(tok.completion) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>
                    {tok ? fmt(tok.total) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gold-text)' }}>
                    {tok ? `$${cost(tok.prompt, tok.completion)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function EvalPage() {
  const { runs, personas, mode, refreshRuns } = useEpisode()
  const [castOn, setCastOn] = useState(
    Object.fromEntries(CAST_ORDER.map((n) => [n, true]))
  )
  const [twists, setTwists] = useState('frequent')
  const [interrupts, setInterrupts] = useState(true)
  const [wine, setWine] = useState(true)
  const [insultWeight, setInsultWeight] = useState(1.4)
  const [thresholds, setThresholds] = useState([70, 45, 20])
  const [confirming, setConfirming] = useState(false)
  const [summaryData, setSummaryData] = useState(null) // null = not yet loaded
  const [summaryError, setSummaryError] = useState(false)

  // Load eval summary on mount / when runs change
  useEffect(() => {
    if (!runs.length) return
    setSummaryError(false)
    fetch(`/api/eval/summary?runs=${runs.join(',')}`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then((d) => { if (Array.isArray(d)) setSummaryData(d) })
      .catch(() => setSummaryError(true))
  }, [runs.join(',')])

  const activeRuns = summaryData ?? []

  // Filter per-persona data to only include toggled-on cast members.
  // activeNames is passed into charts so they resize grids/axes accordingly.
  const filteredRuns = useMemo(() => {
    const activeNames = CAST_ORDER.filter((n) => castOn[n])
    return activeRuns.map((run) => ({
      ...run,
      activeNames,
      brand_over_time: Object.fromEntries(
        Object.entries(run.brand_over_time ?? {}).filter(([n]) => castOn[n])
      ),
      composure_over_time: Object.fromEntries(
        Object.entries(run.composure_over_time ?? {}).filter(([n]) => castOn[n])
      ),
      final_brand: Object.fromEntries(
        Object.entries(run.final_brand ?? {}).filter(([n]) => castOn[n])
      ),
      first_breakdown: Object.fromEntries(
        Object.entries(run.first_breakdown ?? {}).filter(([n]) => castOn[n])
      ),
    }))
  }, [activeRuns, castOn])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,var(--bg-grad-start) 0%,var(--bg-grad-end) 100%)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--screen-shadow)',
      }}
    >
      <Header />

      {/* Comparing summary line */}
      <div
        style={{
          padding: '10px 32px',
          borderBottom: '1px solid rgba(160,124,52,.15)',
          fontSize: 13,
          color: '#3d4a5a',
        }}
      >
        Comparing <strong>{activeRuns.length} runs</strong> in{' '}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>runs/</span>
      </div>

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '320px minmax(0,1fr)',
        }}
      >
        {/* ── Left column: controls ── */}
        <div
          style={{
            borderRight: '1px solid rgba(160,124,52,.3)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            background: 'rgba(255,255,255,.35)',
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
            Switches
          </div>

          {/* Cast toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: '#3d4a5a',
              }}
            >
              Cast
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: 6,
              }}
            >
              {CAST_ORDER.map((name) => {
                const on = castOn[name]
                return (
                  <button
                    key={name}
                    onClick={() => setCastOn((s) => ({ ...s, [name]: !on }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 6px 4px 4px',
                      borderRadius: 20,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      border: `1px solid ${on ? '#c79a3e' : 'rgba(27,35,48,.2)'}`,
                      background: on ? '#fff' : 'transparent',
                      color: on ? '#1b2330' : '#556173',
                      opacity: on ? 1 : 0.6,
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        flexShrink: 0,
                        border: `2px solid ${personaColor(name)}`,
                        backgroundColor: '#fff',
                        display: 'inline-block',
                        ...avatarStyle(name, 18),
                      }}
                    />
                    {name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Twists segmented */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: '#3d4a5a',
              }}
            >
              Twists
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                background: 'rgba(255,255,255,.55)',
                border: '1px solid rgba(160,124,52,.35)',
                borderRadius: 3,
                padding: 3,
              }}
            >
              {['off', 'rare', 'frequent'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTwists(opt)}
                  style={{
                    border: 0,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '7px 0',
                    borderRadius: 2,
                    background: twists === opt ? '#1b2330' : 'transparent',
                    color: twists === opt ? '#f1dc9b' : '#3d4a5a',
                    textTransform: 'capitalize',
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Interrupt + Wine toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Toggle label="Interrupts" value={interrupts} onChange={setInterrupts} />
            <Toggle label="Wine" value={wine} onChange={setWine} />
          </div>

          {/* Insult weight slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: '#3d4a5a',
                }}
              >
                Insult weight
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {insultWeight.toFixed(1)}×
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={insultWeight}
              onChange={(e) => setInsultWeight(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#b48a35' }}
            />
          </div>

          {/* Composure thresholds */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: '#3d4a5a',
              }}
            >
              Composure thresholds
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {['irritated', 'slipping', 'gone'].map((label, i) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 10, color: '#556173' }}>{label}</div>
                  <input
                    type="number"
                    value={thresholds[i]}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      setThresholds((t) => {
                        const n = [...t]
                        n[i] = v
                        return n
                      })
                    }}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      background: '#fff',
                      border: '1px solid rgba(160,124,52,.35)',
                      borderRadius: 3,
                      padding: '6px 8px',
                      width: '100%',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Seeds + N */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.45 }}>
              <strong style={{ color: '#3d4a5a' }}>Seeds</strong> fix the random state so the same episode can be re-run exactly.{' '}
              <strong style={{ color: '#3d4a5a' }}>N per setting</strong> runs that many episodes per switch combination — more episodes = more reliable averages.
            </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Seeds', placeholder: '1–24' },
              { label: 'N per setting', placeholder: '24' },
            ].map(({ label, placeholder }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: '#3d4a5a',
                  }}
                >
                  {label}
                </div>
                <input
                  type="text"
                  placeholder={placeholder}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    background: '#fff',
                    border: '1px solid rgba(160,124,52,.35)',
                    borderRadius: 3,
                    padding: '6px 8px',
                    width: '100%',
                  }}
                />
              </div>
            ))}
          </div>
          </div>

          {/* Film episode */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              borderTop: '1px solid rgba(160,124,52,.3)',
              paddingTop: 18,
            }}
          >
            <div style={{ fontSize: 12, color: '#3d4a5a', lineHeight: 1.4 }}>
              Switches filter saved episodes. Only <strong>Film Episode</strong> spends tokens.
            </div>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                disabled={mode === 'live'}
                title={mode === 'live' ? 'Episode already filming' : undefined}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: '.14em',
                  color: 'var(--gold-btn-text)',
                  background: 'var(--gold-btn-grad)',
                  border: '1px solid var(--gold-border)',
                  borderRadius: 3,
                  padding: '13px 0',
                  cursor: mode === 'live' ? 'default' : 'pointer',
                  opacity: mode === 'live' ? 0.5 : 1,
                }}
              >
                {mode === 'live' ? 'Filming…' : 'Film Episode (new run)'}
              </button>
            ) : (
              <div
                style={{
                  background: '#1b2330',
                  color: '#e8edf2',
                  borderRadius: 4,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                  Configure seeds &amp; N first.{' '}
                  <strong style={{ color: '#f1dc9b' }}>Cost shown on confirm.</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    onClick={() => setConfirming(false)}
                    style={{
                      border: '1px solid rgba(255,255,255,.3)',
                      background: 'transparent',
                      color: '#e8edf2',
                      borderRadius: 3,
                      padding: '9px 0',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    style={{
                      border: '1px solid var(--gold-border)',
                      background: 'var(--gold-btn-grad)',
                      color: 'var(--gold-btn-text)',
                      borderRadius: 3,
                      padding: '9px 0',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Confirm &amp; film
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column: charts ── */}
        <div
          style={{
            padding: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
            gap: 18,
            alignContent: 'start',
          }}
        >
          {/* Legend row */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
              gridColumn: '1 / -1',
              fontSize: 12,
              color: '#3d4a5a',
            }}
          >
            {CAST_ORDER.map((name) => (
              <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 14,
                    height: 3,
                    background: personaColor(name),
                    display: 'inline-block',
                  }}
                />
                {name.split(' ')[0]}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: '#c9a24e',
                    display: 'inline-block',
                  }}
                />
                Twists off
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: '#2a43a6',
                    display: 'inline-block',
                  }}
                />
                Twists frequent
              </span>
            </span>
          </div>

          {/* 0. Token cost table */}
          <div style={{ gridColumn: '1 / -1' }}>
            <CostTable
              data={activeRuns}
              loading={summaryData === null && !summaryError}
              error={summaryError}
              onRefresh={() => { refreshRuns(); setSummaryData(null); setSummaryError(false) }}
            />
          </div>

          {/* 1. Brand score over time */}
          <ChartCard
            title="Brand score over time"
            question="Who wins, and when does the lead change?"
          >
            <D3Chart draw={drawBrandOverTime} data={filteredRuns} />
          </ChartCard>

          {/* 2. Final brand score */}
          <ChartCard
            title="Final brand score by setting"
            question="Does a switch change who wins?"
          >
            <D3Chart draw={drawFinalBrand} data={filteredRuns} />
          </ChartCard>

          {/* 3. Composure trajectory */}
          <ChartCard
            title="Composure trajectory"
            question='When does each personality reach "gone"?'
          >
            <D3Chart draw={drawComposureTrajectory} data={filteredRuns} />
          </ChartCard>

          {/* 4. Time to first breakdown */}
          <ChartCard
            title="Time to first breakdown"
            question="Is a result stable or one lucky run?"
          >
            <D3Chart draw={drawBreakdownHistogram} data={filteredRuns} />
          </ChartCard>

          {/* 5. Event mix */}
          <ChartCard
            title="Event mix per episode"
            question="Does a switch change what the episode is made of?"
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: -4 }}>
              {[
                { label: 'talk', color: '#9fb3c8' },
                { label: 'confessional', color: '#2a43a6' },
                { label: 'twist', color: '#c9a24e' },
                { label: 'interrupt', color: '#b2393f' },
              ].map(({ label, color }) => (
                <span
                  key={label}
                  style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#3d4a5a' }}
                >
                  <span style={{ width: 8, height: 8, background: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
            <D3Chart draw={drawEventMix} data={activeRuns} />
          </ChartCard>

          {/* 6. Twist impact */}
          <ChartCard
            title="Twist impact"
            question="Do twists actually move the story? Brand before ○ vs after ●"
          >
            <D3Chart draw={drawTwistImpact} data={filteredRuns} />
          </ChartCard>

          {/* 7. Alliance heatmap */}
          <ChartCard
            title="Alliance edge weights"
            question="Do the same alliances show up each time?"
          >
            <D3Chart draw={drawAllianceHeatmap} data={filteredRuns} height={170} />
          </ChartCard>

          {/* 8. In-character score (optional) */}
          <ChartCard
            title="In-character score"
            question="Does a persona stay in voice when composure drops?"
            optional
            dashed
          >
            <D3Chart draw={drawInCharacterScatter} data={filteredRuns} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
