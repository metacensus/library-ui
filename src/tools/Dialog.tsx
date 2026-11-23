import {
  useEffect,
  useId,
  useRef,
  type DialogHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Button } from './Button.js'
import { cn } from './cn.js'

type Naming =
  { title: ReactNode; label?: undefined } | { title?: undefined; label: string }

type DialogProps = Naming &
  Omit<
    DialogHTMLAttributes<HTMLDialogElement>,
    'open' | 'title' | 'onClose'
  > & {
    open: boolean
    /** Called when the dialog closes by Escape, the close control or a press
     *  on the backdrop; not when `open` goes false. */
    onClose: () => void
    closeLabel?: ReactNode
  }

/** A modal on the native `<dialog>`: the browser gives the inert background,
 *  Escape and the top layer, and this returns focus to the opener. `open` is
 *  the parent's truth: set it false in `onClose`. A `title` is the visible heading and names the dialog;
 *  without one, `label` does. */
export function Dialog({
  open,
  onClose,
  title,
  label,
  closeLabel = 'Close',
  className,
  children,
  ...props
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)
  const closing = useRef(false)
  const pressedOutside = useRef(false)
  const headingId = useId()

  useEffect(() => {
    const dialog = ref.current!
    if (open && !dialog.open) {
      opener.current = document.activeElement
      dialog.showModal()
    } else if (!open && dialog.open) {
      // The close event this raises is the parent's own doing; `closed` skips it.
      closing.current = true
      dialog.close()
    }
  }, [open])

  const closed = () => {
    const back = opener.current
    opener.current = null
    if (back instanceof HTMLElement && back.isConnected)
      back.focus({ preventScroll: true })
    if (closing.current) closing.current = false
    else onClose()
  }

  // The backdrop is the dialog element itself, outside its box.
  const outside = (event: MouseEvent<HTMLDialogElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return (
      event.target === event.currentTarget &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
  }

  return (
    <dialog
      {...props}
      ref={ref}
      className={cn('mc-dialog', className)}
      aria-labelledby={title !== undefined ? headingId : undefined}
      aria-label={label}
      onClose={closed}
      onPointerDown={(e) => (pressedOutside.current = outside(e))}
      onClick={(e) => {
        if (pressedOutside.current && outside(e)) ref.current!.close()
        pressedOutside.current = false
      }}
    >
      <div className="mc-dialog-header">
        {title !== undefined && (
          <h2 id={headingId} className="mc-dialog-title">
            {title}
          </h2>
        )}
        <Button variant="secondary" onClick={() => ref.current!.close()}>
          {closeLabel}
        </Button>
      </div>
      <div className="mc-dialog-body">{children}</div>
    </dialog>
  )
}
