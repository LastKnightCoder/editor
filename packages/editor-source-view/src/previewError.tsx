import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export interface PreviewError {
  message: string;
  /** 预览是否还停在上一次成功的结果（块据此调淡预览并提示）；渲染器无法保留旧结果时为 false */
  stale: boolean;
}

/** 外层源码预览块收集渲染错误的入口；块内与全屏各一份，互不覆盖 */
export const PreviewErrorContext = createContext<((error: PreviewError | null) => void) | null>(
  null
);

/**
 * 预览渲染器上报当前渲染错误（null 表示正常），由外层块展示错误条。
 * 返回 false 表示不在源码预览块内，需自行展示错误。
 */
export function useReportPreviewError(
  error: string | null,
  { stale = true }: { stale?: boolean } = {}
): boolean {
  const report = useContext(PreviewErrorContext);
  useEffect(() => {
    report?.(error ? { message: error, stale } : null);
  }, [report, error, stale]);
  useEffect(() => () => report?.(null), [report]);
  return report !== null;
}

/**
 * 给只暴露 onError 回调的渲染器接上报：子函数拿到 onError 传下去。
 * 渲染器回调的 hasPrevious 表示预览是否还停在上一次成功的结果。
 */
export function PreviewErrorReporter({
  children,
}: {
  children: (onError: (error: string | null, hasPrevious?: boolean) => void) => ReactNode;
}) {
  const [state, setState] = useState<PreviewError | null>(null);
  useReportPreviewError(state?.message ?? null, { stale: state?.stale });
  const onError = useCallback(
    (error: string | null, hasPrevious = false) =>
      setState(error ? { message: error, stale: hasPrevious } : null),
    []
  );
  return <>{children(onError)}</>;
}
