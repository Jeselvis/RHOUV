import { useCallback } from 'react'
import { useEpisode } from '../hooks/useEpisode'

const SPEEDS = ['0.5×', '1×', '2×', '4×']
const DELAY_LABELS = { '0.5×': '600ms', '1×': '300ms', '2×': '150ms', '4×': '75ms' }

export default function ReplayControls() {
  const {
    mode,
    playing,
    togglePlay,
    speed,
    setSpeed,
    cursor,
    setCursor,
    total,
    twistPositions,
    allEvents,
  } = useEpisode()

  const scrubTo = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      setCursor(Math.round(pct * total))
    },
    [total, setCursor]
  )

  if (mode === 'live') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 32px',
          background: 'var(--dark-bar)',
          color: 'var(--dark-bar-text)',
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#e04a52',
              animation: 'livepulse 1.4s infinite',
              display: 'inline-block',
            }}
          />
          Streaming live from engine
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--dark-bar-secondary)',
          }}
        >
          {total} events received · spending tokens
        </div>
      </div>
    )
  }

  const progress = total > 0 ? cursor / total : 0

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0,1fr) auto auto',
        gap: 24,
        alignItems: 'center',
        padding: '16px 32px',
        background: 'var(--dark-bar)',
        color: 'var(--dark-bar-text)',
      }}
    >
      {/* Play/pause */}
      <button
        onClick={togglePlay}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid var(--gold-border)',
          background: 'var(--gold-btn-grad)',
          color: 'var(--gold-btn-text)',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      {/* Scrub bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          onClick={scrubTo}
          style={{
            position: 'relative',
            height: 6,
            background: 'rgba(255,255,255,.18)',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          {/* Progress fill */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progress * 100}%`,
              background: 'var(--gold-fill-2)',
              borderRadius: 3,
              pointerEvents: 'none',
            }}
          />
          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              left: `${progress * 100}%`,
              top: -5,
              width: 16,
              height: 16,
              marginLeft: -8,
              borderRadius: '50%',
              background: '#f1dc9b',
              border: '2px solid #1b2330',
              pointerEvents: 'none',
            }}
          />
          {/* Twist markers */}
          {twistPositions.map((pos) => (
            <div
              key={pos}
              style={{
                position: 'absolute',
                left: `${(pos / total) * 100}%`,
                top: 10,
                width: 2,
                height: 6,
                background: '#e2c272',
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--dark-bar-secondary)',
          }}
        >
          <span>
            event {cursor} / {total}
          </span>
          <span>twist markers ▲ gold</span>
        </div>
      </div>

      {/* Speed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontSize: 11,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--dark-bar-secondary)',
          }}
        >
          Speed
        </span>
        <div
          style={{
            display: 'flex',
            gap: 2,
            background: 'rgba(255,255,255,.08)',
            borderRadius: 3,
            padding: 3,
          }}
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                border: 0,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 2,
                background: speed === s ? 'var(--gold-fill-2)' : 'transparent',
                color: speed === s ? '#1b2330' : 'var(--dark-bar-secondary)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Delay readout */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--dark-bar-secondary)',
        }}
      >
        delay {DELAY_LABELS[speed]}
      </div>
    </div>
  )
}
