import { useSyncExternalStore, type ReactNode } from 'react'
import { cn } from './cn.js'

/** `system` follows the OS; `light` and `dark` are the viewer's override. */
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'mc-theme'

/** Inline this in `<head>`, before first paint: it puts the stored override on
 *  `<html>` as the `.light` or `.dark` class that tokens.css honours. */
export const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(KEY)});if(t==="light"||t==="dark")document.documentElement.classList.add(t)}catch(e){}`

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

// The class on `<html>` is the truth: the head script set it from storage.
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
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // Blocked storage: the override lasts the page.
  }
  listeners.forEach((listener) => listener())
}

/** The viewer's theme and a setter. Renders `system` on the server. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme)
  return { theme, setTheme: write }
}

const NEXT: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const NAMES: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

/** Lucide's `monitor`, `sun` and `moon` on a 24-unit square, under the ISC
 *  license in LICENSES/ISC.txt. */
const ICONS: Record<Theme, ReactNode> = {
  system: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  dark: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
}

/** A round button fixed at the bottom of the viewport: the current theme's
 *  icon, its name on hover or focus, and a click to the next of system, light,
 *  dark. Render it once per page, from the layout; hydrate it alone. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const name = NAMES[theme]
  return (
    <button
      type="button"
      className={cn('mc-theme-toggle', className)}
      aria-label={`Theme: ${name}. Switch to ${NAMES[NEXT[theme]]}`}
      onClick={() => setTheme(NEXT[theme])}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[theme]}
      </svg>
      <span className="mc-theme-toggle-name">{name}</span>
    </button>
  )
}
