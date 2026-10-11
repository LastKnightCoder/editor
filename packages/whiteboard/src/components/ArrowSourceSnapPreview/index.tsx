import { memo, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";

import { ARROW_TOOL_ID } from "../../constants/tools";
import { useActiveTool, useBoard, usePointerViewport, useZoom } from "../../hooks";
import { getNearestCustomConnectCandidate } from "../../utils";
import type { Point } from "../../types";

/**
 * 箭头创建工具激活时的自定义连接点悬停预览（自旧 useCreateArrow 抽出）：
 * 按住 Alt 悬停时显示最近的自定义连接点吸附位置（tau.arrow.custom-snap 事件），
 * 拖动开始后（存在创建预览时）让位给创建手势内的吸附反馈。
 */
const ArrowSourceSnapPreview = memo(() => {
  const board = useBoard();
  const active = useActiveTool() === ARROW_TOOL_ID;
  const pointerViewport = usePointerViewport();
  const zoom = useZoom();
  const altKeyRef = useRef(false);
  // 拖动中（存在创建预览）保持沉默，吸附反馈由创建手势内的追踪器负责
  const draggingRef = useRef(false);
  // 指针/缩放频繁变化，经 ref 读取避免监听器随每次移动重建
  const hoverStateRef = useRef<{ pointer: Point | null; zoom: number }>({
    pointer: null,
    zoom: 1,
  });
  hoverStateRef.current = { pointer: pointerViewport, zoom };

  const clearPreview = useMemoizedFn(() => {
    board.emit("tau.arrow.custom-snap", null);
  });

  const updateSourceSnapPreview = useMemoizedFn(() => {
    if (board.creationPreview) {
      if (!draggingRef.current) {
        draggingRef.current = true;
        clearPreview();
      }
      return;
    }
    draggingRef.current = false;

    const { pointer, zoom: currentZoom } = hoverStateRef.current;
    if (!altKeyRef.current || !pointer) {
      clearPreview();
      return;
    }

    const candidate = getNearestCustomConnectCandidate(board.children, pointer, currentZoom);
    if (!candidate) {
      clearPreview();
      return;
    }

    board.emit("tau.arrow.custom-snap", { point: candidate.point });
  });

  // 按键与激活态监听：Alt 按下/抬起即时刷新，失焦与失活清理
  useEffect(() => {
    if (!active) return;

    const handleKeyChange = (event: KeyboardEvent) => {
      altKeyRef.current = event.altKey;
      updateSourceSnapPreview();
    };
    document.addEventListener("keydown", handleKeyChange);
    document.addEventListener("keyup", handleKeyChange);
    window.addEventListener("blur", clearPreview);

    return () => {
      document.removeEventListener("keydown", handleKeyChange);
      document.removeEventListener("keyup", handleKeyChange);
      window.removeEventListener("blur", clearPreview);
      clearPreview();
    };
  }, [active, clearPreview, updateSourceSnapPreview]);

  // 悬停位置/缩放变化时刷新
  useEffect(() => {
    if (!active) return;
    updateSourceSnapPreview();
  }, [active, pointerViewport, zoom, updateSourceSnapPreview]);

  return null;
});

export default ArrowSourceSnapPreview;
