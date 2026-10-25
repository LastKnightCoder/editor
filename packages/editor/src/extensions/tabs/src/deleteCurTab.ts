import { elementView } from "@tau/editor/api";
import { Editor, NodeEntry, Path, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { TabPaneElement, TabsElement } from "./types";

/**
 * 删除指定 pane 节点；若删除后 tabs 无剩余 pane 则整个 tabs 块退化为空段落。
 */
export const deleteCurTab = (editor: Editor, panePath: Path) => {
  if (ReactEditor.isReadOnly(editor) || panePath.length < 2 || !Editor.hasPath(editor, panePath))
    return;
  const [pane] = Editor.node(editor, panePath) as NodeEntry<TabPaneElement>;
  const tabsPath = Path.parent(panePath);
  const [tabsNode] = Editor.node(editor, tabsPath) as NodeEntry<TabsElement>;
  if (pane.type !== "tab-pane" || tabsNode.type !== "tabs") return;
  const panes = ((tabsNode as TabsElement).children || []).filter(
    child => child.type === "tab-pane"
  ) as TabPaneElement[];
  const view = elementView(editor, tabsNode);
  const previousKey = view.getSnapshot().activeKey;
  const remaining = panes.filter(item => item.tabKey !== pane.tabKey);

  Editor.withoutNormalizing(editor, () => {
    if (remaining.length === 0) {
      Transforms.removeNodes(editor, { at: tabsPath });
      Transforms.insertNodes(
        editor,
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
        {
          at: tabsPath,
          select: true,
        }
      );
    } else {
      Transforms.removeNodes(editor, { at: panePath });
      const activeKey = remaining.some(item => item.tabKey === previousKey)
        ? previousKey
        : remaining[0].tabKey;
      if (activeKey !== previousKey) {
        view.update({ activeKey });
        const nextIndex = remaining.findIndex(item => item.tabKey === activeKey);
        Transforms.select(editor, Editor.start(editor, [...tabsPath, nextIndex]));
      }
    }
  });
};
