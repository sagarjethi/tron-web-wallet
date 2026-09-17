import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { IconCheck, IconClose, IconCopy, IconWarn } from './icons'
import { ToastCtx, useCopy, type ToastTone } from './toast'

// ---------------------------------------------------------------- Button

type Variant = 'primary' | 'net' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size,
  block,
  busy,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm'; block?: boolean; busy?: boolean }) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function IconButton({ label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- Field

export function Field({
  label,
  aside,
  hint,
  error,
  children,
}: {
  label: ReactNode
  aside?: ReactNode
  hint?: ReactNode
  error?: string | null
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        <span>{label}</span>
        {aside ? <span className="aside">{aside}</span> : null}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- Segmented

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Notice

export function Notice({ tone = 'info', children, icon = true }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; icon?: boolean }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && tone !== 'info' ? <IconWarn /> : null}
      <div>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------- Sheet

export function Sheet({ open, onClose, title, children, footer, onBack }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; onBack?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="sheet"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open ? (
        <div className="sheet-inner">
          <div className="sheet-head">
            <h2>{title}</h2>
            <div style={{ display: 'flex', gap: 2 }}>
              {onBack ? (
                <Button variant="ghost" size="sm" onClick={onBack}>
                  Back
                </Button>
              ) : null}
              <IconButton label="Close" onClick={onClose}>
                <IconClose />
              </IconButton>
            </div>
          </div>
          <div className="sheet-body">{children}</div>
          {footer ? <div className="sheet-foot">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  )
}

// ---------------------------------------------------------------- Toasts

interface Toast {
  id: number
  text: string
  tone: ToastTone
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: ToastTone = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 2600)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast-error' : ''}`}>
            {t.tone === 'ok' ? <IconCheck /> : <IconWarn />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------------------------------------------------------------- Copy

export function CopyButton({ value, label = 'Copy', toastText, sensitive }: { value: string; label?: string; toastText?: string; sensitive?: boolean }) {
  const copy = useCopy()
  return (
    <IconButton label={label} onClick={() => copy(value, toastText, { sensitive })}>
      <IconCopy />
    </IconButton>
  )
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />
}
