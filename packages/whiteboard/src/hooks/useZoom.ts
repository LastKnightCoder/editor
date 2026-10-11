import { useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { BoardContext } from "../context";

/**
 * 缩放值订阅。只关心 zoom 的组件（低缩放降级渲染、连接点尺寸换算）不要订阅
 * ViewPortContext——平移每帧都会换 viewPort 对象（minX/minY 变），那会让全部
 * 订阅者重渲；这里订阅 viewport:change 并在通知侧短路，zoom 不变（纯平移）零重渲。
 */
export const useZoom = (): number => {
  const board = useContext(BoardContext);
  const zoomRef = useRef(1);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!board) return () => {};
      const wrapped = () => {
        const next = board.viewPort.zoom;
        if (next === zoomRef.current) return;
        zoomRef.current = next;
        listener();
      };
      board.on("viewport:change", wrapped);
      return () => {
        board.off("viewport:change", wrapped);
      };
    },
    [board]
  );
  const zoom = useSyncExternalStore(
    subscribe,
    () => (board ? board.viewPort.zoom : 1),
    () => 1
  );
  zoomRef.current = zoom;
  return zoom;
};

export default useZoom;
