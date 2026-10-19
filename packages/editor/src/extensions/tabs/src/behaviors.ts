import { Editor, NodeEntry, Path, Transforms } from "slate";
import type { Element as SlateElement } from "slate";

import type { ElementBehaviors } from "@tau/editor/api";
import type { ParagraphElement, TabPaneElement, TabsElement } from "./types";
import { isParagraphAndEmpty } from "@tau/editor/api";
import { deleteCurTab } from "./deleteCurTab";

// children 的宽松结构口径：规范化阶段会见到占位、空段落等非正式形态
type ChildNode = { type?: string; text?: string; children?: unknown[] };

// 协作 Yjs 树的占位 children（单个空 formatted），不代表真实内容
const isPlaceholderChildren = (children: unknown): boolean =>
  Array.isArray(children) &&
  children.length === 1 &&
  children[0].type === "formatted" &&
  children[0].text === "";

const isEmptyParagraph = (node: ChildNode): boolean =>
  node?.type === "paragraph" &&
  Array.isArray(node.children) &&
  node.children.length === 1 &&
  (node.children[0] as ChildNode).type === "formatted" &&
  (node.children[0] as ChildNode).text === "";

/** children 是否承载实质内容（排除占位与空段落） */
const hasSubstantialContent = (children: unknown): boolean => {
  if (!Array.isArray(children) || children.length === 0) return false;
  if (
    children.length === 1 &&
    (isEmptyParagraph(children[0] as ChildNode) || isPlaceholderChildren(children))
  )
    return false;
  return true;
};

const createParagraph = (): ParagraphElement => ({
  type: "paragraph",
  children: [
    {
      type: "formatted",
      text: "",
    },
  ],
});

/** tabs 容器规范化：空容器退化、普通块子内容包进 pane、activeKey 修正 */
const normalizeTabs: ElementBehaviors<TabsElement>["normalize"] = (editor, [node, path]) => {
  const children = Array.isArray(node.children) ? node.children : [];
  const hasPane = children.some(child => child.type === "tab-pane");

  // 无任何 Tab 内容：整个 tabs 块退化为空段落
  if (children.length === 0) {
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: path });
      Transforms.insertNodes(editor, createParagraph(), { at: path });
    });
    return true;
  }

  // 无 pane 但有实质内容的普通块子节点：包进单个 pane，避免内容游离在 tabs 直接子层。
  // 空壳（占位/空段落）保持不动——可能是其它版本代码写入的脏形态，不能洗成正式结构。
  if (!hasPane && hasSubstantialContent(children)) {
    Editor.withoutNormalizing(editor, () => {
      for (let i = children.length - 1; i >= 0; i--) {
        Transforms.removeNodes(editor, { at: [...path, i] });
      }
      Transforms.insertNodes(
        editor,
        {
          type: "tab-pane",
          tabKey: crypto.randomUUID(),
          title: "Tab 1",
          children: children as TabPaneElement["children"],
        },
        { at: [...path, 0] }
      );
    });
    return true;
  }

  // activeKey 失效时修正为第一个 pane（无 pane 的空壳形态保持不动）
  const panes = children.filter(child => child.type === "tab-pane") as TabPaneElement[];
  if (panes.length > 0 && !panes.some(pane => pane.tabKey === node.activeKey)) {
    Transforms.setNodes(editor, { activeKey: panes[0].tabKey }, { at: path });
    return true;
  }

  return false;
};

/** 孤儿 pane（不在 tabs 内）提升内容；裸文本子节点包进段落 */
const normalizePane: ElementBehaviors<TabPaneElement>["normalize"] = (editor, [node, path]) => {
  // 孤儿 pane（不在 tabs 内）：提升内容并去掉容器
  if (path.length > 0) {
    const [parent] = Editor.parent(editor, path);
    if ((parent as { type?: string }).type !== "tabs") {
      Transforms.unwrapNodes(editor, { at: path });
      return true;
    }
  }

  // 异常的文本子节点：包进段落
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length === 1 && (children[0] as { type?: string }).type === "formatted") {
    Transforms.wrapNodes(editor, createParagraph(), { at: [...path, 0] });
    return true;
  }

  return false;
};

/** Tab 的最后一个空段落上回车：删除该段落并跳出 tabs 块 */
const insertBreak: ElementBehaviors<TabPaneElement>["insertBreak"] = editor => {
  const [paneMatch] = Editor.nodes(editor, {
    match: n => n.type === "tab-pane",
    mode: "lowest",
  });
  const [paraMatch] = Editor.nodes(editor, {
    match: n => n.type === "paragraph",
    mode: "lowest",
  });

  if (!paneMatch || !paraMatch) return false;

  const [pane, panePath] = paneMatch as NodeEntry<TabPaneElement>;
  const [para, paraPath] = paraMatch as NodeEntry<SlateElement>;
  const paraIndex = paraPath[paraPath.length - 1];
  const isDirectChild = paraPath.length === panePath.length + 1;
  const isLast = paraIndex === (pane.children || []).length - 1;

  if (!isDirectChild || !isLast || !Editor.isEmpty(editor, para)) {
    return false;
  }

  const tabsPath = Path.parent(panePath);
  Editor.withoutNormalizing(editor, () => {
    if (paraIndex === 0) {
      // Tab 内仅剩当前空段落：移除整个 pane，tabs 位置还原为段落
      Transforms.removeNodes(editor, { at: panePath });
      Transforms.insertNodes(editor, createParagraph(), { at: tabsPath, select: true });
    } else {
      // 删除空段落并在 tabs 块后插入空段落，光标跳出
      Transforms.delete(editor, { at: paraPath });
      Transforms.insertNodes(editor, createParagraph(), {
        at: Path.next(tabsPath),
        select: true,
      });
    }
  });
  return true;
};

/** 当前 Tab（pane）内容仅剩一个空段落时，退格删除整个 Tab */
const deleteBackward: ElementBehaviors<TabPaneElement>["deleteBackward"] = (
  editor,
  [node, path]
) => {
  if (node.children.length > 1 || !isParagraphAndEmpty(editor)) {
    return false;
  }
  deleteCurTab(editor, path);
  return true;
};

export const tabsBehaviors: ElementBehaviors<TabsElement> = {
  normalize: normalizeTabs,
};

export const tabPaneBehaviors: ElementBehaviors<TabPaneElement> = {
  insertBreak,
  deleteBackward,
  normalize: normalizePane,
};
