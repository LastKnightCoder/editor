import { useEffect, useRef, type RefObject } from "react";
import { useMemoizedFn } from "ahooks";
import { useBoard } from "./useBoard";
import type { ResizeCallbacks } from "../interactions/states/ResizingState";

interface IUseResize extends ResizeCallbacks {
  ref: RefObject<SVGElement | null>;
}

/** 手柄只发起手势；延续事件、历史和取消由交互内核统一负责。 */
export const useResize = ({ ref, onResizeStart, onResize, onResizeEnd }: IUseResize) => {
  const board = useBoard();
  const cancel = useRef<(() => void) | undefined>(undefined);
  const start = useMemoizedFn(
    (...args: Parameters<NonNullable<ResizeCallbacks["onResizeStart"]>>) => onResizeStart?.(...args)
  );
  const move = useMemoizedFn(onResize);
  const end = useMemoizedFn((...args: Parameters<NonNullable<ResizeCallbacks["onResizeEnd"]>>) =>
    onResizeEnd?.(...args)
  );
  useEffect(() => {
    const handle = ref.current;
    if (!handle) return;
    const down = (event: PointerEvent) => {
      const cleanup = board.interactions.startResize(event, {
        onResizeStart: start,
        onResize: move,
        onResizeEnd: end,
      });
      if (cleanup) cancel.current = cleanup;
    };
    handle.addEventListener("pointerdown", down);
    return () => {
      handle.removeEventListener("pointerdown", down);
      cancel.current?.();
      cancel.current = undefined;
    };
  }, [board, ref, start, move, end]);
};

export default useResize;
