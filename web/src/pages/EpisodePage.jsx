import { useState } from 'react'
import AllianceGraph from '../components/AllianceGraph'
import BrandLeaderboard from '../components/BrandLeaderboard'
import ComposureMeter from '../components/ComposureMeter'
import CourseStrip from '../components/CourseStrip'
import EpisodeFeed from '../components/EpisodeFeed'
import Header from '../components/Header'
import OpeningCredits from '../components/OpeningCredits'
import ReplayControls from '../components/ReplayControls'
import { useEpisode } from '../hooks/useEpisode'

export default function EpisodePage() {
  const { mode } = useEpisode()
  const [started, setStarted] = useState(false)

  if (!started && mode !== 'live') {
    return <OpeningCredits onBegin={() => setStarted(true)} />
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
    </div>
  )
}
