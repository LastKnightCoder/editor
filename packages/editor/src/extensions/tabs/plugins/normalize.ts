import { Editor, NodeEntry, Transforms } from "slate";
import { migrateTabsNode, hasSubstantialContent } from "@tau/collaboration";
import type { ContentNode } from "@tau/collaboration";
import type { ParagraphElement, TabPaneElement, TabsElement } from "../../../types";

const createParagraph = (): ParagraphElement => ({
  type: "paragraph",
  children: [
    {
      type: "formatted",
      text: "",
    },
  ],
});

// 旧数据（tabsContent 形态）读入编辑器时转换为 tab-pane 子节点形态
const migrateLegacyTabs = (editor: Editor, node: TabsElement, path: number[]) => {
  const { node: migrated, replacedBy } = migrateTabsNode(node as unknown as ContentNode);
  Editor.withoutNormalizing(editor, () => {
    if (replacedBy) {
      Transforms.removeNodes(editor, { at: path });
      Transforms.insertNodes(editor, replacedBy as unknown as TabPaneElement, { at: path });
      return;
    }
    const panes = (migrated.children || []) as unknown as TabPaneElement[];
    for (let i = node.children.length - 1; i >= 0; i--) {
      Transforms.removeNodes(editor, { at: [...path, i] });
    }
    Transforms.insertNodes(editor, panes, { at: [...path, 0] });
    Transforms.setNodes(
      editor,
      { activeKey: migrated.activeKey as string, tabsContent: undefined },
      { at: path }
    );
  });
};

const hitEmpty = (editor: Editor, [node, path]: NodeEntry) => {
  if (node.type !== "tabs") {
    return false;
  }

  const tabsEle = node as TabsElement;
  const children = Array.isArray(tabsEle.children) ? tabsEle.children : [];
  const hasPane = children.some(child => child.type === "tab-pane");

  // 旧数据形态：tabsContent 存在时读入迁移
  if (Array.isArray(tabsEle.tabsContent)) {
    migrateLegacyTabs(editor, tabsEle, path);
    return true;
  }

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
  if (!hasPane && hasSubstantialContent(children as unknown as ContentNode[])) {
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
  if (panes.length > 0 && !panes.some(pane => pane.tabKey === tabsEle.activeKey)) {
    Transforms.setNodes(editor, { activeKey: panes[0].tabKey }, { at: path });
    return true;
  }

  return false;
};

const hitPaneInvalid = (editor: Editor, [node, path]: NodeEntry) => {
  if (node.type !== "tab-pane") {
    return false;
  }

  // 孤儿 pane（不在 tabs 内）：提升内容并去掉容器
  if (path.length > 1) {
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

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (hitEmpty(editor, [node, path])) {
      return;
    }
    if (hitPaneInvalid(editor, [node, path])) {
      return;
    }

    normalizeNode([node, path]);
  };

  return editor;
};
