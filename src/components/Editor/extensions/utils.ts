import {
  Editor,
  Element as SlateElement,
  Node as SlateNode,
  NodeEntry,
  Path,
  Range,
  Transforms,
} from "slate";
import {
  NumberedListElement,
  BulletedListElement,
  ParagraphElement,
} from "@/components/Editor/types";

// 是否在段落的开头按下的空格
export const isAtFirst = (editor: Editor, text: string) => {
  const { selection } = editor;
  if (text.endsWith(" ") && selection && Range.isCollapsed(selection)) {
    const [match] = Editor.nodes(editor, {
      match: (n) => SlateElement.isElement(n) && n.type === "paragraph",
    });
    if (match) {
      const [parentElement] = match;
      const [nodeMatch] = Editor.nodes(editor, {
        match: (n) => SlateNode.isNode(n) && n.type === "formatted",
      });
      if (!nodeMatch) {
        return;
      }
      const [node, path] = nodeMatch;
      // node 是否是 paragraph 的第一个子节点
      const isFirst = (parentElement as ParagraphElement).children[0] === node;
      if (isFirst) {
        return [node, path];
      }
    }
  }
  return;
};

export const hitDoubleQuit = (editor: Editor, parentType: string) => {
  const [parentMatch] = Editor.nodes(editor, {
    match: (n) => n.type === parentType,
    mode: "lowest",
  });

  const [paraMatch] = Editor.nodes(editor, {
    match: (n) => n.type === "paragraph",
    mode: "lowest",
  });

  if (
    !parentMatch ||
    !paraMatch ||
    paraMatch[1].length !== parentMatch[1].length + 1 ||
    paraMatch[1][paraMatch[1].length - 1] !==
      (parentMatch[0] as any).children.length - 1 ||
    !Editor.isEmpty(editor, paraMatch[0] as any)
  ) {
    return false;
  }

  if (paraMatch[1][paraMatch[1].length - 1] === 0) {
    Transforms.liftNodes(editor, {
      at: paraMatch[1],
    });
    return true;
  }

  // 删除当前段落
  Transforms.delete(editor, {
    at: paraMatch[1],
  });
  // 在 blockMath 下方添加一个新段落
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
      at: Path.next(parentMatch[1]),
      select: true,
    },
  );

  return true;
};

export const hitEmptyOrInlineChild = (
  editor: Editor,
  [node, path]: NodeEntry,
  parentType: string,
) => {
  if (node.type !== parentType) {
    return false;
  }

  // @ts-ignore
  if (!node.children) {
    return false;
  }

  // @ts-ignore
  if (node.children.length === 0) {
    Transforms.removeNodes(editor, {
      at: path,
    });
    return true;
  }

  // @ts-ignore
  if (node.children.length === 1 && node.children[0].type === "formatted") {
    // @ts-ignore
    if (node.children[0].text === "") {
      Transforms.removeNodes(editor, {
        at: path,
      });
      return true;
    } else {
      Transforms.wrapNodes(
        editor,
        {
          type: "paragraph",
          children: [],
        },
        {
          at: [...path, 0],
        },
      );
    }
    return true;
  }

  return false;
};

/**
 * 合并连续的相同类型列表
 * @param editor Slate 编辑器实例
 * @param node BulletedListElement | NumberedListElement
 * @param path 当前列表节点的路径
 * @returns 如果合并成功返回 true，否则返回 false
 */
export const mergeConsecutiveLists = (
  editor: Editor,
  node: BulletedListElement | NumberedListElement,
  path: number[],
): boolean => {
  const parent = Editor.parent(editor, path)[0];
  console.log("parent", parent);
  if (!parent || parent.type === "formatted") return false;

  const siblings = parent.children;
  const nodeIndex = path[path.length - 1];

  // 检查前一个节点是否是相同类型的列表
  if (nodeIndex > 0) {
    const prevSibling = siblings[nodeIndex - 1];
    if (SlateElement.isElement(prevSibling) && prevSibling.type === node.type) {
      const prevList = prevSibling;
      const currentList = node;

      // 将当前列表的所有 list-item 移动到前一个列表的末尾
      const itemsToMove = [...currentList.children];
      const insertIndex = prevList.children.length;

      itemsToMove.forEach((_, index) => {
        Transforms.moveNodes(editor, {
          at: [...path, index],
          to: [...path.slice(0, -1), nodeIndex - 1, insertIndex + index],
        });
      });

      // 删除当前空列表
      Transforms.removeNodes(editor, {
        at: path,
      });

      return true;
    }
  }

  return false;
};
