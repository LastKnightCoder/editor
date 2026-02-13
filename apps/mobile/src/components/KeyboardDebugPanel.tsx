import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeyboardViewport } from "./KeyboardViewportProvider";

type KeyboardDebugSnapshot = {
  innerHeight: number;
  devicePixelRatio: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
  visualViewportScale: number;
  cssKeyboardHeight: string;
  cssViewportHeight: string;
  nativeKeyboardHeight: number | null;
  nativeKeyboardHeightRaw: number | null;
  keyboardHeight: number;
  viewportHeight: number;
  isKeyboardVisible: boolean;
  activeElement: string;
  timestamp: string;
};

function resolveDeepActiveElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  let current: Element | null = document.activeElement;
  while (current instanceof HTMLElement && current.shadowRoot) {
    const next = current.shadowRoot.activeElement;
    if (!next || next === current) {
      break;
    }
    current = next;
  }
  return current instanceof HTMLElement ? current : null;
}

function formatActiveElement(): string {
  const active = resolveDeepActiveElement();
  if (!active) {
    return "none";
  }
  const tag = active.tagName.toLowerCase();
  const idPart = active.id ? `#${active.id}` : "";
  const typePart =
    active instanceof HTMLInputElement && active.type
      ? ` type=${active.type}`
      : "";
  const editablePart = active.isContentEditable ? " contenteditable" : "";
  return `${tag}${idPart}${typePart}${editablePart}`.trim();
}

function readRootVar(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function shouldEnableDebugPanel(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const userAgent =
    typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  const isAndroid = /android/i.test(userAgent);
  const query = new URLSearchParams(window.location.search);
  const queryFlag = query.get("kbDebug");
  if (queryFlag === "1") {
    return true;
  }
  if (queryFlag === "0") {
    return false;
  }
  if (isAndroid) {
    return true;
  }
  try {
    const localFlag = window.localStorage.getItem("tau-mobile-kb-debug");
    if (localFlag === "1") {
      return true;
    }
    if (localFlag === "0") {
      return false;
    }
  } catch {
    // 忽略 localStorage 访问失败
  }
  return import.meta.env.DEV;
}

function buildSnapshot(params: {
  keyboardHeight: number;
  viewportHeight: number;
  isKeyboardVisible: boolean;
}): KeyboardDebugSnapshot {
  const visualViewport = window.visualViewport;
  const nativeKeyboardHeight = (() => {
    const value = (window as Window & { __TAU_NATIVE_KB_HEIGHT?: unknown })
      .__TAU_NATIVE_KB_HEIGHT;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.round(value));
  })();
  const nativeKeyboardHeightRaw = (() => {
    const value = (window as Window & { __TAU_NATIVE_KB_HEIGHT_RAW?: unknown })
      .__TAU_NATIVE_KB_HEIGHT_RAW;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.round(value));
  })();
  return {
    innerHeight: Math.round(window.innerHeight || 0),
    devicePixelRatio: Number((window.devicePixelRatio || 1).toFixed(3)),
    visualViewportHeight: Math.round(visualViewport?.height ?? 0),
    visualViewportOffsetTop: Math.round(visualViewport?.offsetTop ?? 0),
    visualViewportScale:
      typeof visualViewport?.scale === "number"
        ? Number(visualViewport.scale.toFixed(3))
        : 0,
    cssKeyboardHeight: readRootVar("--kb-height"),
    cssViewportHeight: readRootVar("--kb-viewport-height"),
    nativeKeyboardHeight,
    nativeKeyboardHeightRaw,
    keyboardHeight: Math.round(params.keyboardHeight),
    viewportHeight: Math.round(params.viewportHeight),
    isKeyboardVisible: params.isKeyboardVisible,
    activeElement: formatActiveElement(),
    timestamp: new Date().toLocaleTimeString(),
  };
}

type RowProps = {
  label: string;
  value: string | number;
};

function Row(props: RowProps) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-[132px] shrink-0 text-emerald-300/80">
        {props.label}
      </span>
      <span className="break-all text-emerald-100">{String(props.value)}</span>
    </div>
  );
}

export function KeyboardDebugPanel() {
  const keyboardViewport = useKeyboardViewport();
  const [enabled, setEnabled] = useState(() => shouldEnableDebugPanel());
  const [collapsed, setCollapsed] = useState(false);
  const [snapshot, setSnapshot] = useState<KeyboardDebugSnapshot>(() =>
    buildSnapshot({
      keyboardHeight: keyboardViewport.keyboardHeight,
      viewportHeight: keyboardViewport.viewportHeight,
      isKeyboardVisible: keyboardViewport.isKeyboardVisible,
    }),
  );

  const canQuickToggle = import.meta.env.DEV;

  const refresh = useCallback(() => {
    setSnapshot(
      buildSnapshot({
        keyboardHeight: keyboardViewport.keyboardHeight,
        viewportHeight: keyboardViewport.viewportHeight,
        isKeyboardVisible: keyboardViewport.isKeyboardVisible,
      }),
    );
  }, [
    keyboardViewport.keyboardHeight,
    keyboardViewport.isKeyboardVisible,
    keyboardViewport.viewportHeight,
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let rafId: number | null = null;
    const schedule = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        refresh();
      });
    };

    schedule();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    document.addEventListener("focusin", schedule, true);
    document.addEventListener("focusout", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);

    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("focusin", schedule, true);
      document.removeEventListener("focusout", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    refresh();
  }, [enabled, refresh]);

  const keyboardSummary = useMemo(
    () =>
      `${snapshot.isKeyboardVisible ? "visible" : "hidden"} / hook=${snapshot.keyboardHeight}px / css=${snapshot.cssKeyboardHeight || "0px"}`,
    [
      snapshot.cssKeyboardHeight,
      snapshot.isKeyboardVisible,
      snapshot.keyboardHeight,
    ],
  );

  if (!enabled) {
    if (!canQuickToggle) {
      return null;
    }
    return (
      <button
        type="button"
        data-kb-optout="true"
        className="fixed right-2 top-2 z-[120] rounded-md border border-emerald-300/50 bg-black/80 px-2 py-1 text-[11px] font-medium text-emerald-200 shadow"
        onClick={() => {
          setEnabled(true);
        }}
      >
        KB Debug
      </button>
    );
  }

  return (
    <section
      data-kb-optout="true"
      className="fixed right-2 top-2 z-[120] max-w-[92vw] rounded-lg border border-emerald-300/40 bg-black/86 p-2 text-[11px] leading-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <strong className="text-emerald-100">Keyboard Debug</strong>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-emerald-200/40 px-1.5 py-0.5 text-[10px] text-emerald-100"
            onClick={() => {
              setCollapsed((prev) => !prev);
            }}
          >
            {collapsed ? "展开" : "折叠"}
          </button>
          <button
            type="button"
            className="rounded border border-emerald-200/40 px-1.5 py-0.5 text-[10px] text-emerald-100"
            onClick={() => {
              setEnabled(false);
            }}
          >
            关闭
          </button>
        </div>
      </div>
      <Row label="keyboard" value={keyboardSummary} />
      {!collapsed ? (
        <div className="mt-1 space-y-0.5">
          <Row label="innerHeight" value={snapshot.innerHeight} />
          <Row label="vv.height" value={snapshot.visualViewportHeight} />
          <Row label="vv.offsetTop" value={snapshot.visualViewportOffsetTop} />
          <Row label="vv.scale" value={snapshot.visualViewportScale} />
          <Row label="devicePixelRatio" value={snapshot.devicePixelRatio} />
          <Row label="hook.viewportHeight" value={snapshot.viewportHeight} />
          <Row
            label="native.kbHeight"
            value={snapshot.nativeKeyboardHeight ?? "(null)"}
          />
          <Row
            label="native.kbRaw"
            value={snapshot.nativeKeyboardHeightRaw ?? "(null)"}
          />
          <Row
            label="css.--kb-height"
            value={snapshot.cssKeyboardHeight || "(empty)"}
          />
          <Row
            label="css.--kb-viewport-height"
            value={snapshot.cssViewportHeight || "(empty)"}
          />
          <Row label="activeElement" value={snapshot.activeElement} />
          <Row label="timestamp" value={snapshot.timestamp} />
        </div>
      ) : null}
    </section>
  );
}

export default KeyboardDebugPanel;
