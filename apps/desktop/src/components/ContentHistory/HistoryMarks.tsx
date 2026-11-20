import { useEffect, useMemo, useRef } from "react";
import { createElement, type ComponentType } from "react";
import { Editor, Element, Text, type Range } from "slate";
import type { NodeEntry } from "slate";
import { ReactEditor } from "slate-react";
import type { Editor as SlateEditor } from "slate";
import type { EditorProps, MarkRenderProps } from "@tau/editor";
import type { DocumentHistoryChange, DocumentHistoryPreview } from "@tau/collaboration";

/** 装饰附加键：装饰 Range 与叶子渲染层之间的私有协议 */
const HISTORY_MARK = "historyMark";

type HistoryMarkKind = "insert" | "modify" | "move";

const MARK_CLASS: Record<HistoryMarkKind, string> = {
  insert: "rounded-[3px] bg-ok-soft",
  modify: "rounded-[3px] bg-accent-soft",
  move: "rounded-[3px] bg-info-soft",
};

function HistoryMarkLeaf({ leaf, children }: MarkRenderProps) {
  const mark = (leaf as unknown as Record<string, unknown>)[HISTORY_MARK] as
    | { kind: HistoryMarkKind }
    | undefined;
  if (!mark) return <>{children}</>;
  return <span className={MARK_CLASS[mark.kind]}>{children}</span>;
}

/**
 * 选中一条历史记录后，在活编辑器上标出这次编辑涉及的块：
 * 软底装饰（新增绿 / 修改橙 / 移动蓝）+ 块根 data-history-mark 序号（连接线与明细区的锚点）。
 * 已被后续编辑移除的块找不到 DOM，静默跳过（“找不到就不画”惯例）。
 */
export function useHistoryMarks(
  preview: DocumentHistoryPreview | undefined,
  getEditor: () => SlateEditor | undefined
) {
  const changes = preview?.changes;
  // delete 的块在当前正文里必然不存在，不进装饰目标
  const targets = useMemo(() => {
    const map = new Map<string, HistoryMarkKind>();
    if (!changes) return map;
    for (const change of changes) {
      if (change.kind === "insert" || change.kind === "modify" || change.kind === "move")
        map.set(change.blockId, change.kind);
    }
    return map;
  }, [changes]);

  const decorate = useMemo(
    () =>
      (entry: NodeEntry): Range[] => {
        const editor = getEditor();
        const [node, path] = entry;
        if (!editor || targets.size === 0 || !Text.isText(node) || !path.length) return [];
        if (!Editor.hasPath(editor, path) || !node.text.length) return [];
        // 沿祖先向外找命中的块：嵌套块（列表项）自身不在目标里时继续向外到顶层块
        for (const [ancestor] of Editor.levels(editor, { at: path, reverse: true })) {
          if (!Element.isElement(ancestor) || !("collabId" in ancestor)) continue;
          const kind = targets.get(String(ancestor.collabId));
          if (!kind) continue;
          return [
            {
              anchor: { path, offset: 0 },
              focus: { path, offset: node.text.length },
              ...{ [HISTORY_MARK]: { kind } },
            },
          ];
        }
        return [];
      },
    [targets, getEditor]
  );

  const leafWrapper = useMemo(() => (targets.size ? HistoryMarkLeaf : undefined), [targets]);

  // 块根序号 + 滚动定位：装饰画的是文字叶子，块根 DOM 标记在这里做（toDOMNode 定位样板 useContentLocation）
  const changesKey = changes?.map(change => `${change.blockId}:${change.kind}`).join("|") ?? "";
  const markedRef = useRef<HTMLElement[]>([]);
  useEffect(() => {
    markedRef.current = [];
    const editor = getEditor();
    if (!editor || !changes) return;
    const marked: HTMLElement[] = [];
    changes.forEach((change, index) => {
      const top = editor.children.find(
        child =>
          Element.isElement(child) &&
          "collabId" in child &&
          String(child.collabId) === change.blockId
      );
      if (!top) return;
      try {
        const element = ReactEditor.toDOMNode(editor, top);
        element.setAttribute("data-history-mark", String(index + 1));
        marked.push(element);
      } catch {
        /* 正文切换时节点可能已卸载 */
      }
    });
    markedRef.current = marked;
    if (marked.length)
      requestAnimationFrame(() =>
        marked[0].scrollIntoView({ behavior: "smooth", block: "center" })
      );
    return () => {
      for (const element of markedRef.current) element.removeAttribute("data-history-mark");
      markedRef.current = [];
    };
    // changesKey 压平依赖：changes 数组随每次预览查询新造
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getEditor, changesKey]);

  return { decorate, leafWrapper };
}

type MarkLayer = Pick<EditorProps, "decorate" | "leafWrapper">;

/**
 * 合并两层编辑器标注（如 insights 与编辑历史）：decorate 结果拼接，
 * leafWrapper 嵌套包装——两层各自按自己的键渲染，互不感知。
 */
export function composeEditorMarks(base: MarkLayer, layer: MarkLayer): MarkLayer {
  const decorate =
    base.decorate || layer.decorate
      ? (entry: NodeEntry): Range[] => [
          ...(base.decorate?.(entry) ?? []),
          ...(layer.decorate?.(entry) ?? []),
        ]
      : undefined;
  const leafWrapper = composeLeafWrappers(base.leafWrapper, layer.leafWrapper);
  return { decorate, leafWrapper };
}

function composeLeafWrappers(
  base: ComponentType<MarkRenderProps> | undefined,
  layer: ComponentType<MarkRenderProps> | undefined
): ComponentType<MarkRenderProps> | undefined {
  if (!base) return layer;
  if (!layer) return base;
  const outer = base;
  const inner = layer;
  function ComposedLeaf(props: MarkRenderProps) {
    // 外层处理自己的标记后，把内层包装的结果作为 children 传入
    return createElement(outer, props, createElement(inner, props));
  }
  return ComposedLeaf;
}

/** 历史明细行的展示文本：块内全部后代文字拼接（与旧弹窗 blockText 同源） */
export function blockText(node: DocumentHistoryChange["before"]): string {
  if (!node) return "";
  return node.text ?? node.children?.map(blockText).join("") ?? "";
}
