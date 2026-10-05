import { useMemo, useSyncExternalStore } from "react";
import { useMemoizedFn } from "ahooks";
import { useBoard } from "./useBoard";
import type { ElementSketch, PageSketch, ResolvedSketch } from "../types";
import { resolveSketch } from "../utils/sketch";

/** 当前页的画风；页级切换（set_sketch）时触发重渲染 */
export function usePageSketch(): PageSketch {
  const board = useBoard();
  const subscribe = useMemoizedFn((callback: () => void) => {
    board.on("sketchChange", callback);
    return () => board.off("sketchChange", callback);
  });
  const getSnapshot = useMemoizedFn(() => board.sketch);
  return useSyncExternalStore(subscribe, getSnapshot);
}

interface SketchCarrier {
  id: string;
  type: string;
  sketch?: ElementSketch;
}

/**
 * 元素的生效画风。元素组件都是 memo、只随 element 引用变化，
 * 页级画风必须在组件内订阅，不能靠插件 render 传参。
 * owner：思维导图节点传根节点（整棵树共用覆盖），其余元素省略。
 */
export function useSketch(element: SketchCarrier, owner?: SketchCarrier | null): ResolvedSketch {
  const page = usePageSketch();
  const { id, type, sketch } = element;
  const ownerId = owner?.id;
  const ownerSketch = owner?.sketch;
  return useMemo(
    () =>
      resolveSketch(
        page,
        { id, type, sketch },
        ownerId ? { id: ownerId, type: "mind-node", sketch: ownerSketch } : undefined
      ),
    [page, id, type, sketch, ownerId, ownerSketch]
  );
}
