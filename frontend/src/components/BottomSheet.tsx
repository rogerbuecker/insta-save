import { useRef, useState, type ReactNode } from 'react';
import { useOverlay } from '../hooks/useOverlay';
import './BottomSheet.css';

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Sheet sliding up from the bottom; closes via backdrop, back button, Escape or dragging the handle down. */
const BottomSheet = ({ title, onClose, children, footer }: BottomSheetProps) => {
  useOverlay(true, onClose);
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current === null) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  };
  const onPointerUp = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (dragY > 80) onClose();
    setDragY(0);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet-handle-area"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="sheet-handle" />
          <div className="sheet-title-row">
            <h2 className="sheet-title">{title}</h2>
            <button className="icon-btn" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Schließen">✕</button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default BottomSheet;
