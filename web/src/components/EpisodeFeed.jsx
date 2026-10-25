import { useEffect, useRef } from 'react'
import { useEpisode } from '../hooks/useEpisode'
import { avatarStyle, courseLabel } from '../castConfig'

function TalkRow({ event, wasCutOff }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0,1fr) auto',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: wasCutOff ? '1.5px solid #a3262b' : '1.5px solid var(--gold-fill-2)',
          flexShrink: 0,
          ...avatarStyle(event.speaker, 40),
        }}
      />
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
  const { feed } = useEpisode()
  const bottomRef = useRef(null)

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feed.length])

  return (
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
              return <TalkRow key={i} event={e} wasCutOff={wasCutOff} />
            }
            case 'confessional': return <ConfessionalRow key={i} event={e} />
            case 'interrupt':   return <InterruptRow   key={i} event={e} />
            case 'twist':       return <TwistBanner    key={i} event={e} />
            case 'course':      return <CourseDivider  key={i} event={e} />
            default:            return null
          }
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
