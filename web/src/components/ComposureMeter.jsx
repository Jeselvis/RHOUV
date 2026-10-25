import { useEpisode } from '../hooks/useEpisode'
import { CAST_ORDER, composureState } from '../castConfig'

function MeterRow({ name, value }) {
  const { label, color } = composureState(value)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px minmax(0,1fr) 74px',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{name.split(' ')[0]}</div>

      <div
        style={{
          position: 'relative',
          height: 10,
          background: 'rgba(27,35,48,.08)',
          borderRadius: 5,
        }}
      >
        {/* Fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.max(0, Math.min(100, value))}%`,
            background: color,
            borderRadius: 5,
            transition: 'width 400ms ease-out',
          }}
        />
        {/* Threshold ticks at 20%, 45%, 70% */}
        {[20, 45, 70].map((pct) => (
          <div
            key={pct}
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: -3,
              bottom: -3,
              width: 1,
              background: 'rgba(27,35,48,.3)',
            }}
          />
        ))}
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color,
          textAlign: 'right',
        }}
      >
        {label}
      </div>
    </div>
  )
}

export default function ComposureMeter() {
  const { composure } = useEpisode()

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
          Composure
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>composure_delta</div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '16px 20px',
        }}
      >
        {CAST_ORDER.map((name) => (
          <MeterRow
            key={name}
            name={name}
            value={composure[name]?.value ?? 100}
          />
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--ink-muted)',
            paddingLeft: 84,
            paddingRight: 86,
          }}
        >
          <span>gone</span>
          <span>slipping</span>
          <span>irritated</span>
          <span>normal</span>
        </div>
      </div>
    </div>
  )
}
