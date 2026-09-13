import { useEffect, useMemo, useState } from "react";
import { Z_INDEX } from "../router/zIndex";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { useToastStore, type ToastMessage } from "./toast";

type ToastItemProps = {
  toast: ToastMessage;
  onDone: (id: string) => void;
};

function ToastItem({ toast, onDone }: ToastItemProps) {
  const [phase, setPhase] = useState<"enter" | "show" | "leave">("enter");

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      setPhase("show");
    });
    const leaveTimer = window.setTimeout(() => {
      setPhase("leave");
    }, toast.duration);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(leaveTimer);
    };
  }, [toast.duration]);

  useEffect(() => {
    if (phase !== "leave") return;
    const removeTimer = window.setTimeout(() => {
      onDone(toast.id);
    }, 220);
    return () => {
      window.clearTimeout(removeTimer);
    };
  }, [onDone, phase, toast.id]);

  const icon = useMemo(() => {
    if (toast.type === "success") {
      return <CircleCheck className="toast-icon" aria-hidden="true" />;
    }
    if (toast.type === "warning") {
      return <TriangleAlert className="toast-icon" aria-hidden="true" />;
    }
    if (toast.type === "error") {
      return <CircleX className="toast-icon" aria-hidden="true" />;
    }
    return <Info className="toast-icon" aria-hidden="true" />;
  }, [toast.type]);

  return (
    <section
      className={`toast-item toast-${toast.type} toast-phase-${phase}`}
      role="status"
      aria-live="polite"
    >
      {icon}
      <p className="toast-text">{toast.text}</p>
      {toast.action ? (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.onClick();
            onDone(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </section>
  );
}

export function ToastViewport() {
  const toasts = useToastStore(state => state.toasts);
  const removeToast = useToastStore(state => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: Z_INDEX.TOAST }}
      data-no-tab-swipe
    >
      <section className="toast-viewport">
        <div className="toast-stack">
          {[...toasts].reverse().map(toast => (
            <ToastItem key={toast.id} toast={toast} onDone={removeToast} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default ToastViewport;
