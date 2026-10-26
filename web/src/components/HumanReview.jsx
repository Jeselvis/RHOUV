import { useEffect, useState } from 'react'

const QUESTIONS = [
  { id: 'in_character',    text: 'Personalities stayed in character' },
  { id: 'state_shift',     text: 'Behavior visibly shifted as composure dropped' },
  { id: 'judge_alignment', text: "Judge's final ranking matched my intuition" },
  { id: 'drama_quality',   text: 'Interrupts felt dramatically earned' },
  { id: 'secret_web',      text: 'Hidden knowledge seemed to shape the conversation' },
]

const LABELS = ['', 'Disagree', 'Somewhat', 'Neutral', 'Agree', 'Strongly']

function StarRow({ value, onChange }) {
  const [hover, setHover] = useState(null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onChange(n === value ? null : n)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 2px',
            fontSize: 17,
            lineHeight: 1,
            color: n <= (hover ?? value ?? 0) ? '#b48a35' : 'rgba(27,35,48,.18)',
            transition: 'color .1s',
          }}
        >
          ★
        </button>
      ))}
      <span style={{ fontSize: 10, color: 'var(--ink-muted)', marginLeft: 5, minWidth: 52 }}>
        {(hover ?? value) ? LABELS[hover ?? value] : ''}
      </span>
    </div>
  )
}

const storageKey = (file) => `rhouv_review_${file}`

export function loadReview(file) {
  try {
    const raw = localStorage.getItem(storageKey(file))
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}

export default function HumanReview({ file, onClose }) {
  const [ratings, setRatings] = useState({})
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const stored = loadReview(file)
    if (stored) {
      setRatings(stored.ratings ?? {})
      setNotes(stored.notes ?? '')
    } else {
      setRatings({})
      setNotes('')
    }
    setSaved(false)
  }, [file])

  const save = () => {
    localStorage.setItem(
      storageKey(file),
      JSON.stringify({ ratings, notes, file, savedAt: new Date().toISOString() })
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 72,
        right: 24,
        width: 320,
        background: 'var(--panel-bg)',
        border: 'var(--panel-border)',
        borderRadius: 'var(--panel-radius)',
        boxShadow: '0 8px 40px rgba(20,40,80,.2)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 96px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '13px 16px',
          borderBottom: 'var(--panel-header-border)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '.18em',
            color: 'var(--gold-text)',
          }}
        >
          Human Review
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
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '14px 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 13,
          overflowY: 'auto',
        }}
      >
        {QUESTIONS.map((q) => (
          <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.35 }}>{q.text}</div>
            <StarRow
              value={ratings[q.id] ?? null}
              onChange={(v) =>
                setRatings((r) => {
                  const next = { ...r }
                  if (v === null) delete next[q.id]
                  else next[q.id] = v
                  return next
                })
              }
            />
          </div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
          <div style={{ fontSize: 12, color: 'var(--ink)' }}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observations, surprises, patterns…"
            rows={3}
            style={{
              fontSize: 12,
              color: 'var(--ink)',
              background: 'rgba(255,255,255,.6)',
              border: '1px solid rgba(160,124,52,.3)',
              borderRadius: 3,
              padding: '7px 9px',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.45,
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={save}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '.1em',
            padding: '9px 0',
            borderRadius: 3,
            cursor: 'pointer',
            border: `1px solid ${saved ? 'rgba(45,106,79,.4)' : 'var(--gold-border)'}`,
            background: saved ? 'rgba(45,106,79,.1)' : 'var(--gold-btn-grad)',
            color: saved ? '#2d6a4f' : 'var(--gold-btn-text)',
            transition: 'all .15s',
          }}
        >
          {saved ? 'Saved ✓' : 'Save Review'}
        </button>
      </div>
    </div>
  )
}
