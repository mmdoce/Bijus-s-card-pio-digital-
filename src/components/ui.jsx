import { cloneElement, useEffect, useId, useRef } from 'react'
import { Link } from 'react-router'

export function PageHeading({ title, children }) {
  return <header className="page-heading"><h1>{title}</h1>{children && <p>{children}</p>}</header>
}

export function Button({ secondary = false, className = '', ...props }) {
  return <button type="button" className={['button', secondary && 'secondary', className].filter(Boolean).join(' ')} {...props} />
}

export function ActionLink({ secondary = false, ...props }) {
  return <Link className={secondary ? 'button secondary' : 'button'} {...props} />
}

export function Notice({ children }) {
  return <p className="notice">{children}</p>
}

export function FormField({ label, children }) {
  const labelId = useId()
  return <label className="field"><span id={labelId}>{label}</span>{cloneElement(children, { 'aria-labelledby': labelId })}</label>
}

export function StatusBadge({ children, tone = 'neutral' }) {
  return <span className={'badge badge-' + tone}>{children}</span>
}

export function EmptyState({ title, children, image }) {
  return <div className="panel empty-state stack">
    {image && <img src={image} alt="" width="112" />}
    <h2>{title}</h2>{children}
  </div>
}

export function LoadingState({ children = 'Carregando…' }) {
  return <p className="notice" role="status">{children}</p>
}

export function QuantityControl({ quantity, onChange, label, minimum = 1, maximum }) {
  return <div className="quantity" role="group" aria-label={'Quantidade de ' + label}>
    <button type="button" aria-label={'Diminuir quantidade de ' + label} disabled={quantity <= minimum} onClick={() => onChange(-1)}>−</button>
    <span aria-live="polite">{quantity}</span>
    <button type="button" aria-label={'Aumentar quantidade de ' + label} disabled={quantity >= maximum} onClick={() => onChange(1)}>+</button>
  </div>
}

export function Modal({ title, children, onClose }) {
  const dialog = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog className="modal panel" ref={dialog} aria-labelledby={titleId} onCancel={event => {
    event.preventDefault()
    onClose()
  }}>
    <div className="stack">
      <header className="line-item"><h2 id={titleId}>{title}</h2><Button secondary onClick={onClose}>Fechar</Button></header>
      {children}
    </div>
  </dialog>
}
