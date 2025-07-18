import { useMemoizedFn } from "ahooks";
import isHotkey from "is-hotkey";
import { Board, MindNodeElement } from "../../../types";
import { MindUtil, PathUtil } from "../../../utils";
import { EditorRef } from "@/components/Editor";
import { produce } from "immer";

// 定义快捷键处理器类型
type KeyHandler = (params: {
  board: Board;
  element: MindNodeElement;
  setIsEditing?: (isEditing: boolean) => void;
  editor: EditorRef | null;
}) => void;

// 定义快捷键配置
interface KeyboardConfig {
  [key: string]: KeyHandler;
}

/**
 * 添加子节点 (Tab键)
 */
const handleAddChild: KeyHandler = ({ board, element }) => {
  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  const newRoot = MindUtil.addChild(oldRoot, element);
  if (!newRoot) return;

  const rootPath = PathUtil.getPathByElement(board, oldRoot);
  if (!rootPath) return;

  board.apply([
    {
      type: "set_node",
      path: rootPath,
      properties: oldRoot,
      newProperties: newRoot,
    },
    {
      type: "set_selection",
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [],
      },
    },
  ]);
};

/**
 * 添加兄弟节点 (Enter键)
 */
const handleAddSibling: KeyHandler = ({ board, element }) => {
  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  const newRoot = MindUtil.addSibling(oldRoot, element);
  if (!newRoot) return;

  const rootPath = PathUtil.getPathByElement(board, oldRoot);
  if (!rootPath) return;

  board.apply([
    {
      type: "set_node",
      path: rootPath,
      properties: oldRoot,
      newProperties: newRoot,
    },
    {
      type: "set_selection",
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [],
      },
    },
  ]);
};

/**
 * 在前面添加兄弟节点 (Shift+Enter键)
 */
const handleAddSiblingBefore: KeyHandler = ({ board, element }) => {
  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  const newRoot = MindUtil.addSiblingBefore(oldRoot, element);
  if (!newRoot) return;

  const rootPath = PathUtil.getPathByElement(board, oldRoot);
  if (!rootPath) return;

  board.apply([
    {
      type: "set_node",
      path: rootPath,
      properties: oldRoot,
      newProperties: newRoot,
    },
    {
      type: "set_selection",
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [],
      },
    },
  ]);
};

/**
 * 删除节点 (Backspace键)
 */
const handleDeleteNode: KeyHandler = ({ board, element }) => {
  if (MindUtil.isRoot(element)) {
    const rootPath = PathUtil.getPathByElement(board, element);
    if (!rootPath) return;
    board.apply({
      type: "remove_node",
      path: rootPath,
      node: element,
    });
  } else {
    const oldRoot = MindUtil.getRoot(board, element);
    if (!oldRoot) return;

    // 获取父节点和当前节点在父节点中的索引，用于删除后选择合适的节点
    const parent = MindUtil.getParent(oldRoot, element);
    if (!parent) return;
    const currentIndex = parent.children.findIndex(
      (child) => child.id === element.id,
    );

    // 确定删除后要选择的节点
    let nodeToSelect: MindNodeElement | null = null;

    // 优先选择下一个兄弟节点
    if (currentIndex < parent.children.length - 1) {
      nodeToSelect = parent.children[currentIndex + 1];
    }
    // 其次选择上一个兄弟节点
    else if (currentIndex > 0) {
      nodeToSelect = parent.children[currentIndex - 1];
    }
    // 最后选择父节点
    else {
      nodeToSelect = parent;
    }

    const newRoot = MindUtil.deleteNode(oldRoot, element);
    if (!newRoot) return;

    const rootPath = PathUtil.getPathByElement(board, oldRoot);
    if (!rootPath) return;

    board.apply([
      {
        type: "set_node",
        path: rootPath,
        properties: oldRoot,
        newProperties: newRoot,
      },
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: nodeToSelect ? [nodeToSelect] : [],
        },
      },
    ]);
  }
};

/**
 * 向上导航 (ArrowUp键)
 */
const handleNavigateUp: KeyHandler = ({ board, element }) => {
  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  // 获取父节点
  const parent = MindUtil.getParent(oldRoot, element);
  if (!parent) return;

  // 只考虑相同 direction 的兄弟节点
  const sameDirectionSiblings = parent.children.filter(
    (child) => child.direction === element.direction,
  );

  const currentIndex = sameDirectionSiblings.findIndex(
    (child) => child.id === element.id,
  );

  // 如果有上一个相同方向的兄弟节点，选择它
  if (currentIndex > 0) {
    const prevSibling = sameDirectionSiblings[currentIndex - 1];
    board.apply({
      type: "set_selection",
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [prevSibling],
      },
    });
  } else {
    // 如果没有上一个兄弟节点，选择父节点
    board.apply({
      type: "set_selection",
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [parent],
      },
    });
  }
};

/**
 * 向下导航 (ArrowDown键)
 */
const handleNavigateDown: KeyHandler = ({ board, element }) => {
  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  // 获取父节点
  const parent = MindUtil.getParent(oldRoot, element);
  if (!parent) return;

  // 只考虑相同 direction 的兄弟节点
  const sameDirectionSiblings = parent.children.filter(
    (child) => child.direction === element.direction,
  );

  const currentIndex = sameDirectionSiblings.findIndex(
    (child) => child.id === element.id,
  );

  // 如果有下一个相同方向的兄弟节点，选择它
  if (currentIndex < sameDirectionSiblings.length - 1) {
    const nextSibling = sameDirectionSiblings[currentIndex + 1];
    board.apply({
      type: "set_selection",
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [nextSibling],
      },
    });
  } else if (!MindUtil.isRoot(parent)) {
    // 如果没有下一个兄弟节点，尝试导航到父节点的下一个相同方向的兄弟节点
    const grandParent = MindUtil.getParent(oldRoot, parent);
    if (grandParent) {
      const parentSameDirectionSiblings = grandParent.children.filter(
        (child) => child.direction === parent.direction,
      );
      const parentIndex = parentSameDirectionSiblings.findIndex(
        (child) => child.id === parent.id,
      );
      if (parentIndex < parentSameDirectionSiblings.length - 1) {
        const parentNextSibling = parentSameDirectionSiblings[parentIndex + 1];
        board.apply({
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [parentNextSibling],
          },
        });
      }
    }
  }
};

/**
 * 向左导航 (ArrowLeft键)
 */
const handleNavigateLeft: KeyHandler = ({ board, element }) => {
  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  if (element.direction === "left") {
    // 对于左侧节点，按左键应该选择子节点
    if (element.children.length > 0) {
      const firstChild = element.children[0];
      board.apply({
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [firstChild],
        },
      });
    }
  } else {
    // 对于右侧节点，按左键应该选择父节点
    if (!MindUtil.isRoot(element)) {
      const parent = MindUtil.getParent(oldRoot, element);
      if (parent) {
        board.apply({
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [parent],
          },
        });
      }
    }
  }
};

/**
 * 向右导航 (ArrowRight键)
 */
const handleNavigateRight: KeyHandler = ({ board, element }) => {
  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  if (element.direction === "right") {
    // 对于右侧节点，按右键应该选择子节点
    if (element.children.length > 0) {
      const firstChild = element.children[0];
      board.apply({
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [firstChild],
        },
      });
    }
  } else {
    // 对于左侧节点，按右键应该选择父节点
    if (!MindUtil.isRoot(element)) {
      const parent = MindUtil.getParent(oldRoot, element);
      if (parent) {
        board.apply({
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [parent],
          },
        });
      }
    }
  }
};

/**
 * 进入编辑状态 (Space键)
 */
const handleEnterEditMode: KeyHandler = ({ setIsEditing, editor, board }) => {
  if (setIsEditing) {
    setIsEditing(true);
    setTimeout(() => {
      editor?.focus();
    }, 100);
    board.apply(
      [
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [],
          },
        },
      ],
      false,
    );
  }
};

/**
 * 向上移动节点位置 (Mod+ArrowUp)
 */
const handleMoveNodeUp: KeyHandler = ({ board, element }) => {
  if (MindUtil.isRoot(element)) return;

  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  const newRoot = MindUtil.moveNodeUp(oldRoot, element);
  if (!newRoot) return;

  const rootPath = PathUtil.getPathByElement(board, oldRoot);
  if (!rootPath) return;

  board.apply([
    {
      type: "set_node",
      path: rootPath,
      properties: oldRoot,
      newProperties: newRoot,
    },
  ]);
};

/**
 * 向下移动节点位置 (Mod+ArrowDown)
 */
const handleMoveNodeDown: KeyHandler = ({ board, element }) => {
  if (MindUtil.isRoot(element)) return; // Root node cannot be moved

  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  const newRoot = MindUtil.moveNodeDown(oldRoot, element);
  if (!newRoot) return; // Already last or no parent

  const rootPath = PathUtil.getPathByElement(board, oldRoot);
  if (!rootPath) return;

  board.apply([
    {
      type: "set_node",
      path: rootPath,
      properties: oldRoot,
      newProperties: newRoot,
    },
  ]);
};

/**
 * 切换方向 (Ctrl+ArrowLeft / Ctrl+ArrowRight)
 */
const handleToggleDirection =
  (dir: "left" | "right"): KeyHandler =>
  ({ board, element }) => {
    if (element.level !== 2) return;
    if (element.direction === dir) return;
    const oldRoot = MindUtil.getRoot(board, element);
    if (!oldRoot) return;
    // 找到当前节点并修改 direction
    const changeedDirectionRoot = produce(oldRoot, (draft) => {
      const node = MindUtil.findNodeInTree(draft, element.id);
      if (node) node.direction = dir;
    });
    const newRoot = MindUtil.layout(changeedDirectionRoot);
    if (!newRoot) return;
    const rootPath = PathUtil.getPathByElement(board, oldRoot);
    if (!rootPath) return;
    board.apply([
      {
        type: "set_node",
        path: rootPath,
        properties: oldRoot,
        newProperties: newRoot,
      },
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [
            MindUtil.findNodeInTree(newRoot, element.id) || element,
          ],
        },
      },
    ]);
  };

// 非编辑状态下的快捷键配置
const NON_EDITING_KEYBOARD_CONFIG: KeyboardConfig = {
  "mod+arrowup": handleMoveNodeUp,
  "mod+arrowdown": handleMoveNodeDown,
  "mod+arrowleft": handleToggleDirection("left"),
  "mod+arrowright": handleToggleDirection("right"),
  tab: handleAddChild,
  enter: handleAddSibling,
  "shift+enter": handleAddSiblingBefore,
  backspace: handleDeleteNode,
  delete: handleDeleteNode,
  arrowup: handleNavigateUp,
  arrowdown: handleNavigateDown,
  arrowleft: handleNavigateLeft,
  arrowright: handleNavigateRight,
  space: handleEnterEditMode,
};

// 编辑状态下的快捷键配置
const EDITING_KEYBOARD_CONFIG: KeyboardConfig = {
  enter: ({ setIsEditing, element, board }) => {
    if (setIsEditing) {
      setIsEditing(false);
      // 触发重新布局
      const root = MindUtil.getRoot(board, element);
      if (root) {
        const newRoot = MindUtil.layout(root);
        const rootPath = PathUtil.getPathByElement(board, root);
        if (rootPath) {
          board.apply([
            {
              type: "set_node",
              path: rootPath,
              properties: root,
              newProperties: newRoot,
            },
            {
              type: "set_selection",
              properties: board.selection,
              newProperties: {
                selectArea: null,
                selectedElements: [element],
              },
            },
          ]);
        }
      }
    }
  },
  delete: () => {
    // 阻止事件冒泡
  },
};

/**
 * 思维导图节点键盘导航和快捷键处理Hook
 */
export const useMindNodeKeyboardNavigation = (
  board: Board,
  element: MindNodeElement,
  isSelected: boolean,
  isEditing: boolean,
  setIsEditing: (isEditing: boolean) => void,
  editor: EditorRef | null,
) => {
  const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
    const onlyOneSelected =
      board.selection.selectedElements &&
      board.selection.selectedElements.length === 1;

    if (isHotkey(["mod+z", "mod+o"], e)) {
      return;
    }

    // 如果选中了当前节点且不在编辑状态
    if (isSelected && onlyOneSelected && !isEditing) {
      e.stopImmediatePropagation();
      e.preventDefault();
      // 遍历非编辑状态下的快捷键配置
      for (const [hotkey, handler] of Object.entries(
        NON_EDITING_KEYBOARD_CONFIG,
      )) {
        if (isHotkey(hotkey, e)) {
          handler({ board, element, setIsEditing, editor });
          return;
        }
      }
    }
    // 如果在编辑状态
    else if (isEditing) {
      // 遍历编辑状态下的快捷键配置
      for (const [hotkey, handler] of Object.entries(EDITING_KEYBOARD_CONFIG)) {
        if (isHotkey(hotkey, e)) {
          e.stopPropagation();
          e.preventDefault();
          handler({ board, element, setIsEditing, editor });
          return;
        }
      }
    }
  });

  return { handleKeyDown };
};
