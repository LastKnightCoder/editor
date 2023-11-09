import { Editor, NodeEntry, Transforms } from "slate";
import { isParagraphAndEmpty } from "@/components/Editor/utils";
import { TabsElement } from "@/components/Editor/types";

export const deleteEmptyTab = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const [match] = Editor.nodes(editor, {
      match: n => n.type === 'tabs'
    });
    if (!match) {
      return deleteBackward(unit);
    }

    const [tabsEle, tabsPath] = match as NodeEntry<TabsElement>;
    if (tabsEle.children.length > 1 || !isParagraphAndEmpty(editor)) {
      return deleteBackward(unit);
    }

    // 删除当前 Tab
    const { tabsContent, activeKey } = tabsEle;
    const nextTab = tabsContent.find(tab => tab.key !== activeKey);
    const newTabsContent = tabsContent.filter(tab => tab.key !== activeKey);
    if (!nextTab) {
      Transforms.delete(editor, {
        at: tabsPath,
      });
      Transforms.insertNodes(editor, {
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: ''
        }]
      }, {
        at: tabsPath,
        select: true,
      });
    } else {
      const { key, content } = nextTab;
      Transforms.delete(editor, {
        at: tabsPath,
      });
      Transforms.insertNodes(editor, {
        type: 'tabs',
        tabsContent: newTabsContent,
        activeKey: key,
        children: content as any,
      }, {
        at: tabsPath,
        select: true,
      });
    }
  }

  return editor;
}
