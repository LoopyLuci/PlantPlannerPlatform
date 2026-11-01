/**
 * Optimistic-undo toasts. One action per toast, shown for eight seconds. The
 * undo is a new event in the log, never a rewrite of history.
 */

export interface Toast {
  id: string;
  message: string;
  undo?: () => Promise<void>;
}

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onUndo: (toast: Toast) => void;
}

export function Toasts({ toasts, onDismiss, onUndo }: ToastsProps) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <span>{toast.message}</span>
          {toast.undo && (
            <button type="button" className="ghost" onClick={() => onUndo(toast)}>
              Undo
            </button>
          )}
          <button type="button" className="icon" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
