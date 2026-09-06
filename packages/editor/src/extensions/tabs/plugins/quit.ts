import { Editor, NodeEntry, Path, Transforms } from "slate";
import type { Element as SlateElement } from "slate";
import type { ParagraphElement, TabPaneElement } from "../../../types";

const createParagraph = (): ParagraphElement => ({
  type: "paragraph",
  children: [
    {
      type: "formatted",
      text: "",
    },
  ],
});

// 在 Tab 的最后一个空段落上按回车：删除该段落并跳出 tabs 块
const hitDoubleQuit = (editor: Editor): boolean => {
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

export const quit = (editor: Editor) => {
  const { insertBreak } = editor;

  // 当在 Tab 最后一个空段落按下回车时，删除该段落并跳出 tabs 块
  editor.insertBreak = () => {
    if (hitDoubleQuit(editor)) {
      return;
    }

    return insertBreak();
  };

  return editor;
};
