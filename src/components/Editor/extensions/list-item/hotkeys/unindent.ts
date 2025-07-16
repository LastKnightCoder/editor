import {
  BulletedListElement,
  IHotKeyConfig,
  ListItemElement,
  NumberedListElement,
} from "@/components/Editor/types";
import { Editor, Transforms, Path, NodeEntry } from "slate";
import { getParentNodeByNode } from "@/components/Editor/utils";

export const unindent: IHotKeyConfig[] = [
  {
    hotKey: "Shift+Tab",
    action: (editor, event) => {
      const [listItemMatch] = Editor.nodes(editor, {
        match: (n) => n.type === "list-item",
        mode: "lowest",
      }) as unknown as NodeEntry<ListItemElement>[];

      if (!listItemMatch) {
        return;
      }

      const [paraMatch] = Editor.nodes(editor, {
        match: (n) => n.type === "paragraph",
        mode: "lowest",
      });

      if (!paraMatch) {
        return;
      }

      const listItem = listItemMatch[0];
      const listItemPath = listItemMatch[1];

      // 获取父级列表（ul/ol）
      const parentList = getParentNodeByNode(editor, listItem) as NodeEntry<
        BulletedListElement | NumberedListElement
      >;
      if (
        !parentList ||
        !["bulleted-list", "numbered-list"].includes(parentList[0].type)
      ) {
        console.error(
          "list-item must be inside bulleted-list or numbered-list",
        );
        return;
      }

      // 获取祖父级（应该是li或其他容器，不可能是ul/ol）
      const grandParent = getParentNodeByNode(editor, parentList[0]);
      if (!grandParent) {
        return;
      }

      const isNestedInListItem = grandParent[0].type === "list-item";

      event.preventDefault();

      Editor.withoutNormalizing(editor, () => {
        if (isNestedInListItem) {
          // 情况1: 嵌套在另一个list-item中（合法的嵌套结构）
          handleNestedInListItemUnindent(
            editor,
            listItem,
            listItemPath,
            parentList,
            grandParent as NodeEntry<ListItemElement>,
          );
        } else {
          // 情况2: 顶级列表项，反缩进为普通段落
          handleRootLevelUnindent(editor, listItem, listItemPath, parentList);
        }
      });
    },
  },
];

/**
 * 处理嵌套在另一个list-item中的反缩进
 */
const handleNestedInListItemUnindent = (
  editor: Editor,
  listItem: ListItemElement,
  listItemPath: Path,
  parentList: NodeEntry<BulletedListElement | NumberedListElement>,
  grandParent: NodeEntry<ListItemElement>,
) => {
  const [grandParentNode, grandParentPath] = grandParent;

  // 找到祖父list-item的父级列表
  const greatGrandParent = getParentNodeByNode(
    editor,
    grandParentNode,
  ) as NodeEntry<BulletedListElement | NumberedListElement>;

  if (!greatGrandParent) {
    return;
  }

  const [, greatGrandParentPath] = greatGrandParent;

  const currentIndex = listItemPath[listItemPath.length - 1];
  const [parentListNode, parentListPath] = parentList;
  const remainingItems = parentListNode.children.slice(currentIndex + 1);

  // 计算在great-grand-parent列表中的插入位置（在grandParent之后）
  const grandParentIndex = grandParentPath[grandParentPath.length - 1];
  const insertPath = [...greatGrandParentPath, grandParentIndex + 1];

  Editor.withoutNormalizing(editor, () => {
    // 1. 移除原列表中的剩余项（从后往前移除）
    for (let i = remainingItems.length - 1; i >= 0; i--) {
      const removalPath = [...parentListPath, currentIndex + 1 + i];
      Transforms.removeNodes(editor, { at: removalPath });
    }

    // 2. 移动当前list-item到外层列表
    Transforms.moveNodes(editor, { at: listItemPath, to: insertPath });

    // 3. 如果有剩余的list-item，创建新列表并插入到反缩进的list-item中
    if (remainingItems.length > 0) {
      const newListType = parentListNode.type;

      // 创建新列表节点
      const newList = {
        type: newListType,
        children: remainingItems,
      } as BulletedListElement | NumberedListElement;

      // 将新列表插入到反缩进的list-item中
      Transforms.insertNodes(editor, newList, {
        at: [...insertPath, listItem.children.length],
      });
    }
  });
};

/**
 * 处理顶级列表项反缩进为普通段落
 */
const handleRootLevelUnindent = (
  editor: Editor,
  listItem: ListItemElement,
  listItemPath: Path,
  parentList: NodeEntry<BulletedListElement | NumberedListElement>,
) => {
  const [parentListNode, parentListPath] = parentList;

  const currentIndex = listItemPath[listItemPath.length - 1];
  const remainingItems = (parentListNode as any).children.slice(
    currentIndex + 1,
  );

  const insertPath = parentListPath.slice(0, -1);
  const targetIndex = parentListPath[parentListPath.length - 1];

  Editor.withoutNormalizing(editor, () => {
    // 1. 移除原列表中的剩余项（从后往前移除）
    for (let i = remainingItems.length - 1; i >= 0; i--) {
      const removalPath = [...parentListPath, currentIndex + 1 + i];
      Transforms.removeNodes(editor, { at: removalPath });
    }

    // 2. 将当前list-item的内容作为普通段落提升
    const allChildren = [...listItem.children];
    Transforms.moveNodes(editor, {
      at: listItemPath,
      to: [...insertPath, targetIndex + 1],
    });
    Transforms.unwrapNodes(editor, {
      at: [...insertPath, targetIndex + 1],
      match: (n) => (n as any).type === "list-item",
      split: false,
    });

    // 3. 如果有剩余的list-item，创建新列表并插入到反缩进的段落中
    if (remainingItems.length > 0) {
      const newListType = parentListNode.type;
      const newList = {
        type: newListType,
        children: remainingItems,
      } as BulletedListElement | NumberedListElement;

      // 将新列表插入到反缩进的段落中
      Transforms.insertNodes(editor, newList, {
        at: [...insertPath, targetIndex + allChildren.length + 1],
      });
    }
  });
};
