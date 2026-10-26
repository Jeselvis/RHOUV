// Sprite positions for cropping avatars/portraits from the title card image.
// IMG_W = 1424px (original image width), FACE_Y = 270px (vertical center of faces).
const IMG_W = 1424
const FACE_Y = 270

// Face centre X per character, left→right order matches title_card_position.
const POSITIONS = {
  'Vivienne Davenport': { fx: 178, hue: 75 },
  'Cassandra Cole':     { fx: 394, hue: 20 },
  'Bianca Noel':        { fx: 608, hue: 150 },
  'Diane Wentworth':    { fx: 822, hue: 200 },
  'Petra Voss':         { fx: 1043, hue: 265 },
  'Madison Fleur':      { fx: 1258, hue: 330 },
}

// First name → full name lookup for alliance inference.
export const FIRST_NAME_MAP = {
  Vivienne: 'Vivienne Davenport',
  Cassandra: 'Cassandra Cole',
  Bianca: 'Bianca Noel',
  Diane: 'Diane Wentworth',
  Petra: 'Petra Voss',
  Madison: 'Madison Fleur',
}

export const CAST_ORDER = [
  'Vivienne Davenport',
  'Cassandra Cole',
  'Bianca Noel',
  'Diane Wentworth',
  'Petra Voss',
  'Madison Fleur',
]

/** Circle avatar (40px, 32px, 44px, 22px supported). */
export function avatarStyle(name, size) {
  const pos = POSITIONS[name]
  if (!pos) return {}
  const k = size / 50
  return {
    backgroundImage: "url('/title-card.webp')",
    backgroundSize: `${IMG_W * k}px auto`,
    backgroundPosition: `${-(pos.fx * k - size / 2)}px ${-(FACE_Y * k - size / 2)}px`,
    backgroundRepeat: 'no-repeat',
  }
}

const PORTRAIT_FILES = {
  'Vivienne Davenport': '/images/vivienne.jpg',
  'Cassandra Cole':     '/images/cassandra.webp',
  'Bianca Noel':        '/images/bianca.webp',
  'Diane Wentworth':    '/images/diane.webp',
  'Petra Voss':         '/images/petra.webp',
  'Madison Fleur':      '/images/madison.webp',
}

/** Portrait (230px tall card image). */
export function portraitStyle(name) {
  const file = PORTRAIT_FILES[name]
  if (!file) return {}
  return {
    backgroundImage: `url('${file}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat',
  }
}

/** oklch persona color. */
export function personaColor(name) {
  const pos = POSITIONS[name]
  return pos ? `oklch(0.58 0.13 ${pos.hue})` : '#888'
}

// Course name display map (engine keys → human labels)
export const COURSE_LABELS = {
  appetizer: 'Amuse-bouche',
  entree: 'Entrée',
  main: 'Main',
  dessert: 'Dessert',
}

export function courseLabel(key) {
  return COURSE_LABELS[key] ?? key
}

// Composure state thresholds
export function composureState(value) {
  if (value >= 70) return { label: 'normal',   color: '#2a43a6' }
  if (value >= 45) return { label: 'irritated', color: '#9a7428' }
  if (value >= 20) return { label: 'slipping',  color: '#c0612a' }
  return             { label: 'gone',       color: '#b2393f' }
}

// Brand tier badge
export function brandTier(score) {
  if (score >= 800) return { label: 'Diamond', bg: '#1b2330',  fg: '#dfe8f5' }
  if (score >= 700) return { label: 'Gold',    bg: '#f3e2ac',  fg: '#4a360c' }
  if (score >= 600) return { label: 'Silver',  bg: '#e2e6ea',  fg: '#3d4a5a' }
  return                   { label: 'Bronze',  bg: '#ecd3bd',  fg: '#5c3312' }
}
