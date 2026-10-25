import { useEffect, useRef, useState } from 'react'
import { useEpisode } from '../hooks/useEpisode'
import { avatarStyle, brandTier, CAST_ORDER } from '../castConfig'

function useFlash(key, trigger) {
  const [flash, setFlash] = useState(null)
  const prevRef = useRef(trigger)

  useEffect(() => {
    if (prevRef.current !== trigger && trigger !== 0) {
      const type = trigger > 0 ? 'positive' : 'negative'
      setFlash(type)
      const t = setTimeout(() => setFlash(null), 1200)
      prevRef.current = trigger
      return () => clearTimeout(t)
    }
    prevRef.current = trigger
  }, [trigger])

  return flash
}

function BoardRow({ name, rank, score, delta }) {
  const flash = useFlash(name, delta)
  const tier = brandTier(score)

  const flashBg =
    flash === 'positive'
      ? 'rgba(47,125,79,.12)'
      : flash === 'negative'
      ? 'rgba(178,57,63,.1)'
      : 'transparent'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '22px 32px minmax(0,1fr) auto 60px 48px',
        gap: 10,
        alignItems: 'center',
        padding: '8px 10px',
        borderRadius: 3,
        background: flashBg,
        transition: 'background .3s',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--gold-text-2)',
        }}
      >
        {rank}
      </div>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          ...avatarStyle(name, 32),
        }}
      />
      <div style={{ fontWeight: 600, fontSize: 14 }}>{name.split(' ')[0]}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          padding: '3px 7px',
          borderRadius: 2,
          background: tier.bg,
          color: tier.fg,
          whiteSpace: 'nowrap',
        }}
      >
        {tier.label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 15,
          fontWeight: 600,
          textAlign: 'right',
        }}
      >
        {Math.round(score)}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'right',
          color:
            delta > 0 ? 'var(--positive)' : delta < 0 ? 'var(--negative)' : '#8b95a3',
        }}
      >
        {delta > 0 ? `+${delta.toFixed(1)}` : delta < 0 ? `−${Math.abs(delta).toFixed(1)}` : '·'}
      </div>
    </div>
  )
}

export default function BrandLeaderboard() {
  const { brand } = useEpisode()

  const ranked = CAST_ORDER.map((name) => ({
    name,
    score: brand[name]?.score ?? 100,
    delta: brand[name]?.delta ?? 0,
  })).sort((a, b) => b.score - a.score)

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
          Brand Leaderboard
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>brand_delta</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 10px' }}>
        {ranked.map((row, i) => (
          <BoardRow key={row.name} rank={i + 1} {...row} />
        ))}
      </div>
    </div>
  )
}
