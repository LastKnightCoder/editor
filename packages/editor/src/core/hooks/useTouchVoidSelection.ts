import { useMemoizedFn } from "ahooks";
import { Editor, Range, Transforms, type Element } from "slate";
import { useReadOnly, useSelected, useSlateSelector, useSlateStatic } from "slate-react";
import { getCommandElementPath } from "../utils/commandTarget";
import { useTouchInteraction } from "../services/interaction";

/**
 * 触屏模式下 void 块（媒体、源码块等）的选中：选中即 Slate 选区折叠在该 void 内，宿主工具栏据选区识别并接管操作；
 * 非触屏模式 selected 恒为 false，组件沿用自身的选中状态。
 */
export function useTouchVoidSelection(element: Element) {
  const editor = useSlateStatic();
  const touch = useTouchInteraction();
  const readOnly = useReadOnly();
  const inSelection = useSelected();
  // 只订阅「选区是否折叠」这个布尔值，打字移动光标不让文档里的每个 void 块重渲染
  const collapsed = useSlateSelector(
    current => !!current.selection && Range.isCollapsed(current.selection)
  );
  const selected = touch && !readOnly && inSelection && collapsed;

  const select = useMemoizedFn(() => {
    const path = getCommandElementPath(editor, { element });
    if (path) Transforms.select(editor, Editor.start(editor, path));
  });

  return { touch, selected, select };
}
