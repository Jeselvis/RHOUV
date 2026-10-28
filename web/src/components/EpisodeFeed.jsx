import { useEffect, useRef, useState } from 'react'
import { useEpisode } from '../hooks/useEpisode'
import { avatarStyle, courseLabel } from '../castConfig'

function KnowledgeField({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: accent ? '#a03030' : '#556173',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.4 }}>{value || '—'}</div>
    </div>
  )
}

function PersonaKnowledgeCard({ persona, onClose }) {
  if (!persona) return null
  return (
    <div
      style={{
        position: 'fixed',
        top: 72,
        left: 24,
        width: 280,
        background: 'var(--panel-bg)',
        border: 'var(--panel-border)',
        borderRadius: 'var(--panel-radius)',
        boxShadow: '0 8px 40px rgba(20,40,80,.2)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: 'var(--panel-header-border)',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {persona.name.split(' ')[0]}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--gold-text)',
              whiteSpace: 'nowrap',
            }}
          >
            {persona.persona_type}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            lineHeight: 1,
            color: 'var(--ink-muted)',
            flexShrink: 0,
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <KnowledgeField label="Goal" value={persona.goal} />
        <KnowledgeField label="Weakness" value={persona.weakness} />
        <KnowledgeField label="Her secret" value={persona.secret} accent />
        {persona.known_about && (
          <KnowledgeField
            label={`Knows about ${persona.known_about.split(' ')[0]}`}
            value={persona.known_secret}
            accent
          />
        )}
      </div>
    </div>
  )
}

function TalkRow({ event, wasCutOff, onInfoClick }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0,1fr) auto',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: wasCutOff ? '1.5px solid #a3262b' : '1.5px solid var(--gold-fill-2)',
            ...avatarStyle(event.speaker, 40),
          }}
        />
        <button
          onClick={() => onInfoClick(event.speaker)}
          title={`${event.speaker?.split(' ')[0]}'s knowledge`}
          style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: 'var(--sapphire)',
            border: '1.5px solid var(--panel-bg)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 800,
            color: '#fff',
            padding: 0,
            lineHeight: 1,
          }}
        >
          i
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            {event.speaker?.split(' ')[0]}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            to the table
          </span>
        </div>
        {event.content ? (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.45,
              color: 'var(--ink)',
              textWrap: 'pretty',
            }}
          >
            {event.content}
            {wasCutOff && (
              <span style={{ color: '#a3262b', fontWeight: 700, marginLeft: 3 }}>—</span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--ink-muted)', fontStyle: 'italic' }}>
            …
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-timestamp)',
          whiteSpace: 'nowrap',
        }}
      >
        {new Date(event.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </div>
    </div>
  )
}

function ConfessionalRow({ event }) {
  return (
    <div
      style={{
        marginLeft: 52,
        display: 'grid',
        gridTemplateColumns: '32px minmax(0,1fr) auto',
        gap: 12,
        alignItems: 'start',
        background: 'var(--conf-bg)',
        border: '1px solid var(--conf-border)',
        borderRadius: 4,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          filter: 'saturate(.7)',
          flexShrink: 0,
          ...avatarStyle(event.speaker, 32),
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.16em',
              color: '#fff',
              background: 'var(--sapphire)',
              padding: '2px 6px',
              borderRadius: 2,
            }}
          >
            ● REC
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--sapphire)',
            }}
          >
            Confessional · {event.speaker?.split(' ')[0]}
          </span>
        </div>
        {event.content ? (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.45,
              fontStyle: 'italic',
              color: 'var(--conf-text)',
              textWrap: 'pretty',
            }}
          >
            {event.content}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--sapphire)', opacity: 0.5, fontStyle: 'italic' }}>
            …
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink-timestamp)',
          whiteSpace: 'nowrap',
        }}
      >
        {new Date(event.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </div>
    </div>
  )
}

function InterruptRow({ event }) {
  const interruptor = event.interruptor ?? event.interrupter
  const target = event.target ?? event.interrupted
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0,1fr)',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '2px solid #a3262b',
          flexShrink: 0,
          ...avatarStyle(interruptor, 40),
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(163,38,43,.07)',
          border: '1px solid rgba(163,38,43,.25)',
          borderRadius: 4,
          padding: '8px 12px',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: '#fff',
            background: '#a3262b',
            padding: '2px 6px',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          Interrupts
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#a3262b' }}>
          {interruptor?.split(' ')[0] ?? '?'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>cuts off</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
          {target?.split(' ')[0] ?? '?'}
        </span>
      </div>
    </div>
  )
}

function TwistBanner({ event }) {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg,#f3e2ac 0%,#d8b363 100%)',
        border: '1px solid var(--gold-border)',
        borderRadius: 4,
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '.3em',
          color: '#4a360c',
        }}
      >
        TWIST
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#2a1f08', textWrap: 'pretty' }}>
        {event.content ?? event.text ?? ''}
      </div>
    </div>
  )
}

function CourseDivider({ event }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        margin: '6px 0',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'rgba(160,124,52,.4)' }} />
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '.24em',
          color: 'var(--gold-text)',
        }}
      >
        {courseLabel(event.course)}
      </div>
      <div style={{ flex: 1, height: 1, background: 'rgba(160,124,52,.4)' }} />
    </div>
  )
}

export default function EpisodeFeed() {
  const { feed, personas } = useEpisode()
  const scrollRef = useRef(null)
  const [activePersonaName, setActivePersonaName] = useState(null)

  const activePersona = personas.find((p) => p.name === activePersonaName) ?? null

  const handleInfoClick = (speakerName) => {
    setActivePersonaName((cur) => (cur === speakerName ? null : speakerName))
  }

  // Auto-scroll only when user is already near the bottom (within 80px).
  // If they've scrolled up to read, don't yank them back down.
  // Use scrollTo on the container directly — scrollIntoView propagates up
  // to the page and causes the whole window to jump.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 80) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [feed.length])

  return (
    <>
    <div
      style={{
        background: 'var(--panel-bg)',
        border: 'var(--panel-border)',
        borderRadius: 'var(--panel-radius)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 22px',
          borderBottom: 'var(--panel-header-border)',
          flexShrink: 0,
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
          Episode Feed
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-muted)' }}>
          <span>Table talk</span>
          <span style={{ color: 'var(--sapphire)' }}>Confessional</span>
          <span style={{ color: 'var(--gold-text-2)' }}>Twist</span>
        </div>
      </div>

      {/* Scrolling feed */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: '20px 22px',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        {feed.length === 0 && (
          <div style={{ fontSize: 14, color: 'var(--ink-muted)', textAlign: 'center', padding: 40 }}>
            Press play to begin
          </div>
        )}
        {feed.map((e, i) => {
          switch (e.feedType) {
            case 'talk': {
              const next = feed[i + 1]
              const wasCutOff =
                next?.feedType === 'interrupt' &&
                (next.target ?? next.interrupted) === e.speaker
              return <TalkRow key={i} event={e} wasCutOff={wasCutOff} onInfoClick={handleInfoClick} />
            }
            case 'confessional': return <ConfessionalRow key={i} event={e} />
            case 'interrupt':   return <InterruptRow   key={i} event={e} />
            case 'twist':       return <TwistBanner    key={i} event={e} />
            case 'course':      return <CourseDivider  key={i} event={e} />
            default:            return null
          }
        })}
      </div>
    </div>

    {activePersona && (
      <PersonaKnowledgeCard
        persona={activePersona}
        onClose={() => setActivePersonaName(null)}
      />
    )}
  </>
  )
}
