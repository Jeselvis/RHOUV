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
  // Cross-episode view: x = episode number, y = final brand score at reckoning.
  // One line per persona. Shows how each woman's brand evolves across the season.
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const activeNames = data[0]?.activeNames ?? CAST_ORDER
  const LEGEND_ROWS = Math.ceil(activeNames.length / 3)
  const LEGEND_H = LEGEND_ROWS * 14 + 6
  const PAD = { top: 8, right: 8, bottom: 12 + LEGEND_H, left: 32 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  // Build per-name series: [{ep: 0, score: 100}, {ep:1, score:111}, ...]
  // Start every persona at 100 (episode 0 = before any runs)
  const series = {}
  for (const name of activeNames) {
    series[name] = [{ ep: 0, score: 100 }]
  }
  data.forEach((run, ri) => {
    for (const name of activeNames) {
      const score = run.final_brand?.[name] ?? null
      if (score !== null) series[name].push({ ep: ri + 1, score })
    }
  })

  // Personas with at least one non-start point
  const hasData = activeNames.filter((n) => series[n].length > 1)
  if (!hasData.length) {
    el.append('text').attr('x', W / 2).attr('y', (H - LEGEND_H) / 2).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#556173').text('No reckoning scores yet')
    return
  }

  const allScores = hasData.flatMap((n) => series[n].map((d) => d.score))
  const rawMin = d3.min(allScores)
  const rawMax = d3.max(allScores)
  const mid = (rawMin + rawMax) / 2
  const spread = Math.max(rawMax - rawMin, 20)
  const yMin = Math.min(rawMin - 4, mid - spread / 2 - 2)
  const yMax = Math.max(rawMax + 4, mid + spread / 2 + 2)

  const xScale = d3.scaleLinear([0, data.length], [0, iW])
  const yScale = d3.scaleLinear([yMin, yMax], [iH, 0])

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  // Y axis ticks
  for (const t of yScale.ticks(4)) {
    g.append('line').attr('x1', 0).attr('y1', yScale(t)).attr('x2', iW).attr('y2', yScale(t))
      .attr('stroke', 'rgba(27,35,48,.08)').attr('stroke-width', 1)
    g.append('text').attr('x', -4).attr('y', yScale(t) + 4)
      .attr('text-anchor', 'end').attr('font-size', 9).attr('fill', 'rgba(27,35,48,.4)').text(Math.round(t))
  }

  // Baseline at 100
  g.append('line').attr('x1', 0).attr('y1', yScale(100)).attr('x2', iW).attr('y2', yScale(100))
    .attr('stroke', 'rgba(27,35,48,.2)').attr('stroke-width', 1).attr('stroke-dasharray', '3 3')

  // X axis
  g.append('line').attr('x1', 0).attr('y1', iH).attr('x2', iW).attr('y2', iH)
    .attr('stroke', 'rgba(27,35,48,.25)').attr('stroke-width', 1)

  // Episode tick labels
  for (let i = 1; i <= data.length; i++) {
    g.append('text').attr('x', xScale(i)).attr('y', iH + 10)
      .attr('text-anchor', 'middle').attr('font-size', 8).attr('fill', 'rgba(27,35,48,.4)').text(i)
  }

  // Lines + terminal dot
  const line = d3.line().x((d) => xScale(d.ep)).y((d) => yScale(d.score)).curve(d3.curveMonotoneX)
  for (const name of hasData) {
    const color = personaColor(name)
    g.append('path').datum(series[name])
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('d', line)
    const last = series[name][series[name].length - 1]
    g.append('circle').attr('cx', xScale(last.ep)).attr('cy', yScale(last.score)).attr('r', 3)
      .attr('fill', color)
  }

  // Legend — 3-column grid below chart
  const colW = iW / 3
  activeNames.forEach((name, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const lx = PAD.left + col * colW
    const ly = PAD.top + iH + 16 + row * 14
    el.append('rect').attr('x', lx).attr('y', ly - 4).attr('width', 12).attr('height', 3).attr('fill', personaColor(name))
    el.append('text').attr('x', lx + 16).attr('y', ly).attr('font-size', 9).attr('fill', '#3d4a5a').text(name.split(' ')[0])
  })
}

function drawFinalBrand(svg, data, W, H) {
  // Grouped bars: one group per episode, one bar per persona.
  // Shows whether final reckoning scores change across episodes.
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const names = data[0]?.activeNames ?? CAST_ORDER
  const LEGEND_ROWS = Math.ceil(names.length / 3)
  const LEGEND_H = LEGEND_ROWS * 14 + 6
  const PAD = { top: 8, right: 8, bottom: 16 + LEGEND_H, left: 28 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  // Only episodes that have at least one scored persona
  const scoredRuns = data.filter((r) => Object.keys(r.final_brand ?? {}).length > 0)
  if (!scoredRuns.length) {
    el.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#556173').text('No reckoning scores yet')
    return
  }

  const allScores = scoredRuns.flatMap((r) => names.map((n) => r.final_brand?.[n] ?? 100))
  const rawMax = d3.max(allScores) ?? 120
  const rawMin = d3.min(allScores) ?? 80
  const yMax = rawMax * 1.05
  const yMin = Math.max(0, rawMin * 0.92)
  const yScale = d3.scaleLinear([yMin, yMax], [iH, 0])

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  // Y axis ticks
  for (const t of yScale.ticks(4)) {
    g.append('line').attr('x1', 0).attr('y1', yScale(t)).attr('x2', iW).attr('y2', yScale(t))
      .attr('stroke', 'rgba(27,35,48,.07)').attr('stroke-width', 1)
    g.append('text').attr('x', -4).attr('y', yScale(t) + 4)
      .attr('text-anchor', 'end').attr('font-size', 8).attr('fill', 'rgba(27,35,48,.4)').text(Math.round(t))
  }

  // Baseline at 100
  if (yMin <= 100 && yMax >= 100) {
    g.append('line').attr('x1', 0).attr('y1', yScale(100)).attr('x2', iW).attr('y2', yScale(100))
      .attr('stroke', 'rgba(27,35,48,.2)').attr('stroke-width', 1).attr('stroke-dasharray', '3 3')
  }

  g.append('line').attr('x1', 0).attr('y1', iH).attr('x2', iW).attr('y2', iH)
    .attr('stroke', 'rgba(27,35,48,.25)').attr('stroke-width', 1)

  const groupW = iW / scoredRuns.length
  const barW = Math.max(2, (groupW - 8) / names.length - 1)

  scoredRuns.forEach((run, ri) => {
    const groupX = ri * groupW + 4
    names.forEach((name, ni) => {
      const score = run.final_brand?.[name]
      if (score == null) return
      const x = groupX + ni * (barW + 1)
      const barH = iH - yScale(score)
      g.append('rect')
        .attr('x', x).attr('y', yScale(score)).attr('width', barW).attr('height', barH)
        .attr('fill', personaColor(name))
    })
    // Episode label centred under group
    g.append('text')
      .attr('x', groupX + (groupW - 8) / 2).attr('y', iH + 11)
      .attr('text-anchor', 'middle').attr('font-size', 8).attr('fill', 'rgba(27,35,48,.5)')
      .text(`Ep ${data.indexOf(run) + 1}`)
  })

  // Legend — 3-column grid
  const colW = iW / 3
  names.forEach((name, i) => {
    const col = i % 3; const row = Math.floor(i / 3)
    const lx = PAD.left + col * colW
    const ly = PAD.top + iH + 20 + row * 14
    el.append('rect').attr('x', lx).attr('y', ly - 4).attr('width', 10).attr('height', 10).attr('rx', 1).attr('fill', personaColor(name))
    el.append('text').attr('x', lx + 14).attr('y', ly + 4).attr('font-size', 9).attr('fill', '#3d4a5a').text(name.split(' ')[0])
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
  // Cross-episode: brand final scores per episode (lines), gold markers on episodes with twists.
  // Question: do twist episodes produce bigger brand swings?
  const el = d3.select(svg)
  el.selectAll('*').remove()

  if (!data.length) return

  const hasTwists = data.some((r) => r.twists?.length)
  const activeNames = data[0]?.activeNames ?? CAST_ORDER

  const LEGEND_ROWS = Math.ceil(activeNames.length / 3)
  const LEGEND_H = LEGEND_ROWS * 14 + 6
  const PAD = { top: 16, right: 8, bottom: 12 + LEGEND_H, left: 32 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  // Same series structure as cross-episode brand chart
  const series = {}
  for (const name of activeNames) series[name] = [{ ep: 0, score: 100 }]
  data.forEach((run, ri) => {
    for (const name of activeNames) {
      const score = run.final_brand?.[name] ?? null
      if (score !== null) series[name].push({ ep: ri + 1, score })
    }
  })

  const hasData = activeNames.filter((n) => series[n].length > 1)
  if (!hasData.length) {
    el.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#556173').text('No reckoning scores yet')
    return
  }

  const allScores = hasData.flatMap((n) => series[n].map((d) => d.score))
  const rawMin = d3.min(allScores)
  const rawMax = d3.max(allScores)
  const mid = (rawMin + rawMax) / 2
  const spread = Math.max(rawMax - rawMin, 20)
  const yMin = Math.min(rawMin - 4, mid - spread / 2 - 2)
  const yMax = Math.max(rawMax + 4, mid + spread / 2 + 2)

  const xScale = d3.scaleLinear([0, data.length], [0, iW])
  const yScale = d3.scaleLinear([yMin, yMax], [iH, 0])

  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  // Gold vertical bands for episodes with twists
  data.forEach((run, ri) => {
    if (!run.twists?.length) return
    const x = xScale(ri + 1)
    const prevX = xScale(ri)
    // Shade the band
    g.append('rect')
      .attr('x', prevX + 2).attr('y', 0)
      .attr('width', x - prevX - 4).attr('height', iH)
      .attr('fill', '#c9a24e').attr('fill-opacity', 0.08)
    // Top label: twist count
    g.append('text').attr('x', (prevX + x) / 2).attr('y', -4)
      .attr('text-anchor', 'middle').attr('font-size', 8).attr('fill', '#a87f2f')
      .text(`${run.twists.length} twist${run.twists.length > 1 ? 's' : ''}`)
  })

  // Y axis ticks
  for (const t of yScale.ticks(4)) {
    g.append('line').attr('x1', 0).attr('y1', yScale(t)).attr('x2', iW).attr('y2', yScale(t))
      .attr('stroke', 'rgba(27,35,48,.08)').attr('stroke-width', 1)
    g.append('text').attr('x', -4).attr('y', yScale(t) + 4)
      .attr('text-anchor', 'end').attr('font-size', 9).attr('fill', 'rgba(27,35,48,.4)').text(Math.round(t))
  }

  // Baseline at 100
  g.append('line').attr('x1', 0).attr('y1', yScale(100)).attr('x2', iW).attr('y2', yScale(100))
    .attr('stroke', 'rgba(27,35,48,.2)').attr('stroke-width', 1).attr('stroke-dasharray', '3 3')

  // X axis + episode tick labels
  g.append('line').attr('x1', 0).attr('y1', iH).attr('x2', iW).attr('y2', iH)
    .attr('stroke', 'rgba(27,35,48,.25)').attr('stroke-width', 1)
  for (let i = 1; i <= data.length; i++) {
    g.append('text').attr('x', xScale(i)).attr('y', iH + 10)
      .attr('text-anchor', 'middle').attr('font-size', 8).attr('fill', 'rgba(27,35,48,.4)').text(i)
  }

  // Brand lines + terminal dots
  const line = d3.line().x((d) => xScale(d.ep)).y((d) => yScale(d.score)).curve(d3.curveMonotoneX)
  for (const name of hasData) {
    const color = personaColor(name)
    g.append('path').datum(series[name])
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('d', line)
    const last = series[name][series[name].length - 1]
    g.append('circle').attr('cx', xScale(last.ep)).attr('cy', yScale(last.score)).attr('r', 3)
      .attr('fill', color)
  }

  // Legend
  const colW = iW / 3
  activeNames.forEach((name, i) => {
    const col = i % 3; const row = Math.floor(i / 3)
    const lx = PAD.left + col * colW
    const ly = PAD.top + iH + 16 + row * 14
    el.append('rect').attr('x', lx).attr('y', ly - 4).attr('width', 12).attr('height', 3).attr('fill', personaColor(name))
    el.append('text').attr('x', lx + 16).attr('y', ly).attr('font-size', 9).attr('fill', '#3d4a5a').text(name.split(' ')[0])
  })

  if (!hasTwists) {
    g.append('text').attr('x', iW / 2).attr('y', iH / 2).attr('text-anchor', 'middle')
      .attr('font-size', 10).attr('fill', '#9aa7b4').attr('font-style', 'italic').text('no twist episodes yet')
  }
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

function drawBehaviorShift(svg, data, W, H) {
  // Grouped bars per episode: high / mid / low composure tiers, y = avg words per turn.
  // Tests whether state injection (composure) measurably changes speech length.
  const el = d3.select(svg)
  el.selectAll('*').remove()
  if (!data.length) return

  const TIERS = [
    { key: 'high', label: 'High composure', color: '#4a7fa5' },
    { key: 'mid',  label: 'Mid',            color: '#b48a35' },
    { key: 'low',  label: 'Low',            color: '#a03030' },
  ]

  const allAvgs = data.flatMap((run) =>
    TIERS.map((t) => run.behavior_metrics?.[t.key]?.avg_words ?? 0).filter((v) => v > 0)
  )
  if (!allAvgs.length) {
    el.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#556173').text('No composure data yet')
    return
  }

  const LEGEND_H = 18
  const PAD = { top: 8, right: 8, bottom: 22 + LEGEND_H, left: 28 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const yMax = Math.ceil((d3.max(allAvgs) ?? 60) * 1.15)
  const yScale = d3.scaleLinear([0, yMax], [iH, 0])
  const g = el.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

  for (const t of yScale.ticks(4)) {
    g.append('line').attr('x1', 0).attr('y1', yScale(t)).attr('x2', iW).attr('y2', yScale(t))
      .attr('stroke', 'rgba(27,35,48,.07)').attr('stroke-width', 1)
    g.append('text').attr('x', -4).attr('y', yScale(t) + 4)
      .attr('text-anchor', 'end').attr('font-size', 8).attr('fill', 'rgba(27,35,48,.4)').text(Math.round(t))
  }
  g.append('line').attr('x1', 0).attr('y1', iH).attr('x2', iW).attr('y2', iH)
    .attr('stroke', 'rgba(27,35,48,.25)').attr('stroke-width', 1)

  const groupW = iW / data.length
  const barGap = 2
  const barW = Math.max(3, (groupW - 8) / TIERS.length - barGap)

  data.forEach((run, ri) => {
    const groupX = ri * groupW + 4
    TIERS.forEach((tier, ti) => {
      const avg = run.behavior_metrics?.[tier.key]?.avg_words ?? 0
      if (!avg) return
      const x = groupX + ti * (barW + barGap)
      const bH = iH - yScale(avg)
      g.append('rect').attr('x', x).attr('y', yScale(avg)).attr('width', barW).attr('height', bH)
        .attr('fill', tier.color).attr('fill-opacity', 0.82)
    })
    g.append('text').attr('x', groupX + (groupW - 8) / 2).attr('y', iH + 11)
      .attr('text-anchor', 'middle').attr('font-size', 8).attr('fill', 'rgba(27,35,48,.5)')
      .text(`Ep ${ri + 1}`)
  })

  // Legend
  const legY = PAD.top + iH + 20
  TIERS.forEach((tier, ti) => {
    const lx = PAD.left + ti * (iW / 3)
    el.append('rect').attr('x', lx).attr('y', legY - 4).attr('width', 10).attr('height', 10)
      .attr('rx', 1).attr('fill', tier.color).attr('fill-opacity', 0.82)
    el.append('text').attr('x', lx + 14).attr('y', legY + 4)
      .attr('font-size', 9).attr('fill', '#3d4a5a').text(tier.label)
  })
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
              {['Run', 'Personality model', 'Cast', 'Wine', 'Pub ctx', 'Judge ctx', 'Input tok', 'Output tok', 'Total tok', 'Est. cost'].map((h) => (
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
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {meta?.wine_amount != null ? (meta.wine_amount === 0 ? 'off' : `${meta.wine_amount.toFixed(1)}×`) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {meta?.public_context_window ?? '—'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {meta?.judge_context_window ?? '—'}
                  </td>
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

const ROLE_LABELS = { personality: 'Personality', director: 'Director', judge: 'Judge' }

function ModelPicker({ availableModels, modelConfig, onChange }) {
  const fmt = (v) => (v == null ? '—' : `$${v.toFixed(2)}`)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#3d4a5a' }}>
        Models
      </div>
      {!availableModels.length && (
        <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          Set OPENAI_API_BASE + OPENAI_API_KEY to load models
        </div>
      )}
      {Object.keys(ROLE_LABELS).map((role) => (
        <div key={role} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 10, color: '#556173', letterSpacing: '.08em' }}>
            {ROLE_LABELS[role]}
          </div>
          <select
            value={modelConfig[role] ?? ''}
            onChange={(e) => onChange(role, e.target.value)}
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              background: '#fff',
              border: '1px solid rgba(160,124,52,.35)',
              borderRadius: 3,
              padding: '5px 6px',
              color: '#1b2330',
              width: '100%',
            }}
          >
            {modelConfig[role] && !availableModels.find((m) => m.litellm_id === modelConfig[role]) && (
              <option value={modelConfig[role]}>{modelConfig[role]}</option>
            )}
            {availableModels.map((m) => {
              const costHint = m.input_per_m != null
                ? ` — ${fmt(m.input_per_m)}/${fmt(m.output_per_m)}/M`
                : ''
              return (
                <option key={m.litellm_id} value={m.litellm_id}>
                  {m.id}{costHint}
                </option>
              )
            })}
          </select>
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
        Costs are estimates. Affects next filmed episode.
      </div>
    </div>
  )
}

// ─── Alliance evolution animation ─────────────────────────────────────────────

const _CTL_BTN = (disabled) => ({
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.08em',
  padding: '4px 10px',
  border: '1px solid rgba(160,124,52,.4)',
  borderRadius: 3,
  background: 'transparent',
  color: disabled ? 'rgba(61,74,90,.3)' : '#3d4a5a',
  cursor: disabled ? 'default' : 'pointer',
})

function AllianceEvolutionChart({ runs }) {
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const svgRef = useRef(null)

  const activeNames = runs[0]?.activeNames ?? CAST_ORDER

  // Build per-episode cumulative alliance state
  const frames = useMemo(() => {
    if (!runs.length) return []
    const cumulative = {}
    return runs.map((run) => {
      for (const ev of run.alliance_events ?? []) {
        const key = [ev.a, ev.b].sort().join('|')
        cumulative[key] = ev.kind
      }
      return {
        mentionWeights: run.alliance_weights ?? {},
        explicitEdges: { ...cumulative },
      }
    })
  }, [runs])

  // Reset when episode list changes
  useEffect(() => { setFrameIdx(0); setPlaying(false) }, [runs])

  // Auto-play
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setFrameIdx((prev) => {
        if (prev >= frames.length - 1) { setPlaying(false); return prev }
        return prev + 1
      })
    }, 1200)
    return () => clearInterval(id)
  }, [playing, frames.length])

  // Fixed circular node positions
  const positions = useMemo(() => {
    const W = 400, H = 220, CX = W / 2, CY = H / 2
    const R = 80
    const pos = {}
    activeNames.forEach((name, i) => {
      const angle = (2 * Math.PI * i / activeNames.length) - Math.PI / 2
      pos[name] = { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) }
    })
    return pos
  }, [activeNames])

  // Draw nodes (only when cast changes)
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('g').attr('class', 'edges-layer')
    const nodesG = svg.append('g').attr('class', 'nodes-layer')
    const NODE_SIZE = 28
    const IMG_W = 1424, FACE_Y = 270, k = NODE_SIZE / 50
    for (const name of activeNames) {
      const p = positions[name]
      if (!p) continue
      const g = nodesG.append('g').attr('transform', `translate(${p.x},${p.y})`)
      // Coloured ring behind the avatar
      g.append('circle')
        .attr('r', NODE_SIZE / 2 + 2)
        .attr('fill', 'none')
        .attr('stroke', personaColor(name))
        .attr('stroke-width', 2)
      // Avatar via foreignObject → HTML div with sprite clip
      const { fx } = { fx: 178, ...(() => {
        const POS = {
          'Vivienne Davenport': { fx: 178 }, 'Cassandra Cole': { fx: 394 },
          'Bianca Noel': { fx: 608 }, 'Diane Wentworth': { fx: 822 },
          'Petra Voss': { fx: 1043 }, 'Madison Fleur': { fx: 1258 },
        }
        return POS[name] ?? {}
      })() }
      g.append('foreignObject')
        .attr('x', -NODE_SIZE / 2).attr('y', -NODE_SIZE / 2)
        .attr('width', NODE_SIZE).attr('height', NODE_SIZE)
        .append('xhtml:div')
        .style('width', NODE_SIZE + 'px').style('height', NODE_SIZE + 'px')
        .style('border-radius', '50%').style('overflow', 'hidden')
        .style('background-image', "url('/title-card.webp')")
        .style('background-size', `${IMG_W * k}px auto`)
        .style('background-position', `${-(fx * k - NODE_SIZE / 2)}px ${-(FACE_Y * k - NODE_SIZE / 2)}px`)
        .style('background-repeat', 'no-repeat')
    }
  }, [activeNames, positions])

  // Update edges with D3 transitions on frame change
  useEffect(() => {
    if (!svgRef.current || !frames.length) return
    const svg = d3.select(svgRef.current)
    const edgesLayer = svg.select('.edges-layer')
    if (edgesLayer.empty()) return

    const frame = frames[Math.min(frameIdx, frames.length - 1)]
    const maxMention = Math.max(1, ...Object.values(frame.mentionWeights))

    const allKeys = new Set([
      ...Object.keys(frame.mentionWeights),
      ...Object.keys(frame.explicitEdges),
    ])

    const edgeData = []
    for (const key of allKeys) {
      const [a, b] = key.split('|')
      const pa = positions[a], pb = positions[b]
      if (!pa || !pb) continue
      const kind = frame.explicitEdges[key]
      const w = frame.mentionWeights[key] ?? 0
      if (kind === 'ally') {
        edgeData.push({ key, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
          stroke: '#b48a35', strokeWidth: 3, opacity: 1, dasharray: '' })
      } else if (kind === 'feud') {
        edgeData.push({ key, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
          stroke: '#b2393f', strokeWidth: 3, opacity: 1, dasharray: '6 4' })
      } else if (w > 0) {
        edgeData.push({ key, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
          stroke: '#8899aa', strokeWidth: 0.5 + (w / maxMention) * 1.5,
          opacity: 0.12 + 0.28 * (w / maxMention), dasharray: '' })
      }
    }

    const T = d3.transition().duration(500).ease(d3.easeCubicInOut)
    const lines = edgesLayer.selectAll('line.ae').data(edgeData, (d) => d.key)

    lines.enter()
      .append('line').attr('class', 'ae')
      .attr('x1', (d) => d.x1).attr('y1', (d) => d.y1)
      .attr('x2', (d) => d.x2).attr('y2', (d) => d.y2)
      .attr('opacity', 0)
      .merge(lines)
      .transition(T)
      .attr('opacity', (d) => d.opacity)
      .attr('stroke', (d) => d.stroke)
      .attr('stroke-width', (d) => d.strokeWidth)
      .attr('stroke-dasharray', (d) => d.dasharray)

    lines.exit().transition(T).attr('opacity', 0).remove()
  }, [frameIdx, frames, positions])

  if (!runs.length) return (
    <div style={{ fontSize: 12, color: 'var(--ink-muted)', padding: '20px 0' }}>No episodes yet.</div>
  )

  const atStart = frameIdx === 0
  const atEnd = frameIdx >= frames.length - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} viewBox="0 0 400 220"
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} />
        <div style={{
          position: 'absolute', top: 2, right: 0,
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
          letterSpacing: '.1em', color: 'var(--gold-text)',
        }}>
          EP {frameIdx + 1} / {frames.length}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setFrameIdx((p) => Math.max(0, p - 1))}
          disabled={atStart} style={_CTL_BTN(atStart)}>←</button>
        <button
          onClick={() => {
            if (atEnd) { setFrameIdx(0); setPlaying(true) }
            else setPlaying((p) => !p)
          }}
          style={_CTL_BTN(false)}
        >{playing ? '⏸' : atEnd ? '↺' : '▶'}</button>
        <button onClick={() => setFrameIdx((p) => Math.min(frames.length - 1, p + 1))}
          disabled={atEnd} style={_CTL_BTN(atEnd)}>→</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-muted)', alignItems: 'center' }}>
          {[
            { stroke: '#8899aa', width: 1.5, dash: null, label: 'mentions' },
            { stroke: '#b48a35', width: 3,   dash: null, label: 'ally' },
            { stroke: '#b2393f', width: 3,   dash: '5 3', label: 'feud' },
          ].map(({ stroke, width, dash, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="20" height="8">
                <line x1="0" y1="4" x2="20" y2="4"
                  stroke={stroke} strokeWidth={width}
                  strokeDasharray={dash ?? undefined} />
              </svg>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

const _PREFS_KEY = 'rhouv_eval_prefs'
function _loadPrefs() {
  try { return JSON.parse(localStorage.getItem(_PREFS_KEY) ?? '{}') } catch { return {} }
}

export default function EvalPage() {
  const { runs, personas, isFilming, startRun, refreshRuns } = useEpisode()

  // Initialise all UI prefs from localStorage so settings survive page reloads.
  const _saved = useMemo(_loadPrefs, [])

  const [castOn, setCastOn] = useState(
    _saved.castOn ?? Object.fromEntries(CAST_ORDER.map((n) => [n, true]))
  )
  const [twists, setTwists] = useState(_saved.twists ?? 'frequent')
  const [interrupts, setInterrupts] = useState(_saved.interrupts ?? true)
  const [wineAmount, setWineAmount] = useState(_saved.wineAmount ?? 1.0)
  const [insultWeight, setInsultWeight] = useState(_saved.insultWeight ?? 1.4)
  const [thresholds, setThresholds] = useState(_saved.thresholds ?? [70, 45, 20])
  const [confirming, setConfirming] = useState(false)
  const [summaryData, setSummaryData] = useState(null) // null = not yet loaded
  const [summaryError, setSummaryError] = useState(false)
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0)
  const [availableModels, setAvailableModels] = useState([])
  const [modelConfig, setModelConfig] = useState({})
  const [engineConfig, setEngineConfig] = useState({ public_context_window: 12, judge_context_window: 40 })

  // Persist UI prefs to localStorage whenever they change.
  useEffect(() => {
    localStorage.setItem(_PREFS_KEY, JSON.stringify(
      { castOn, twists, interrupts, wineAmount, insultWeight, thresholds }
    ))
  }, [castOn, twists, interrupts, wineAmount, insultWeight, thresholds])

  // Load available models + current model config on mount
  useEffect(() => {
    fetch('/api/models').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setAvailableModels(d) }).catch(() => {})
    fetch('/api/config/models').then((r) => r.json()).then((d) => { if (d) setModelConfig(d) }).catch(() => {})
    fetch('/api/config/engine').then((r) => r.json()).then((d) => { if (d) setEngineConfig(d) }).catch(() => {})
  }, [])

  const handleModelChange = (role, value) => {
    const next = { ...modelConfig, [role]: value }
    setModelConfig(next)
    fetch('/api/config/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [role]: value }),
    }).catch(() => {})
  }

  const handleEngineConfigChange = (key, value) => {
    const next = { ...engineConfig, [key]: value }
    setEngineConfig(next)
    fetch('/api/config/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {})
  }

  // Load eval summary on mount / when runs change / on explicit refresh
  useEffect(() => {
    if (!runs.length) return
    setSummaryData(null)
    setSummaryError(false)
    fetch(`/api/eval/summary?runs=${runs.join(',')}`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then((d) => { if (Array.isArray(d)) setSummaryData(d) })
      .catch(() => setSummaryError(true))
  }, [runs.join(','), summaryRefreshKey])

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

          {/* Interrupt toggle + Wine slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Toggle label="Interrupts" value={interrupts} onChange={setInterrupts} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#3d4a5a' }}>
                  Wine
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: wineAmount === 0 ? 'var(--ink-muted)' : '#3d4a5a' }}>
                  {wineAmount === 0 ? 'off' : `${wineAmount.toFixed(1)}×`}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={0.5}
                value={wineAmount}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setWineAmount(v)
                  handleEngineConfigChange('wine_amount', v)
                }}
                style={{ width: '100%', accentColor: '#b48a35' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-muted)' }}>
                <span>off</span><span>1× default</span><span>3× heavy</span>
              </div>
            </div>
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

          {/* Model picker */}
          <ModelPicker
            availableModels={availableModels}
            modelConfig={modelConfig}
            onChange={handleModelChange}
          />

          {/* Context windows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#3d4a5a' }}>
              Context windows
            </div>
            {[
              { key: 'public_context_window', label: 'Table ctx', hint: 'lines each personality sees' },
              { key: 'judge_context_window',  label: 'Judge ctx', hint: 'events judge reads' },
            ].map(({ key, label, hint }) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 10, color: '#556173', letterSpacing: '.08em' }}>{label}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{hint}</div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={engineConfig[key] ?? ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (v > 0) handleEngineConfigChange(key, v)
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
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
              Affects next filmed episode.
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
                disabled={isFilming}
                title={isFilming ? 'Episode already filming' : undefined}
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
                  cursor: isFilming ? 'default' : 'pointer',
                  opacity: isFilming ? 0.5 : 1,
                }}
              >
                {isFilming ? 'Filming…' : 'Film Episode (new run)'}
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
                    onClick={() => { setConfirming(false); startRun({ fast: false }) }}
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
              onRefresh={() => { refreshRuns(); setSummaryRefreshKey(k => k + 1) }}
            />
          </div>

          {/* 1. Brand score over time */}
          <ChartCard
            title="Brand score across episodes"
            question="Who improves episode to episode, and who falls?"
          >
            <D3Chart draw={drawBrandOverTime} data={filteredRuns} />
          </ChartCard>

          {/* 2. Final brand score */}
          <ChartCard
            title="Final brand score by episode"
            question="Does the winner change across episodes, or does one persona dominate?"
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
            title="Twist impact across episodes"
            question="Do twist episodes produce bigger brand swings? Gold bands = episodes with twists."
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

          {/* 8. Behavior shift */}
          <ChartCard
            title="Composure → speech length"
            question="Does low composure produce shorter or longer turns? Bars = high / mid / low composure."
          >
            <D3Chart draw={drawBehaviorShift} data={filteredRuns} />
          </ChartCard>

          {/* 9. Alliance evolution */}
          <ChartCard
            title="Alliance evolution"
            question="How do mention ties and explicit alliances shift across episodes?"
          >
            <AllianceEvolutionChart runs={filteredRuns} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
