import {
  Editor,
  NodeEntry,
  Path,
  Element as SlateElement,
  Transforms,
} from "slate";
import {
  CheckListElement,
  CheckListItemElement,
  ParagraphElement,
} from "@/components/Editor/types";

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    // 处理check-list节点
    if (SlateElement.isElement(node) && node.type === "check-list") {
      // 确保check-list的子节点都是check-list-item
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type !== "check-list-item") {
          // 如果是 paragraph 节点，则转换为 check-list-item，否则删除
          if (child.type === "paragraph") {
            Transforms.wrapNodes(
              editor,
              {
                type: "check-list-item",
                checked: false,
                children: [child as unknown as ParagraphElement],
              },
              { at: [...path, i] },
            );
            return;
          } else {
            Transforms.removeNodes(editor, { at: [...path, i] });
            return;
          }
        }
      }

      // 如果check-list没有子节点，则移除它
      if (children.length === 0) {
        Transforms.removeNodes(editor, {
          at: path,
        });
        return;
      }
      try {
        const prevNode = Editor.node(editor, Path.previous(path));
        if (prevNode[0].type === "check-list") {
          editor.withoutNormalizing(() => {
            // 提起出 children，删除当前节点，设置上一个兄弟节点
            const children = node.children;
            Transforms.removeNodes(editor, { at: path });
            Transforms.setNodes(
              editor,
              {
                type: "check-list",
                children: (
                  prevNode as NodeEntry<CheckListElement>
                )[0].children.concat(children),
              },
              { at: Path.previous(path) },
            );
          });
          return;
        }
      } catch (error) {
        // 没有上一个兄弟节点，则删除当前节点，不做任何处理
      }
    }

    // 处理check-list-item节点
    if (SlateElement.isElement(node) && node.type === "check-list-item") {
      // 如果不在 check-list 中，则创建一个 check-list，并且把自己插入到 check-list 中
      if (Editor.parent(editor, path)[0].type !== "check-list") {
        Transforms.wrapNodes(
          editor,
          { type: "check-list", children: [node] },
          { at: path },
        );
        return;
      }

      const children = node.children;

      // 确保第一个子节点是paragraph
      // @ts-ignore
      if (
        children.length === 0 ||
        (children.length >= 1 && children[0].type !== "paragraph")
      ) {
        // 删除此节点
        Transforms.removeNodes(editor, { at: path });
        return;
      }

      // 确保只有一个paragraph和可选的一个check-list
      if (children.length >= 2) {
        // 收集所有 paragraph 节点和 check-list 节点，就相当于找到第一个 check-list 前的所有 paragraph 节点，而后面的所有的都忽略
        const paragraphNodes: ParagraphElement[] = [];
        let checkListNode: CheckListElement | null = null;

        for (let i = 0; i < children.length; i++) {
          if (children[i].type === "paragraph") {
            paragraphNodes.push(children[i] as unknown as ParagraphElement);
          } else if (children[i].type === "check-list") {
            checkListNode = children[i] as unknown as CheckListElement;
            break;
          }
        }

        // 除了最后一个 paragraph 节点，其他的都根据 paragraph 节点生成 check-list-item，插入到前面
        // 最后一个和 check-list 作为 children 更新当前节点
        if (paragraphNodes.length > 0) {
          if (paragraphNodes.length === 1) {
            // 否则会无限循环
            return;
          }
          editor.withoutNormalizing(() => {
            const newCheckListItems: CheckListItemElement[] = [];
            for (let i = 0; i < paragraphNodes.length - 1; i++) {
              const paragraphNode = paragraphNodes[i];
              newCheckListItems.push({
                type: "check-list-item",
                checked: false,
                children: [paragraphNode],
              });
            }

            // 删除上面所有的 paragraph 节点
            for (let i = 0; i < paragraphNodes.length - 1; i++) {
              Transforms.removeNodes(editor, { at: [...path, i] });
            }

            const newChildren = checkListNode
              ? [paragraphNodes[paragraphNodes.length - 1], checkListNode]
              : [paragraphNodes[paragraphNodes.length - 1]];

            Transforms.setNodes(
              editor,
              {
                children: newChildren,
              },
              { at: path },
            );

            Transforms.insertNodes(editor, newCheckListItems, { at: path });
          });
        } else {
          // 如果没有 paragraph 节点，则删除此节点
          Transforms.removeNodes(editor, { at: path });
        }

        return;
      }
    }

    // 调用原始的normalizeNode
    normalizeNode([node, path]);
  };

  return editor;
};
