/**
 * 阅读纸里和白板相连的部分：
 * - 底栏「相连」：白板上和这张卡有箭头相连的元素（文档卡、其他元素按名称），点一下换到那张卡；
 * - 正文里的内联引用可以拖出纸面，落成文档卡并连回这张卡（拖放走 materialDrag）；拖回纸面里不算。
 */

import { useEffect, useMemo, type RefObject } from "react";
import { useMemoizedFn } from "ahooks";
import { Link2 } from "lucide-react";
import {
  ViewPortTransforms,
  isDocumentElement,
  useBoard,
  type BoardElement,
  type DocumentElement,
} from "@tau/whiteboard";
import { normalizeEntityRefKind } from "@/entity/ref";
import { MATERIAL_MIME, setMaterialDrag } from "./materialDrag";
import { toInsertTarget } from "./insert";
import type { EntityKind } from "@/types";

interface Neighbor {
  element: BoardElement;
  label: string;
}

const nameOf = (element: BoardElement) => {
  if (isDocumentElement(element)) return (element as DocumentElement).title || "无标题文档";
  const text = typeof element.text === "string" ? element.text : "";
  return text.trim() || "画布元素";
};

/** 箭头两端都绑定、一端是这张卡的另一端元素；去重，按出现顺序 */
export function neighborsOf(children: readonly BoardElement[], id: string): Neighbor[] {
  const byId = new Map(children.map(element => [element.id, element]));
  const seen = new Set<string>();
  const result: Neighbor[] = [];
  for (const element of children) {
    if (element.type !== "arrow") continue;
    const source = element.source?.bindId as string | undefined;
    const target = element.target?.bindId as string | undefined;
    const other = source === id ? target : target === id ? source : undefined;
    if (!other || other === id || seen.has(other)) continue;
    const found = byId.get(other);
    if (!found) continue;
    seen.add(other);
    result.push({ element: found, label: nameOf(found) });
  }
  return result;
}

export function ReaderLinkBar({
  element,
  onSwitch,
}: {
  element: DocumentElement;
  /** 换到另一张文档卡（停靠时换篇，居中时收起后定位） */
  onSwitch(target: BoardElement): void;
}) {
  const board = useBoard();
  const neighbors = useMemo(
    () => neighborsOf(board.children, element.id),
    // children 引用随每次提交变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.children, element.id]
  );
  if (neighbors.length === 0) return null;
  return (
    <div className="border-line-1 flex min-h-[46px] shrink-0 items-center gap-1.5 overflow-x-auto border-t px-3 py-[7px]">
      <span className="text-ink-3 mr-0.5 flex shrink-0 items-center gap-1 text-[12px]">
        <Link2 className="size-3.5" strokeWidth={1.75} />
        相连
      </span>
      {neighbors.map(({ element: other, label }) => (
        <button
          key={other.id}
          type="button"
          onClick={() => onSwitch(other)}
          className="text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-7 max-w-[220px] shrink-0 items-center rounded-[8px] px-2.5 text-[12.5px]"
        >
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** 居中阅读时点了相连的非文档元素：收起后镜头带过去 */
export function locateElement(board: ReturnType<typeof useBoard>, target: BoardElement) {
  board.select([target.id]);
  ViewPortTransforms.centerElementsIfNotInViewPort(board, [target]);
  board.flashElement(target.id);
}

/**
 * 让纸面里的内联引用（content-link）可以拖出：捕获阶段在拖动开始时把引用换成物料数据。
 * 编辑器里的链接本身不可拖，这里给它们打上 draggable，拖出纸面落到画布上才生效。
 */
export function useReferenceDragOut(
  scrollRef: RefObject<HTMLElement | null>,
  element: DocumentElement,
  enabled: boolean
) {
  const onDragStart = useMemoizedFn((event: DragEvent) => {
    const link = (event.target as Element | null)?.closest?.("[data-content-link]");
    if (!(link instanceof HTMLElement)) return;
    const kind = normalizeEntityRefKind(link.dataset.contentType);
    const id = Number(link.dataset.refId);
    const candidateKind = (kind === "project-item" ? "project_item" : kind) as EntityKind | null;
    const target =
      candidateKind && Number.isFinite(id)
        ? toInsertTarget({ kind: candidateKind, id, title: link.textContent ?? "" })
        : null;
    if (!target) return;
    event.stopPropagation();
    setMaterialDrag(event, { targets: [target], linkFrom: element.id });
  });

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !enabled) return;
    const mark = () =>
      root
        .querySelectorAll<HTMLElement>("[data-content-link]:not([draggable])")
        .forEach(link => link.setAttribute("draggable", "true"));
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(root, { childList: true, subtree: true });
    // 拖回纸面里不算放入，也不让编辑器把它当文字插进正文
    const swallow = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes(MATERIAL_MIME)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "dragover") event.dataTransfer.dropEffect = "none";
    };
    root.addEventListener("dragstart", onDragStart, true);
    root.addEventListener("dragover", swallow, true);
    root.addEventListener("drop", swallow, true);
    return () => {
      observer.disconnect();
      root.removeEventListener("dragstart", onDragStart, true);
      root.removeEventListener("dragover", swallow, true);
      root.removeEventListener("drop", swallow, true);
    };
  }, [scrollRef, enabled, onDragStart]);
}
