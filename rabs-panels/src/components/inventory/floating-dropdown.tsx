'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Dropdown panel rendered in a portal with fixed positioning under `anchor`, so it is never
 * clipped by scrollable modal / line-item containers and can scroll on its own.
 */
export function FloatingDropdown({
  anchor,
  open,
  onClose,
  children,
  maxHeight = 260,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeight?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const update = () => setRect(anchor.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchor, onClose]);

  if (!open || !anchor || !rect || typeof document === 'undefined') return null;

  const gap = 4;
  const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
  const spaceAbove = rect.top - gap - 8;
  const placeAbove = spaceBelow < Math.min(maxHeight, 160) && spaceAbove > spaceBelow;
  const height = Math.max(120, Math.min(maxHeight, placeAbove ? spaceAbove : spaceBelow));

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: rect.left,
        width: Math.max(rect.width, 220),
        maxHeight: height,
        zIndex: 1000,
        ...(placeAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      }}
      className="overflow-y-auto overscroll-contain rounded-lg border border-border bg-card shadow-xl"
    >
      {children}
    </div>,
    document.body
  );
}
