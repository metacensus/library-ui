import { useSyncExternalStore } from 'react'
import { cn } from './cn.js'
import { Float } from './Float.js'
import { Checkbox, RadioGroup } from './form.js'

/** `system` follows the OS; `light` and `dark` are the viewer's override. */
export type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'mc-theme'
const MOTION_KEY = 'mc-motion'
const REDUCE = '(prefers-reduced-motion: reduce)'

/** Inline this in `<head>`, before first paint: it puts the stored theme on
 *  `<html>` as the `.light` or `.dark` class that tokens.css honours, and
 *  `.still` when animations are stopped, by the viewer or by the OS's
 *  `prefers-reduced-motion`. */
export const displayScript = `var r=document.documentElement,g=function(k){try{return localStorage.getItem(k)}catch(e){}},t=g(${JSON.stringify(THEME_KEY)}),m=g(${JSON.stringify(MOTION_KEY)});if(t==="light"||t==="dark")r.classList.add(t);if(m==="still"||m!=="full"&&matchMedia(${JSON.stringify(REDUCE)}).matches)r.classList.add("still")`

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Blocked storage: the choice lasts the page.
  }
}

// The classes on `<html>` are the truth: the head script set them from storage.
function read(): Theme {
  const classes = document.documentElement.classList
  return classes.contains('dark')
    ? 'dark'
    : classes.contains('light')
      ? 'light'
      : 'system'
}

function write(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (theme !== 'system') root.classList.add(theme)
  store(THEME_KEY, theme === 'system' ? null : theme)
  listeners.forEach((listener) => listener())
}

/** The viewer's theme and a setter. Renders `system` on the server. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme)
  return { theme, setTheme: write }
}

const readStill = () => document.documentElement.classList.contains('still')

function writeStill(still: boolean) {
  document.documentElement.classList.toggle('still', still)
  // Only a choice against the OS's is kept.
  store(
    MOTION_KEY,
    still === matchMedia(REDUCE).matches ? null : still ? 'still' : 'full',
  )
  listeners.forEach((listener) => listener())
}

/** Whether animations are stopped, and a setter; `:root.still` is the same
 *  state for CSS. Renders `false` on the server. */
export function useStill() {
  const still = useSyncExternalStore(subscribe, readStill, () => false)
  return { still, setStill: writeStill }
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** A round button fixed at the viewport's bottom-left corner. Hover, focus or a
 *  tap opens a panel above it with the theme and a switch that stops
 *  animations; Escape, moving away or a tap elsewhere closes it. Render it once
 *  per page, from the layout; hydrate it alone. */
export function DisplayControls({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const { still, setStill } = useStill()
  return (
    <Float
      className={cn('mc-display', className)}
      label="Display"
      icon={
        /* Lucide's `sliders-horizontal`, under the ISC license in
           LICENSES/ISC.txt. */
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
          <path d="M14 2v4M8 10v4M16 18v4" />
        </svg>
      }
    >
      <RadioGroup
        legend="Theme"
        name="mc-display-theme"
        options={THEME_OPTIONS}
        value={theme}
        onChange={(value) => setTheme(value as Theme)}
      />
      <Checkbox
        label="Stop animations"
        checked={still}
        onChange={(e) => setStill(e.target.checked)}
      />
    </Float>
  )
}
