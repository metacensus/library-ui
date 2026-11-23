import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from './cn.js'

/** A round icon button fixed to the viewport, with a panel beside it. Hover,
 *  focus or a tap opens the panel; Escape, moving away or a tap elsewhere
 *  closes it, and Escape returns focus to the button. Where it sits is the
 *  caller's class. */
export function Float({
  className,
  label,
  icon,
  children,
}: {
  className?: string
  label: string
  icon: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.mc-float')) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div
      className={cn('mc-float', className)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
      onFocus={() => setOpen(true)}
      // Safari does not focus a control it is clicked on: no `relatedTarget`
      // means focus went nowhere a page can name, not that it left.
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget))
          setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        button.current?.focus()
        setOpen(false)
      }}
    >
      <button
        ref={button}
        type="button"
        className="mc-float-button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {icon}
      </button>
      <div className="mc-float-panel" hidden={!open}>
        {children}
      </div>
    </div>
  )
}
