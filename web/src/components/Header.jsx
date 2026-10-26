import { Link, useLocation } from 'react-router-dom'
import { useEpisode } from '../hooks/useEpisode'

const logoStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 17,
  lineHeight: 1.1,
  letterSpacing: '.06em',
  background: 'linear-gradient(180deg,#e2c272 0%,#a87f2f 60%,#7d5a1c 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
}

export default function Header() {
  const { isFilming, file, setFile, runs, loading } = useEpisode()
  const location = useLocation()
  const onEvalPage = location.pathname === '/eval'

  const navLink = (label, to, active) => ({
    fontFamily: 'var(--font-display)',
    fontSize: 14,
    letterSpacing: '.16em',
    color: active ? 'var(--ink)' : 'var(--ink-muted)',
    paddingBottom: 4,
    borderBottom: active ? '2px solid var(--gold-fill)' : '2px solid transparent',
    textDecoration: 'none',
  })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 32px',
        borderBottom: '1px solid rgba(160,124,52,.3)',
      }}
    >
      {/* Left: logo + nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <Link to="/" style={logoStyle}>
          The Real Housewives
          <br />
          of Uncanny Valley
        </Link>
        <div style={{ display: 'flex', gap: 28 }}>
          <Link to="/" style={navLink('Episode', '/', !onEvalPage)}>
            Episode
          </Link>
          <Link to="/eval" style={navLink('Eval', '/eval', onEvalPage)}>
            Eval
          </Link>
        </div>
      </div>

      {/* Right: live badge / episode picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {isFilming && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '.14em',
              color: '#a3262b',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--live-dot)',
                animation: 'livepulse 1.4s infinite',
                display: 'inline-block',
              }}
            />
            FILMING
          </div>
        )}

        {!isFilming && runs.length > 0 && (
          <select
            value={file ?? ''}
            onChange={(e) => setFile(e.target.value)}
            disabled={loading}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: '#33404f',
              background: 'rgba(255,255,255,.6)',
              border: '1px solid rgba(160,124,52,.3)',
              borderRadius: 3,
              padding: '8px 12px',
              cursor: 'pointer',
              maxWidth: 280,
            }}
          >
            {runs.map((r, i) => (
              <option key={r} value={r}>
                Episode {i + 1}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
