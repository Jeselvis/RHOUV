import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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
        {persona.side_hustle && (
          <div
            style={{
              background: 'rgba(160,124,52,.08)',
              border: '1px solid rgba(160,124,52,.25)',
              borderRadius: 4,
              padding: '7px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--gold-text)' }}>
              Brand
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              {persona.side_hustle.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
              {persona.side_hustle.category}
            </div>
            <div style={{ fontSize: 10, fontStyle: 'italic', color: '#6b7a8d' }}>
              {persona.side_hustle.status}
            </div>
          </div>
        )}
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
            {event.content.split('\n').filter(Boolean).map((line, i) => (
              <p key={i} style={{ margin: '0 0 6px 0' }}>{line}</p>
            ))}
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
            {event.content.split('\n').filter(Boolean).map((line, i) => (
              <p key={i} style={{ margin: '0 0 6px 0' }}>{line}</p>
            ))}
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

const DRAMA_CLASS_LABELS = {
  targeted: 'TARGETED',
  area:     'AREA / FLIP',
  exit:     'EXIT',
  scene:    'SCENE',
}

const DRAMA_CLASS_COLORS = {
  targeted: '#a3262b',
  area:     '#8b3a00',
  exit:     '#6b5200',
  scene:    '#5a3a6b',
}

function DramaRow({ event }) {
  const cls = event.action_class ?? 'scene'
  const label = DRAMA_CLASS_LABELS[cls] ?? cls.toUpperCase()
  const color = DRAMA_CLASS_COLORS[cls] ?? '#a3262b'
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0,1fr) auto',
        gap: 12,
        alignItems: 'start',
        borderLeft: `3px solid ${color}`,
        paddingLeft: 10,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          flexShrink: 0,
          ...avatarStyle(event.speaker, 40),
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.16em',
              textTransform: 'uppercase',
              color: '#fff',
              background: color,
              padding: '2px 6px',
              borderRadius: 2,
              flexShrink: 0,
            }}
          >
            {label}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            {event.speaker?.split(' ')[0]}
          </span>
          {event.target && (
            <>
              <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>→</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: color }}>
                {event.target?.split(' ')[0]}
              </span>
            </>
          )}
        </div>
        <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--ink)', lineHeight: 1.4 }}>
          {event.description}
        </div>
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

// ─── Audience tweet components ────────────────────────────────────────────────

function ApprovalBar({ value }) {
  // value: -2 to +2. Center at 0.
  const pct = ((value + 2) / 4) * 100
  const color = value >= 1 ? '#16a34a' : value <= -1 ? '#dc2626' : '#94a3b8'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ fontSize: 9, color: '#64748b', width: 44, letterSpacing: '.08em' }}>
        APPROVAL
      </div>
      <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            width: 2,
            height: 4,
            background: '#94a3b8',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: value >= 0 ? '50%' : `${pct}%`,
            width: `${Math.abs(value / 4) * 100}%`,
            height: 4,
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
      <div style={{ fontSize: 9, color: color, fontWeight: 700, width: 16, textAlign: 'right' }}>
        {value > 0 ? `+${value}` : value}
      </div>
    </div>
  )
}

function extractTweetText(raw) {
  if (!raw) return ''
  const s = raw.trim()
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s)
      if (typeof parsed.text === 'string') return parsed.text
    } catch (_) {}
    // Partial JSON — strip leading brace/key boilerplate
    const m = s.match(/"text"\s*:\s*"([\s\S]*?)(?:"|$)/)
    if (m) return m[1].replace(/\\"/g, '"')
  }
  return s
}

function AudienceTweetCard({ tweet, compact = false }) {
  const { handle, archetype, avatar_color, likes, approval, drama_satisfaction, target } = tweet
  const text = extractTweetText(tweet.text)
  return (
    <div
      style={{
        borderLeft: `3px solid ${avatar_color ?? '#7c3aed'}`,
        paddingLeft: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: avatar_color ?? '#7c3aed',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {(handle ?? '@?')[1]?.toUpperCase() ?? '?'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
            {handle}
          </span>
          <span style={{ fontSize: 10, color: '#64748b', lineHeight: 1 }}>{archetype}</span>
        </div>
        {likes != null && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
            ♡ {likes.toLocaleString()}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>{text}</div>
      {!compact && approval != null && <ApprovalBar value={approval} />}
    </div>
  )
}

function AudienceTweetGroup({ items }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      style={{
        borderRadius: 6,
        border: '1px solid #d4c6f0',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          background: '#ede9fa',
          border: 'none',
          padding: '7px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: '#6d28d9',
          }}
        >
          Social Reactions
        </span>
        <span style={{ fontSize: 10, color: '#7c3aed', opacity: 0.7 }}>
          {items.length} posts
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7c3aed' }}>
          {expanded ? '▴' : '▾'}
        </span>
      </button>
      {expanded && (
        <div
          style={{
            background: '#f5f3ff',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {items.map((tweet, i) => (
            <AudienceTweetCard key={i} tweet={tweet} />
          ))}
        </div>
      )}
    </div>
  )
}

function SideHustlePivotCard({ event }) {
  const old = event.old_hustle || {}
  const next = event.new_hustle || {}
  return (
    <div
      style={{
        borderLeft: '3px solid #b45309',
        paddingLeft: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '2px solid #b45309',
            flexShrink: 0,
            ...avatarStyle(event.speaker, 36),
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: '#fff',
                background: '#b45309',
                padding: '2px 6px',
                borderRadius: 2,
              }}
            >
              Brand Pivot
            </span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {event.speaker?.split(' ')[0]}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              brand score {event.brand_score}
            </span>
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#78716c',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>
          {old.name || '—'}{old.category ? ` · ${old.category}` : ''}
        </span>
        <span style={{ color: '#b45309', fontWeight: 700 }}>→</span>
        <span style={{ color: '#92400e', fontWeight: 600 }}>
          {next.name || '?'}{next.category ? ` · ${next.category}` : ''}
        </span>
      </div>
      {next.tagline && (
        <div style={{ fontSize: 12, color: '#78716c', fontStyle: 'italic' }}>
          &ldquo;{next.tagline}&rdquo;
        </div>
      )}
      {event.image_path && (
        <img
          src={event.image_path}
          alt={next.name}
          style={{
            width: '100%',
            height: 140,
            objectFit: 'cover',
            borderRadius: 4,
            marginTop: 2,
            display: 'block',
          }}
        />
      )}
    </div>
  )
}

function CastReadsTweetsCard({ event }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      style={{
        borderLeft: '3px solid #7c3aed',
        paddingLeft: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '2px solid #7c3aed',
            flexShrink: 0,
            ...avatarStyle(event.speaker, 36),
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: '#fff',
                background: '#7c3aed',
                padding: '2px 6px',
                borderRadius: 2,
              }}
            >
              Reads Tweets
            </span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {event.speaker?.split(' ')[0]}
            </span>
          </div>
          {event.audience_approval_avg != null && (
            <span style={{ fontSize: 10, color: '#64748b' }}>
              Avg approval:{' '}
              <span
                style={{
                  color: event.audience_approval_avg >= 0 ? '#16a34a' : '#dc2626',
                  fontWeight: 600,
                }}
              >
                {event.audience_approval_avg > 0 ? '+' : ''}{event.audience_approval_avg}
              </span>
            </span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--ink)', lineHeight: 1.45 }}>
        {event.text}
      </div>
      {event.notable_tweets?.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: '#7c3aed',
              padding: 0,
            }}
          >
            {expanded ? '▴ hide posts' : `▾ ${event.notable_tweets.length} notable posts`}
          </button>
          {expanded && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                paddingLeft: 8,
                borderLeft: '2px solid #d4c6f0',
              }}
            >
              {event.notable_tweets.map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Floating tweet overlay (live mode animation) ─────────────────────────────

function FloatingTweet({ tweet, onDone }) {
  const [phase, setPhase] = useState('in')      // 'in' | 'typing' | 'hold' | 'out'
  const [displayText, setDisplayText] = useState('')
  const fullText = tweet?.text ?? ''

  useEffect(() => {
    if (!tweet) return
    setDisplayText('')
    setPhase('in')
    const t1 = setTimeout(() => setPhase('typing'), 150)
    return () => clearTimeout(t1)
  }, [tweet])

  // Typewriter
  useEffect(() => {
    if (phase !== 'typing') return
    if (displayText.length >= fullText.length) {
      setPhase('hold')
      return
    }
    const t = setTimeout(() => setDisplayText(fullText.slice(0, displayText.length + 1)), 22)
    return () => clearTimeout(t)
  }, [phase, displayText, fullText])

  // Hold then out
  useEffect(() => {
    if (phase !== 'hold') return
    const t = setTimeout(() => setPhase('out'), 2500)
    return () => clearTimeout(t)
  }, [phase])

  // Done
  useEffect(() => {
    if (phase !== 'out') return
    const t = setTimeout(onDone, 450)
    return () => clearTimeout(t)
  }, [phase, onDone])

  if (!tweet) return null

  const opacity = phase === 'in' ? 0 : phase === 'out' ? 0 : 1
  const translateY = phase === 'in' ? 12 : phase === 'out' ? -10 : 0

  return (
    <div
      style={{
        position: 'fixed',
        top: 90,
        right: 24,
        width: 300,
        background: '#f5f3ff',
        border: `2px solid ${tweet.avatar_color ?? '#7c3aed'}`,
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(109,40,217,.25)',
        padding: '12px 14px',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: 'opacity 200ms ease, transform 200ms ease',
        pointerEvents: 'none',
      }}
    >
      <AudienceTweetCard tweet={{ ...tweet, text: displayText }} compact />
    </div>
  )
}

// Groups consecutive pre_dinner / lobby events with matching participants into
// a single { feedType: 'private_scene_group', sceneType, items } object so
// they render as one card with a single header instead of stacked repetitions.
function groupFeed(feed) {
  const out = []
  let i = 0
  while (i < feed.length) {
    const item = feed[i]
    if (item.feedType === 'pre_dinner' || item.feedType === 'lobby') {
      const sceneType = item.feedType
      const pKey = JSON.stringify((item.participants ?? []).slice().sort())
      const group = [item]
      let j = i + 1
      while (
        j < feed.length &&
        feed[j].feedType === sceneType &&
        JSON.stringify((feed[j].participants ?? []).slice().sort()) === pKey
      ) {
        group.push(feed[j])
        j++
      }
      out.push({ feedType: 'private_scene_group', sceneType, items: group })
      i = j
    } else if (item.feedType === 'audience_tweet') {
      // Group consecutive audience tweets (same trigger batch)
      const group = [item]
      let j = i + 1
      while (j < feed.length && feed[j].feedType === 'audience_tweet') {
        group.push(feed[j])
        j++
      }
      out.push({ feedType: 'audience_group', items: group })
      i = j
    } else {
      out.push(item)
      i++
    }
  }
  return out
}

function PrivateSceneGroup({ group }) {
  const { sceneType, items } = group
  const isPreDinner = sceneType === 'pre_dinner'
  const headerLabel = isPreDinner ? 'Before Dinner' : 'Lobby'
  const first = items[0] ?? {}
  const participants = Array.isArray(first.participants)
    ? first.participants.map((n) => n.split(' ')[0]).join(' + ')
    : ''
  return (
    <div
      style={{
        borderRadius: 6,
        border: '1px solid #b9cddb',
        overflow: 'hidden',
      }}
    >
      {/* Scene header */}
      <div
        style={{
          background: '#c8dbe8',
          padding: '7px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--sapphire)',
          }}
        >
          {headerLabel}
        </span>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.06em',
            color: '#2a43a6',
            opacity: 0.7,
          }}
        >
          — private
        </span>
        {participants && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              fontWeight: 600,
              color: '#1b2330',
              opacity: 0.6,
            }}
          >
            {participants}
          </span>
        )}
      </div>

      {/* Lines */}
      <div
        style={{
          background: '#dfeaf2',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {items.map((e, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--sapphire)',
                letterSpacing: '.04em',
              }}
            >
              {e.speaker?.split(' ')[0]}
            </span>
            <div
              style={{
                fontSize: 13,
                color: 'var(--ink)',
                lineHeight: 1.5,
              }}
            >
              {(e.content ?? '').split('\n').filter(Boolean).map((line, li) => (
                <p key={li} style={{ margin: '0 0 4px 0' }}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LobbyReturnRow({ event }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 0',
        color: '#4a6080',
        fontSize: 12,
        fontStyle: 'italic',
      }}
    >
      <div style={{ flex: 1, height: 1, background: '#b9cddb' }} />
      <span>{event.speaker?.split(' ')[0]} returns to the table</span>
      <div style={{ flex: 1, height: 1, background: '#b9cddb' }} />
    </div>
  )
}

export default function EpisodeFeed() {
  const { feed, personas, mode } = useEpisode()
  const scrollRef = useRef(null)
  const [activePersonaName, setActivePersonaName] = useState(null)
  const groupedFeed = useMemo(() => groupFeed(feed), [feed])

  // ── Floating tweet animation (live mode only) ────────────────────────────
  const floatQueueRef = useRef([])
  const [floatingTweet, setFloatingTweet] = useState(null)
  const isAnimating = useRef(false)

  const advanceQueue = useCallback(() => {
    if (floatQueueRef.current.length === 0) {
      setFloatingTweet(null)
      isAnimating.current = false
      return
    }
    const next = floatQueueRef.current.shift()
    setFloatingTweet(next)
    isAnimating.current = true
  }, [])

  // Track last seen feed length to detect new audience tweets
  const prevFeedLenRef = useRef(0)
  useEffect(() => {
    if (mode !== 'live') return
    const newItems = feed.slice(prevFeedLenRef.current)
    prevFeedLenRef.current = feed.length
    const newTweets = newItems.filter((e) => e.feedType === 'audience_tweet')
    if (newTweets.length === 0) return
    floatQueueRef.current.push(...newTweets)
    if (!isAnimating.current) advanceQueue()
  }, [feed, mode, advanceQueue])

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
        {groupedFeed.map((e, i) => {
          switch (e.feedType) {
            case 'talk': {
              const next = groupedFeed[i + 1]
              const wasCutOff =
                next?.feedType === 'interrupt' &&
                (next.target ?? next.interrupted) === e.speaker
              return <TalkRow key={i} event={e} wasCutOff={wasCutOff} onInfoClick={handleInfoClick} />
            }
            case 'confessional':        return <ConfessionalRow   key={i} event={e} />
            case 'interrupt':           return <InterruptRow      key={i} event={e} />
            case 'twist':               return <TwistBanner       key={i} event={e} />
            case 'course':              return <CourseDivider     key={i} event={e} />
            case 'drama':               return <DramaRow          key={i} event={e} />
            case 'private_scene_group': return <PrivateSceneGroup   key={i} group={e} />
            case 'lobby_return':        return <LobbyReturnRow      key={i} event={e} />
            case 'audience_group':      return <AudienceTweetGroup  key={i} items={e.items} />
            case 'cast_reads_tweets':   return <CastReadsTweetsCard  key={i} event={e} />
            case 'hustle_pivot':        return <SideHustlePivotCard  key={i} event={e} />
            default:                    return null
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

    {floatingTweet && (
      <FloatingTweet tweet={floatingTweet} onDone={advanceQueue} />
    )}
  </>
  )
}
