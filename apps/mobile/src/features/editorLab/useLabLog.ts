import { useCallback, useRef, useState } from "react";

export type LabLogEntry = {
  /** 相对页面挂载的毫秒数 */
  t: number;
  type: string;
  data: unknown;
};

type ViewportSnapshot = {
  height: number;
  width: number;
  offsetTop: number;
  scale: number;
} | null;

const MAX_LOG_ENTRIES = 200;

function readVisualViewport(): ViewportSnapshot {
  const viewport = window.visualViewport;
  if (!viewport) return null;
  return {
    height: viewport.height,
    width: viewport.width,
    offsetTop: viewport.offsetTop,
    scale: viewport.scale,
  };
}

/** 实验页事件日志：保留最近 200 条，并可导出含设备信息的 JSON 报告 */
export function useLabLog() {
  const mountedAtRef = useRef(performance.now());
  const initialViewportRef = useRef<ViewportSnapshot>(readVisualViewport());
  const entriesRef = useRef<LabLogEntry[]>([]);
  const [entries, setEntries] = useState<LabLogEntry[]>([]);

  const log = useCallback((type: string, data: unknown) => {
    const entry: LabLogEntry = {
      t: Math.round(performance.now() - mountedAtRef.current),
      type,
      data,
    };
    entriesRef.current = [...entriesRef.current, entry].slice(-MAX_LOG_ENTRIES);
    setEntries(entriesRef.current);
  }, []);

  const clear = useCallback(() => {
    entriesRef.current = [];
    setEntries([]);
  }, []);

  const buildReport = useCallback(() => {
    return JSON.stringify(
      {
        userAgent: window.navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        innerHeight: window.innerHeight,
        visualViewport: initialViewportRef.current,
        entries: entriesRef.current,
      },
      null,
      2
    );
  }, []);

  return { log, clear, entries, buildReport };
}
