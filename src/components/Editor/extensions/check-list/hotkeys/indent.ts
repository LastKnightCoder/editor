import { IHotKeyConfig } from "@/components/Editor/types";
import { Editor, Transforms, Path } from "slate";
import {
  getParentNodeByNode,
  isAtParagraphStart,
  getPreviousSiblingNode,
  isCheckListItemElement,
} from "@/components/Editor/utils";
import { message } from "antd";
import { CheckListItemElement } from "@/components/Editor/types";

export const indent: IHotKeyConfig[] = [
  {
    hotKey: "Tab",
    action: (editor, event) => {
      const [match] = Editor.nodes(editor, {
        match: (n) => n.type === "check-list-item",
        mode: "lowest",
      });
      const [para] = Editor.nodes(editor, {
        match: (n) => n.type === "paragraph",
      });

      // 在段落的开头
      // 是第一个段落
      // 前面必须还有 check-list-item
      if (
        para &&
        match &&
        isAtParagraphStart(editor) &&
        para[1][para[1].length - 1] === 0 &&
        match[1][match[1].length - 1] !== 0
      ) {
        const parent = getParentNodeByNode(editor, match[0]);
        const parentType = parent[0].type;
        if (parentType !== "check-list") {
          message.error("check-list-item 必须在 check-list 中");
          return;
        }

        // 获取上一个兄弟节点
        const previousSibling = getPreviousSiblingNode(editor, match[0]);
        if (!previousSibling || !isCheckListItemElement(previousSibling[0])) {
          // 如果没有上一个兄弟节点或者上一个兄弟节点不是 check-list-item，则不做任何操作
          return;
        }

        Editor.withoutNormalizing(editor, () => {
          const prevSiblingNode = previousSibling[0] as CheckListItemElement;

          // 检查上一个兄弟节点是否已经有 check-list
          if (
            prevSiblingNode.children.length === 2 &&
            prevSiblingNode.children[1].type === "check-list"
          ) {
            // 如果已经有 check-list，直接移动当前节点到该 check-list 中
            Transforms.moveNodes(editor, {
              match: (n) => n.type === "check-list-item",
              to: [
                ...previousSibling[1],
                1,
                prevSiblingNode.children[1].children.length,
              ],
            });
            Transforms.select(
              editor,
              Editor.start(editor, [
                ...previousSibling[1],
                1,
                prevSiblingNode.children[1].children.length,
              ]),
            );
          } else {
            // 如果没有 check-list，创建一个新的 check-list 并包裹当前节点
            Transforms.wrapNodes(
              editor,
              {
                type: "check-list",
                children: [],
              },
              {
                match: (n) => n.type === "check-list-item",
              },
            );

            // 将新创建的 check-list 移动到上一个兄弟节点中
            Transforms.moveNodes(editor, {
              match: (n) => n.type === "check-list",
              to: [...previousSibling[1], prevSiblingNode.children.length],
            });
            Transforms.select(
              editor,
              Editor.start(editor, [
                ...previousSibling[1],
                prevSiblingNode.children.length,
              ]),
            );
          }
        });

        event.preventDefault();
      }
    },
  },
  {
    hotKey: "shift+Tab",
    action: (editor, event) => {
      const [match] = Editor.nodes(editor, {
        match: (n) => n.type === "check-list-item",
        mode: "lowest",
      });
      const [para] = Editor.nodes(editor, {
        match: (n) => n.type === "paragraph",
      });

      // 在段落的开头
      // 是第一个段落
      if (
        para &&
        match &&
        isAtParagraphStart(editor) &&
        para[1][para[1].length - 1] === 0
      ) {
        const parent = getParentNodeByNode(editor, match[0]);

        // 确保父节点是 check-list
        if (parent[0].type !== "check-list") {
          return;
        }

        // 获取 check-list 的父节点（应该是另一个 check-list-item）
        const grandParent = getParentNodeByNode(editor, parent[0]);
        if (!grandParent || !isCheckListItemElement(grandParent[0])) {
          return;
        }

        // 获取当前 check-list-item 的路径
        const path = match[1];

        // 获取当前 check-list-item 在父 check-list 中的索引
        const index = path[path.length - 1];

        // 获取父 check-list 中当前节点之后的所有兄弟节点
        const siblings = parent[0].children.slice(index + 1);

        Editor.withoutNormalizing(editor, () => {
          // 将当前节点移动到祖父节点之后
          Transforms.moveNodes(editor, {
            match: (n) => n.type === "check-list-item",
            to: Path.next(grandParent[1]),
          });

          // 如果有兄弟节点，创建一个新的 check-list 并将它们移动到当前节点中
          if (siblings.length > 0) {
            // 先创建一个新的 check-list 作为当前节点的子节点
            const newPath = Path.next(grandParent[1]);

            // 检查当前节点是否已经有 check-list
            const currentNode = Editor.node(
              editor,
              newPath,
            )[0] as CheckListItemElement;
            let checkListPath: Path;

            if (
              currentNode.children.length === 2 &&
              currentNode.children[1].type === "check-list"
            ) {
              // 如果已经有 check-list，使用现有的
              checkListPath = [...newPath, 1];
            } else {
              // 如果没有，创建一个新的
              Transforms.insertNodes(
                editor,
                {
                  type: "check-list",
                  children: [],
                },
                { at: [...newPath, 1] },
              );
              checkListPath = [...newPath, 1];
            }

            // 移动所有兄弟节点到新的 check-list 中
            for (let i = 0; i < siblings.length; i++) {
              const siblingPath = [...parent[1], index + 1];
              Transforms.moveNodes(editor, {
                at: siblingPath,
                to: [...checkListPath, i],
              });
            }

            Transforms.select(
              editor,
              Editor.start(editor, [...checkListPath, siblings.length]),
            );
          }
        });

        event.preventDefault();
      }
    },
  },
];
