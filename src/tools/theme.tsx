import { useSyncExternalStore } from 'react'
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

/** A button that cycles system, light, dark. Hydrate it alone. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <button
      type="button"
      className={cn('mc-theme-toggle', className)}
      onClick={() => setTheme(NEXT[theme])}
    >
      Theme: {theme}
    </button>
  )
}
