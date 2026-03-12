import { type PropsWithChildren, type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps extends PropsWithChildren {
  title: string;
  open: boolean;
  onClose: () => void;
  footer?: ReactNode;
}

export function Modal({ title, open, onClose, footer, children }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section className="modal-sheet" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Daily</p>
            <h3>{title}</h3>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
