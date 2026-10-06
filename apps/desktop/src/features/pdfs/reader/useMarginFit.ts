/**
 * 页边展开时让引擎的适宽 / 适页把页边算进去（须在 EmbedPDF 上下文内调用）。
 * 引擎只按页宽计算这两种缩放，且没有公开的扩展点：这里包一层它的私有方法 computeZoomForMode，
 * 把视口宽度折算成「只给页面的那部分」。升级后方法缺失则不预留（页边超出视口、可横向滚动），
 * __tests__/useMarginFit.test.ts 守护方法仍在。
 */

import { useEffect, useRef } from "react";
import { useZoom, useZoomPlugin } from "@embedpdf/plugin-zoom/react";
import { ZoomMode } from "@embedpdf/plugin-zoom";
import type { ViewportMetrics } from "@embedpdf/plugin-viewport";
import { useViewportCapability } from "@embedpdf/plugin-viewport/react";
import { marginFitClientWidth } from "./annotationModel";

type ComputeZoom = (mode: ZoomMode, viewport: ViewportMetrics) => number | false;

const FIT_MODES = new Set<unknown>([ZoomMode.FitWidth, ZoomMode.FitPage, ZoomMode.Automatic]);

export function useMarginFit(ratio: number | null) {
  const { plugin } = useZoomPlugin();
  const { provides: zoom, state } = useZoom();
  const { provides: viewport } = useViewportCapability();
  const zoomLevelRef = useRef(state?.zoomLevel);
  zoomLevelRef.current = state?.zoomLevel;

  useEffect(() => {
    const target = plugin as unknown as { computeZoomForMode?: ComputeZoom } | null;
    const original = target?.computeZoomForMode;
    if (!target || !original || !viewport || ratio === null) return;
    const gap = viewport.getViewportGap();
    target.computeZoomForMode = (mode, metrics) =>
      original.call(target, mode, {
        ...metrics,
        clientWidth: marginFitClientWidth(metrics.clientWidth, gap, ratio),
      });
    return () => {
      target.computeZoomForMode = original;
    };
  }, [plugin, viewport, ratio]);

  // 页边开合后按当前的适配模式重算一次（数值缩放不受影响）
  useEffect(() => {
    const level = zoomLevelRef.current;
    if (zoom && FIT_MODES.has(level)) zoom.requestZoom(level as ZoomMode);
  }, [zoom, ratio]);
}
