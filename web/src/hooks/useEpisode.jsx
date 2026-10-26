import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CAST_ORDER, FIRST_NAME_MAP } from '../castConfig'

const SPEED_DELAYS = { '0.5×': 600, '1×': 300, '2×': 150, '4×': 75 }

// ─── Alliance inference ──────────────────────────────────────────────────────

// a little heavy handed for a page that uses the same stuff, cleaner
// would be just have a state call at the top and passing down or set context provider at the top
// and then consume in the components that need it. But this is a fine for now.
// further complexity would need ot be state manageed in zustand or others

function inferAlliances(events) {
  // edge map: "A|B" → { weight, type }
  const map = {}

  const addEdge = (a, b, delta, type) => {
    const key = [a, b].sort().join('|')
    if (!map[key]) map[key] = { weight: 0, type }
    map[key].weight += delta
    // feud overrides ally
    if (type === 'feud') map[key].type = 'feud'
  }

  for (const e of events) {
    if (e.type === 'table_talk' && e.content) {
      const speakerFirst = (e.speaker ?? '').split(' ')[0]
      for (const [fname, fullname] of Object.entries(FIRST_NAME_MAP)) {
        if (fname !== speakerFirst && e.content.includes(fname)) {
          addEdge(e.speaker, fullname, 1, 'ally')
        }
      }
    }
    if (e.type === 'interrupt' && e.interruptor && e.target) {
      addEdge(e.interruptor, e.target, 2, 'feud')
    }
  }

  return Object.entries(map)
    .filter(([, { weight }]) => weight > 0)
    .map(([key, { weight, type }]) => {
      const [a, b] = key.split('|')
      return { a, b, weight: Math.min(weight * 0.6, 6), type }
    })
}

// ─── State derivation ────────────────────────────────────────────────────────

function deriveState(events, personas) {
  const brand = {}
  const composure = {}
  const personaList = Array.isArray(personas) ? personas : []
  for (const p of personaList) {
    brand[p.name] = { score: 100, delta: 0 }
    composure[p.name] = { value: 100, delta: 0 }
  }
  // Also seed with CAST_ORDER in case personas not loaded yet
  for (const name of CAST_ORDER) {
    if (!brand[name]) brand[name] = { score: 100, delta: 0 }
    if (!composure[name]) composure[name] = { value: 100, delta: 0 }
  }

  const feed = []
  let course = null

  for (const e of events) {
    switch (e.type) {
      case 'table_talk':
        feed.push({ feedType: 'talk', ...e })
        break
      case 'confessional':
        feed.push({ feedType: 'confessional', ...e })
        break
      case 'course_transition':
        course = e.course
        // Only add to feed if there are prior events (not a start-of-run emit)
        if (feed.length > 0) feed.push({ feedType: 'course', ...e })
        break
      case 'brand_delta':
        if (e.speaker) brand[e.speaker] = { score: e.score ?? 100, delta: e.delta ?? 0 }
        break
      case 'composure_delta':
        if (e.speaker) composure[e.speaker] = { value: e.composure ?? 100, delta: e.delta ?? 0 }
        break
      case 'interrupt':
        feed.push({ feedType: 'interrupt', ...e })
        break
      case 'twist':
        feed.push({ feedType: 'twist', ...e })
        break
      default:
        break
    }
  }

  const edges = inferAlliances(events)
  return { feed, brand, composure, edges, course }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useEpisodeState() {
  const [mode, setMode] = useState('replay')
  const [file, setFile] = useState(null)
  const [allEvents, setAllEvents] = useState([])
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState('1×')
  const [personas, setPersonas] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(false)
  const [isFilming, setIsFilming] = useState(false)

  const refreshRuns = useCallback(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) return
        setRuns(list)
        if (list.length > 0) setFile(list[list.length - 1])
      })
      .catch(() => {})
  }, [])

  // Load personas + runs on mount
  useEffect(() => {
    fetch('/api/personas')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPersonas(data) })
      .catch(() => {})
    refreshRuns()
  }, [])

  // Load events when file changes
  const loadFile = useCallback(async (fileName) => {
    setLoading(true)
    setPlaying(false)
    setCursor(0)
    setAllEvents([])
    try {
      const events = await fetch(
        `/api/events?file=${encodeURIComponent(fileName)}`
      ).then((r) => r.json())
      setAllEvents(events)
      setFile(fileName)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load when file changes (including initial set from /runs)
  const prevFileRef = useRef(null)
  useEffect(() => {
    if (file && file !== prevFileRef.current) {
      prevFileRef.current = file
      loadFile(file)
    }
  }, [file, loadFile])

  // ── Filming: poll /run/status every 3s ────────────────────────────────────
  // When a run starts, auto-switch to live mode and load the live file.
  // When it ends, refresh the runs list.
  const wasFilmingRef = useRef(false)
  useEffect(() => {
    const poll = () => {
      fetch('/api/run/status')
        .then((r) => r.json())
        .then(({ running, file: liveFile }) => {
          setIsFilming(running)
          if (running) {
            setMode('live')
            if (liveFile && liveFile !== prevFileRef.current) {
              prevFileRef.current = liveFile
              setFile(liveFile)
              setCursor(0)
              setAllEvents([])
            }
          } else if (wasFilmingRef.current) {
            // Just finished — refresh so the completed file appears in the list
            refreshRuns()
            setMode('replay')
          }
          wasFilmingRef.current = running
        })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [refreshRuns])

  // ── Live event polling: fetch new events every 2s while filming ───────────
  // Auto-advances cursor to the latest event so the feed stays current.
  useEffect(() => {
    if (!isFilming || !file) return
    const poll = setInterval(() => {
      fetch(`/api/events?file=${encodeURIComponent(file)}`)
        .then((r) => r.json())
        .then((events) => {
          if (!Array.isArray(events)) return
          setAllEvents((prev) => {
            if (events.length > prev.length) {
              setCursor(events.length)
              return events
            }
            return prev
          })
        })
        .catch(() => {})
    }, 2000)
    return () => clearInterval(poll)
  }, [isFilming, file])

  // ── Start a new run via the API ────────────────────────────────────────────
  const startRun = useCallback(async ({ personalities = 6, fast = false } = {}) => {
    const params = new URLSearchParams({ personalities, fast })
    const res = await fetch(`/api/run?${params}`, { method: 'POST' })
    if (!res.ok) throw new Error(await res.text())
    return res.json() // { status, file }
  }, [])

  // Playback timer
  useEffect(() => {
    if (!playing) return
    if (cursor >= allEvents.length) {
      setPlaying(false)
      return
    }
    const delay = SPEED_DELAYS[speed] ?? 300
    const timer = setTimeout(() => setCursor((c) => c + 1), delay)
    return () => clearTimeout(timer)
  }, [playing, cursor, allEvents.length, speed])

  // Derived state
  const { feed, brand, composure, edges, course } = useMemo(
    () => deriveState(allEvents.slice(0, cursor), personas),
    [allEvents, cursor, personas]
  )

  // Twist marker positions (for scrub bar)
  const twistPositions = useMemo(
    () => allEvents.map((e, i) => (e.type === 'twist' ? i : null)).filter((x) => x !== null),
    [allEvents]
  )

  const togglePlay = useCallback(() => setPlaying((p) => !p), [])

  return {
    // Mode
    mode, setMode,
    // Filming
    isFilming, startRun,
    // File / loading
    file, setFile: loadFile,
    runs, refreshRuns,
    loading,
    // Events
    allEvents,
    total: allEvents.length,
    cursor, setCursor,
    // Playback
    playing, setPlaying, togglePlay,
    speed, setSpeed,
    twistPositions,
    // Personas
    personas,
    // Derived
    feed, brand, composure, edges, course,
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const EpisodeContext = createContext(null)

export function EpisodeProvider({ children }) {
  const state = useEpisodeState()
  return <EpisodeContext.Provider value={state}>{children}</EpisodeContext.Provider>
}

export function useEpisode() {
  const ctx = useContext(EpisodeContext)
  if (!ctx) throw new Error('useEpisode must be used inside EpisodeProvider')
  return ctx
}
