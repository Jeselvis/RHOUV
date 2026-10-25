import { useEpisode } from '../hooks/useEpisode'
import { courseLabel } from '../castConfig'

// Derive ordered courses from the run events
function useCourseList(allEvents) {
  const seen = []
  for (const e of allEvents) {
    const c = e.course ?? (e.type === 'course_transition' ? e.course : null)
    if (c && !seen.includes(c)) seen.push(c)
  }
  return seen
}

export default function CourseStrip() {
  const { course, allEvents } = useEpisode()
  const courseList = useCourseList(allEvents)
  if (!courseList.length) return null

  const currentIdx = courseList.indexOf(course)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '14px 32px',
        borderBottom: '1px solid rgba(160,124,52,.2)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          letterSpacing: '.2em',
          color: 'var(--gold-text)',
          whiteSpace: 'nowrap',
        }}
      >
        {course
          ? `Course ${currentIdx + 1} of ${courseList.length} · ${courseLabel(course)}`
          : 'Loading…'}
      </div>

      {/* Progress bar — one segment per course */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${courseList.length}, 1fr)`,
          gap: 4,
        }}
      >
        {courseList.map((c, i) => {
          let bg
          if (i < currentIdx) {
            bg = 'var(--gold-fill)'
          } else if (i === currentIdx) {
            bg = 'linear-gradient(90deg, var(--gold-fill) 55%, rgba(160,124,52,.25) 55%)'
          } else {
            bg = 'rgba(160,124,52,.25)'
          }
          return (
            <div
              key={c}
              style={{ height: 3, background: bg, borderRadius: 2 }}
            />
          )
        })}
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--ink-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {courseList.map(courseLabel).join(' · ')}
      </div>
    </div>
  )
}
