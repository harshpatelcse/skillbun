'use client';

import { useEffect, useRef } from 'react';

// Native modal dialogs keep background controls inert and constrain keyboard focus.
export default function AccessibleModal({ children, className, labelledBy, describedBy, onClose, busy = false, initialFocus, dismissOnBackdrop = false }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    if (initialFocus) dialog.querySelector(initialFocus)?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [initialFocus]);

  function keepKeyboardFocus(event) {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    const controls = [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
      .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }

  return (
    <dialog ref={dialogRef} className={className} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-busy={busy || undefined}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onKeyDown={keepKeyboardFocus}
      onClick={(event) => { if (dismissOnBackdrop && !busy && event.target === event.currentTarget) onClose(); }}
      style={{ width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', margin: 0, padding: 0, border: 0, color: 'var(--text)', boxSizing: 'border-box' }}>
      {children}
    </dialog>
  );
}
