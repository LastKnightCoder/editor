import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useKeyboardViewportState, type KeyboardViewportState } from "../hooks/useKeyboardViewport";
import { useKeyboardAutoReveal } from "../hooks/useKeyboardAutoReveal";

/**
 * 含底部预留的键盘视口状态。
 * keyboardHeight / viewportHeight 为有效值（键盘与预留取大者），isKeyboardVisible 按原始键盘判断。
 */
export type ReservedKeyboardViewportState = KeyboardViewportState & {
  /** 原始键盘高度 */
  rawKeyboardHeight: number;
  /** 底部预留高度 */
  reservedHeight: number;
  /** 最近一轮键盘显示期间的峰值高度，从未测到为 0 */
  lastKeyboardHeight: number;
};

export type KeyboardReservation = {
  /** 设置底部预留高度，并取消待执行的释放 */
  reserve: (height: number) => void;
  /** 原始键盘升到预留高度的 KEYBOARD_RESERVE_RELEASE_RATIO 倍或超时后释放预留 */
  releaseWhenKeyboardShown: () => void;
  /** 立即释放预留 */
  releaseNow: () => void;
};

export const KEYBOARD_RESERVE_RELEASE_RATIO = 0.9;
export const KEYBOARD_RESERVE_RELEASE_TIMEOUT_MS = 600;
const MIN_MEASURED_KEYBOARD_PX = 100;
const FALLBACK_PANEL_RATIO = 0.38;

function getDefaultViewportHeight(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  return Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 1));
}

const DEFAULT_KEYBOARD_VIEWPORT_STATE: ReservedKeyboardViewportState = {
  viewportHeight: getDefaultViewportHeight(),
  keyboardHeight: 0,
  isKeyboardVisible: false,
  rawKeyboardHeight: 0,
  reservedHeight: 0,
  lastKeyboardHeight: 0,
};

const NOOP_RESERVATION: KeyboardReservation = {
  reserve: () => undefined,
  releaseWhenKeyboardShown: () => undefined,
  releaseNow: () => undefined,
};

const KeyboardViewportContext = createContext<ReservedKeyboardViewportState>(
  DEFAULT_KEYBOARD_VIEWPORT_STATE
);

const KeyboardReservationContext = createContext<KeyboardReservation>(NOOP_RESERVATION);

function toPx(value: number): string {
  return `${Math.max(0, Math.round(value))}px`;
}

/** 面板高度：最近测得的键盘高度，未测到时取布局视口的 38% */
export function resolvePanelHeight(state: ReservedKeyboardViewportState): number {
  if (state.lastKeyboardHeight > MIN_MEASURED_KEYBOARD_PX) {
    return state.lastKeyboardHeight;
  }
  // 有效值之和等于原始视口高度 + 原始键盘高度
  return Math.round((state.viewportHeight + state.keyboardHeight) * FALLBACK_PANEL_RATIO);
}

export function KeyboardViewportProvider(props: { children: ReactNode }) {
  const rawState = useKeyboardViewportState();
  useKeyboardAutoReveal();
  const rawKeyboardHeight = rawState.keyboardHeight;
  const [reservedHeight, setReservedHeight] = useState(0);
  const [lastKeyboardHeight, setLastKeyboardHeight] = useState(0);
  const roundPeakRef = useRef(0);
  const rawKeyboardHeightRef = useRef(rawKeyboardHeight);
  rawKeyboardHeightRef.current = rawKeyboardHeight;
  const reservedHeightRef = useRef(0);
  const releasePendingRef = useRef(false);
  const releaseTimerRef = useRef(0);

  // 原始键盘回到 0 开始新一轮，本轮峰值超过已记录值才覆盖；
  // 不足 MIN_MEASURED_KEYBOARD_PX 的峰值（外接键盘只显示候选条等）不记录，保留上一轮真实键盘高度
  useEffect(() => {
    if (rawKeyboardHeight === 0) {
      roundPeakRef.current = 0;
      return;
    }
    if (rawKeyboardHeight > roundPeakRef.current) {
      roundPeakRef.current = rawKeyboardHeight;
      if (rawKeyboardHeight > MIN_MEASURED_KEYBOARD_PX) {
        setLastKeyboardHeight(rawKeyboardHeight);
      }
    }
  }, [rawKeyboardHeight]);

  const reservation = useMemo<KeyboardReservation>(() => {
    const setReserved = (height: number) => {
      reservedHeightRef.current = height;
      setReservedHeight(height);
    };
    const cancelPendingRelease = () => {
      releasePendingRef.current = false;
      window.clearTimeout(releaseTimerRef.current);
    };
    const releaseNow = () => {
      cancelPendingRelease();
      setReserved(0);
    };
    return {
      reserve: height => {
        cancelPendingRelease();
        setReserved(Math.max(0, Math.round(height)));
      },
      releaseWhenKeyboardShown: () => {
        const reserved = reservedHeightRef.current;
        if (rawKeyboardHeightRef.current >= reserved * KEYBOARD_RESERVE_RELEASE_RATIO) {
          releaseNow();
          return;
        }
        cancelPendingRelease();
        releasePendingRef.current = true;
        releaseTimerRef.current = window.setTimeout(
          releaseNow,
          KEYBOARD_RESERVE_RELEASE_TIMEOUT_MS
        );
      },
      releaseNow,
    };
  }, []);

  useEffect(() => {
    if (!releasePendingRef.current) return;
    if (rawKeyboardHeight >= reservedHeight * KEYBOARD_RESERVE_RELEASE_RATIO) {
      reservation.releaseNow();
    }
  }, [rawKeyboardHeight, reservedHeight, reservation]);

  useEffect(() => {
    return () => window.clearTimeout(releaseTimerRef.current);
  }, []);

  const state = useMemo<ReservedKeyboardViewportState>(() => {
    const keyboardHeight = Math.max(rawKeyboardHeight, reservedHeight);
    return {
      viewportHeight: Math.max(1, rawState.viewportHeight + rawKeyboardHeight - keyboardHeight),
      keyboardHeight,
      isKeyboardVisible: rawState.isKeyboardVisible,
      rawKeyboardHeight,
      reservedHeight,
      lastKeyboardHeight,
    };
  }, [
    rawState.viewportHeight,
    rawState.isKeyboardVisible,
    rawKeyboardHeight,
    reservedHeight,
    lastKeyboardHeight,
  ]);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--kb-height", toPx(state.keyboardHeight));
    rootStyle.setProperty("--kb-viewport-height", toPx(state.viewportHeight));
  }, [state.keyboardHeight, state.viewportHeight]);

  useEffect(() => {
    return () => {
      const rootStyle = document.documentElement.style;
      rootStyle.removeProperty("--kb-height");
      rootStyle.removeProperty("--kb-viewport-height");
    };
  }, []);

  return (
    <KeyboardReservationContext.Provider value={reservation}>
      <KeyboardViewportContext.Provider value={state}>
        {props.children}
      </KeyboardViewportContext.Provider>
    </KeyboardReservationContext.Provider>
  );
}

export function useKeyboardViewport(): ReservedKeyboardViewportState {
  return useContext(KeyboardViewportContext);
}

/** 底部预留控制，返回引用稳定 */
export function useKeyboardReservation(): KeyboardReservation {
  return useContext(KeyboardReservationContext);
}

export default KeyboardViewportProvider;
