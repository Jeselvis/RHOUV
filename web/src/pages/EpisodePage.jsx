import { useState } from 'react'
import AllianceGraph from '../components/AllianceGraph'
import BrandLeaderboard from '../components/BrandLeaderboard'
import ComposureMeter from '../components/ComposureMeter'
import CourseStrip from '../components/CourseStrip'
import EpisodeFeed from '../components/EpisodeFeed'
import Header from '../components/Header'
import HumanReview from '../components/HumanReview'
import OpeningCredits from '../components/OpeningCredits'
import ReplayControls from '../components/ReplayControls'
import { useEpisode } from '../hooks/useEpisode'

export default function EpisodePage() {
  const { mode, file } = useEpisode()
  const [started, setStarted] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  if (!started && mode !== 'live') {
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
        <OpeningCredits onBegin={() => setStarted(true)} />
      </div>
    )
  }

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
      <CourseStrip />

      {/* Main grid */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 440px',
          gap: 24,
          padding: '24px 32px',
          minHeight: 0,
        }}
      >
        {/* Left: feed (full height) */}
        <EpisodeFeed />

        {/* Right: leaderboard + composure + alliances */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <BrandLeaderboard />
          <ComposureMeter />
          <AllianceGraph />
        </div>
      </div>

      <ReplayControls />

      {/* Rate Episode button — fixed, stays put while feed scrolls */}
      {file && (
        <button
          onClick={() => setReviewOpen((o) => !o)}
          style={{
            position: 'fixed',
            bottom: 76,
            right: 24,
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '.1em',
            color: reviewOpen ? 'var(--gold-text)' : '#3d4a5a',
            background: reviewOpen ? 'rgba(180,138,53,.1)' : 'rgba(255,255,255,.88)',
            border: `1px solid ${reviewOpen ? 'var(--gold-border)' : 'rgba(160,124,52,.35)'}`,
            borderRadius: 3,
            padding: '8px 14px',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(20,40,80,.12)',
            zIndex: 190,
            transition: 'all .15s',
          }}
        >
          Rate Episode
        </button>
      )}

      {reviewOpen && file && (
        <HumanReview file={file} onClose={() => setReviewOpen(false)} />
      )}
    </div>
  )
}
