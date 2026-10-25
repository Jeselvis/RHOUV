import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { EpisodeProvider } from './hooks/useEpisode'
import EpisodePage from './pages/EpisodePage'
import EvalPage from './pages/EvalPage'

export default function App() {
  return (
    <EpisodeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<EpisodePage />} />
          <Route path="/eval" element={<EvalPage />} />
        </Routes>
      </BrowserRouter>
    </EpisodeProvider>
  )
}
