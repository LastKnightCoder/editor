import { Editor, Element, Transforms } from "slate";

// 当多列布局没有子元素的时候，删除当前列
export const normalizeColumnLayout = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry) => {
    const [ele, path] = entry;
    if (!Element.isElement(ele) || ele.type !== "multi-column-container") {
      normalizeNode(entry);
      return;
    }

    if (ele.children.length === 0) {
      Transforms.delete(editor, {
        at: path,
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
          select: true,
        },
      );
      return;
    }

    normalizeNode(entry);
  };

  return editor;
};
