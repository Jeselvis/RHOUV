import { useState } from 'react'
import { useEpisode } from '../hooks/useEpisode'
import { avatarStyle, portraitStyle } from '../castConfig'

function PersonaCard({ persona }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--panel-bg)',
        border: '1px solid rgba(160,124,52,.3)',
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 14px 30px -20px rgba(40,60,90,.5)',
      }}
    >
      <div
        style={{
          height: 230,
          borderBottom: '1px solid rgba(160,124,52,.3)',
          ...portraitStyle(persona.name),
        }}
      />
      <div
        style={{
          padding: '14px 14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 19,
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '.04em',
          }}
        >
          {persona.name.split(' ')[0]}
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--gold-text)',
          }}
        >
          {persona.persona_type}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.4,
            color: 'var(--ink-secondary)',
            fontStyle: 'italic',
            marginTop: 6,
            textWrap: 'pretty',
          }}
        >
          {persona.quote}
        </div>
      </div>
    </div>
  )
}

export default function OpeningCredits({ onBegin }) {
  const { personas, file, runs, loading, isFilming, startRun } = useEpisode()
  const [filming, setFilming] = useState(false)
  const [filmError, setFilmError] = useState(null)

  const handleFilm = async () => {
    setFilmError(null)
    setFilming(true)
    try {
      await startRun()
    } catch (e) {
      setFilmError(e.message ?? 'Failed to start')
      setFilming(false)
    }
  }

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}
    >
      {/* Hero image */}
      <div
        style={{
          height: 520,
          backgroundImage: "url('/title-card.webp')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {/* Bottom fade */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 200,
            background:
              'linear-gradient(180deg,rgba(214,229,239,0) 0%,#d3e3ee 100%)',
          }}
        />
        {/* Top chips */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 40,
            right: 40,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              letterSpacing: '.22em',
              color: '#5a4416',
              background: 'rgba(244,247,249,.75)',
              padding: '8px 14px',
              borderRadius: 3,
            }}
          >
            Season 1{runs.length > 0 ? ` · Episode ${runs.indexOf(file) + 1}` : ''}
          </div>
        </div>
      </div>

      {/* Content overlapping hero */}
      <div
        style={{
          flex: 1,
          padding: '0 60px 48px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          marginTop: -40,
          position: 'relative',
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                letterSpacing: '.3em',
                color: 'var(--gold-text)',
              }}
            >
              Tonight at the table
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 40,
                fontWeight: 600,
                letterSpacing: '.04em',
                background: 'var(--gold-grad)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              The Dinner Party
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {file && !isFilming && (
              <div style={{ fontSize: 14, color: 'var(--ink-secondary)' }}>
                Replaying{' '}
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  Episode {runs.indexOf(file) + 1}
                </span>
              </div>
            )}
            {filmError && (
              <div style={{ fontSize: 12, color: '#a3262b' }}>{filmError}</div>
            )}
            {/* Film a new episode */}
            <button
              onClick={handleFilm}
              disabled={isFilming || filming}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '.12em',
                color: isFilming || filming ? '#8a9db5' : '#3d4a5a',
                background: 'rgba(255,255,255,.5)',
                border: '1px solid rgba(160,124,52,.35)',
                borderRadius: 3,
                padding: '14px 22px',
                cursor: isFilming || filming ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: isFilming || filming ? 0.6 : 1,
              }}
            >
              {isFilming || filming ? 'Filming…' : 'Film Episode'}
            </button>
            {/* Watch existing episode */}
            <button
              onClick={onBegin}
              disabled={loading || !file || isFilming}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '.14em',
                color: 'var(--gold-btn-text)',
                background: 'var(--gold-btn-grad)',
                border: '1px solid var(--gold-border)',
                borderRadius: 3,
                padding: '14px 28px',
                cursor: loading || !file || isFilming ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: loading || !file || isFilming ? 0.6 : 1,
              }}
            >
              {isFilming ? 'Live…' : loading ? 'Loading…' : 'Begin episode'}
            </button>
          </div>
        </div>

        {/* Cast grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(0,1fr))',
            gap: 18,
          }}
        >
          {personas.map((p) => (
            <PersonaCard key={p.name} persona={p} />
          ))}
          {/* Placeholder cards while loading */}
          {personas.length === 0 &&
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 320,
                  background: 'rgba(255,255,255,.4)',
                  border: '1px solid rgba(160,124,52,.2)',
                  borderRadius: 4,
                  animation: 'none',
                }}
              />
            ))}
        </div>
      </div>
    </div>
  )
}
