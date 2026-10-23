// 长按确认按钮：按住满时长才执行，松手即取消；用于不可撤销的整库覆盖。

import { useEffect, useRef, useState } from "react";

const HOLD_DURATION_MS = 1600;

export function HoldToConfirmButton(props: {
  label: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  };

  const start = () => {
    if (props.disabled) return;
    cancel();
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      if ("vibrate" in navigator) navigator.vibrate?.(30);
      props.onConfirm();
    }, HOLD_DURATION_MS);
  };

  useEffect(() => cancel, []);

  return (
    <button
      type="button"
      disabled={props.disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={event => event.preventDefault()}
      className="bg-danger text-ink-inverse relative h-12 w-full select-none overflow-hidden rounded-[14px] text-[15px] font-semibold disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className="bg-ink-inverse/25 absolute inset-y-0 left-0"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding ? `width ${HOLD_DURATION_MS}ms linear` : "width 150ms ease-out",
        }}
      />
      <span className="relative">{holding ? "继续按住…" : props.label}</span>
    </button>
  );
}
