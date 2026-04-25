import {
  Editor,
  Element as SlateElement,
  Range,
  Transforms,
  Path,
} from "slate";
import { isParagraphAndEmpty } from "../../../utils";

export const insertBreak = (editor: Editor) => {
  const { insertBreak } = editor;
  editor.insertBreak = () => {
    const [listMatch] = Editor.nodes(editor, {
      match: (n) => SlateElement.isElement(n) && n.type === "check-list-item",
      mode: "lowest",
    });
    if (listMatch) {
      const [paragraphMatch] = Editor.nodes(editor, {
        match: (n) => SlateElement.isElement(n) && n.type === "paragraph",
        mode: "lowest",
      });

      // 在行首，并且内容为空
      if (isParagraphAndEmpty(editor)) {
        const [, checkListItemPath] = listMatch;
        const parent = Editor.parent(editor, checkListItemPath);

        if (parent[0].type === "check-list") {
          const checkListPath = parent[1];
          const checkList = parent[0];
          const itemIndex = checkListItemPath[checkListItemPath.length - 1];

          // 判断是否是最后一个 check-list-item
          const isLastItem = itemIndex === checkList.children.length - 1;

          if (isLastItem) {
            let grandParent = null;
            try {
              grandParent = Editor.parent(editor, checkListPath);
            } catch (e) {
              console.error("e", e);
            }

            if (grandParent && grandParent[0].type === "check-list-item") {
              // 把自己移动到 grandParent 的后面
              Editor.withoutNormalizing(editor, () => {
                Transforms.moveNodes(editor, {
                  at: checkListItemPath,
                  to: Path.next(grandParent[1]),
                });
              });
            } else {
              // 把自己转化为一个段落，在父级 check-list 之后
              Editor.withoutNormalizing(editor, () => {
                // 删除当前的 check-list-item
                Transforms.removeNodes(editor, {
                  at: checkListItemPath,
                });

                // 在 check-list 之后插入一个段落
                Transforms.insertNodes(
                  editor,
                  {
                    type: "paragraph",
                    children: [{ type: "formatted", text: "" }],
                  },
                  {
                    at: Path.next(checkListPath),
                  },
                );

                // 将光标移动到新段落
                Transforms.select(editor, Path.next(checkListPath));
              });
            }
          } else {
            // 不是最后一个，在后面插入一个 check-list-item，带有一个空段落
            Editor.withoutNormalizing(editor, () => {
              Transforms.insertNodes(
                editor,
                {
                  type: "check-list-item",
                  checked: false,
                  children: [
                    {
                      type: "paragraph",
                      children: [{ type: "formatted", text: "" }],
                    },
                  ],
                },
                {
                  at: Path.next(checkListItemPath),
                },
              );

              // 将光标移动到新的 check-list-item
              Transforms.select(editor, [
                ...Path.next(checkListItemPath),
                0,
                0,
              ]);
            });
          }
          return; // 阻止默认行为
        }
      }

      if (paragraphMatch) {
        const [, checkListItemPath] = listMatch;
        const [, paragraphPath] = paragraphMatch;
        const { selection } = editor;

        if (
          selection &&
          Range.isCollapsed(selection) &&
          paragraphPath.length === checkListItemPath.length + 1 &&
          paragraphPath[paragraphPath.length - 1] === 0 &&
          Editor.isEnd(editor, selection.anchor, paragraphPath)
        ) {
          Editor.withoutNormalizing(editor, () => {
            Transforms.insertNodes(
              editor,
              {
                type: "check-list-item",
                checked: false,
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "formatted", text: "" }],
                  },
                ],
              },
              {
                at: Path.next(checkListItemPath),
              },
            );

            Transforms.select(editor, [...Path.next(checkListItemPath), 0, 0]);
          });
          return;
        }
      }
    }
    // 不为空或不是 check-list-item，执行默认行为
    insertBreak();
  };

  return editor;
};
