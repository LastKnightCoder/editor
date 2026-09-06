import { Editor, Path, Transforms } from "slate";
import type { TabsElement } from "../../../types";

export const deleteCurTab = (editor: Editor, tabsEle: TabsElement, tabsPath: Path) => {
  // 删除当前 Tab
  const { activeKey } = tabsEle;
  // 协作文档初始化时标签页元数据可能尚未投影到 Slate 节点。
  if (!Array.isArray(tabsEle.tabsContent)) {
    return;
  }
  const { tabsContent } = tabsEle;
  const nextTab = tabsContent.find(tab => tab.key !== activeKey);
  const newTabsContent = tabsContent.filter(tab => tab.key !== activeKey);
  if (!nextTab) {
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: tabsPath,
      });
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
    });
  } else {
    const { key, content } = nextTab;
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: tabsPath,
      });
      Transforms.insertNodes(
        editor,
        {
          type: "tabs",
          tabsContent: newTabsContent,
          activeKey: key,
          children: content as any,
        },
        {
          at: tabsPath,
        }
      );
    });
  }
};
