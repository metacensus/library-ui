import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from './cn.js'

type FieldState = { id: string; errorId: string; invalid: boolean }

const FieldContext = createContext<FieldState | null>(null)

/** A control's id, `aria-describedby` and `aria-invalid`, from the Field around
 *  it unless set. */
function useControl(props: {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: InputHTMLAttributes<HTMLInputElement>['aria-invalid']
}) {
  const field = useContext(FieldContext)
  return {
    id: props.id ?? field?.id,
    'aria-describedby':
      props['aria-describedby'] ?? (field?.invalid ? field.errorId : undefined),
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid || undefined),
  }
}

/** One labelled control and its error. Label and control find each other. */
export function Field({
  error,
  className,
  children,
}: {
  error?: ReactNode
  className?: string
  children: ReactNode
}) {
  const id = useId()
  const state = { id, errorId: `${id}-error`, invalid: Boolean(error) }
  return (
    <FieldContext.Provider value={state}>
      <div className={cn('mc-field', className)}>
        {children}
        {error && <FieldError id={state.errorId}>{error}</FieldError>}
      </div>
    </FieldContext.Provider>
  )
}

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  const field = useContext(FieldContext)
  return (
    <label
      className={cn('mc-label', className)}
      htmlFor={props.htmlFor ?? field?.id}
      {...props}
    />
  )
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  const control = useControl(props)
  return (
    <input
      ref={ref}
      className={cn('mc-control', className)}
      {...props}
      {...control}
    />
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  const control = useControl(props)
  return (
    <textarea
      ref={ref}
      className={cn('mc-control', className)}
      {...props}
      {...control}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  const control = useControl(props)
  return (
    <select
      ref={ref}
      className={cn('mc-control', className)}
      {...props}
      {...control}
    />
  )
})

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }
>(function Checkbox({ label, className, ...props }, ref) {
  const control = useControl(props)
  return (
    <label className={cn('mc-choice', className)}>
      <input ref={ref} type="checkbox" {...props} {...control} />
      <span>{label}</span>
    </label>
  )
})

type RadioGroupProps = {
  legend: ReactNode
  name: string
  options: { value: string; label: ReactNode }[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  className?: string
}

/** A set of radios under a legend; controlled with `value`, else not. */
export function RadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  className,
}: RadioGroupProps) {
  const field = useContext(FieldContext)
  return (
    <fieldset
      className={cn('mc-radio-group', className)}
      aria-describedby={field?.invalid ? field.errorId : undefined}
    >
      <legend className="mc-label">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="mc-choice">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === undefined ? undefined : value === o.value}
            defaultChecked={
              defaultValue === undefined ? undefined : defaultValue === o.value
            }
            onChange={() => onChange?.(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

/** A field's error text, in the alert ink. */
export function FieldError({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mc-error', className)} {...props} />
}
