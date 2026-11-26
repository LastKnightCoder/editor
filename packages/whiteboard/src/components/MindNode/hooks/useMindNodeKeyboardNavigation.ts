import { useMemoizedFn } from "ahooks";
import { isHotkey } from "is-hotkey";
import { Board, MindNodeElement } from "../../../types";
import { BoardUtil, MindUtil, PathUtil } from "../../../utils";
import { EditorRef } from "@tau/editor";
import { produce } from "immer";
import { getMindLayout, type MindArrowKey, type MindLayout } from "../../../utils/mind-layout";
import BoardOperations from "../../../utils/BoardOperations";
import type { MoveNodeOperation } from "../../../types/operation";

// 定义快捷键处理器类型
type KeyHandler = (params: {
  board: Board;
  element: MindNodeElement;
  setIsEditing?: (isEditing: boolean) => void;
  editor: EditorRef | null;
  retainContent?: (contentId: number) => void;
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

  const newRoot = MindUtil.addChild(oldRoot, element, undefined, undefined, board.getFontSize());
  if (!newRoot) return;

  const rootPath = PathUtil.getPathByElement(board, oldRoot);
  if (!rootPath) return;

  const ops = [
    ...BoardUtil.diffNode(oldRoot, newRoot, rootPath),
    {
      type: "set_selection" as const,
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [],
      },
    },
  ];
  BoardUtil.normalizeOperations(ops);
  board.apply(ops);
};

/**
 * 添加兄弟节点 (Enter键)
 */
const handleAddSibling: KeyHandler = ({ board, element }) => {
  const oldRoot = MindUtil.getRoot(board, element);
  if (!oldRoot) return;

  const newRoot = MindUtil.addSibling(oldRoot, element, undefined, board.getFontSize());
  if (!newRoot) return;

  const rootPath = PathUtil.getPathByElement(board, oldRoot);
  if (!rootPath) return;

  const ops = [
    ...BoardUtil.diffNode(oldRoot, newRoot, rootPath),
    {
      type: "set_selection" as const,
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [],
      },
    },
  ];
  BoardUtil.normalizeOperations(ops);
  board.apply(ops);
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

  const ops = [
    ...BoardUtil.diffNode(oldRoot, newRoot, rootPath),
    {
      type: "set_selection" as const,
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: [],
      },
    },
  ];
  BoardUtil.normalizeOperations(ops);
  board.apply(ops);
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
    const currentIndex = parent.children.findIndex(child => child.id === element.id);

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

    const ops = [
      ...BoardUtil.diffNode(oldRoot, newRoot, rootPath),
      {
        type: "set_selection" as const,
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: nodeToSelect ? [nodeToSelect] : [],
        },
      },
    ];
    BoardUtil.normalizeOperations(ops);
    board.apply(ops);
  }
};

const select = (board: Board, node: MindNodeElement) =>
  board.apply({
    type: "set_selection",
    properties: board.selection,
    newProperties: { selectArea: null, selectedElements: [node] },
  });

/** 同组兄弟：双向布局只看同侧，单向布局整组 */
const siblingGroup = (layout: MindLayout, parent: MindNodeElement, node: MindNodeElement) =>
  layout.sides.length > 1 && parent.level === 1
    ? parent.children.filter(child => child.direction === node.direction)
    : parent.children;

/**
 * 方向键：语义（去子节点 / 回父节点 / 上一个 / 下一个同级）由布局决定，
 * 组织结构图里 ↓ 去子节点、← → 在主分支间移动。
 */
const handleNavigate =
  (key: MindArrowKey): KeyHandler =>
  ({ board, element }) => {
    const root = MindUtil.getRoot(board, element);
    if (!root) return;
    const layout = getMindLayout(root);
    const role = layout.navigate(element, key);
    if (!role) return;

    if (role === "child") {
      const visible = MindUtil.visibleChildren(element);
      // 思维导图根节点按键决定去哪一侧
      const candidates =
        layout.sides.length > 1 && MindUtil.isRoot(element)
          ? visible.filter(child => child.direction === key)
          : visible;
      if (candidates[0]) select(board, candidates[0]);
      return;
    }

    const parent = MindUtil.getParent(root, element);
    if (!parent) return;
    if (role === "parent") {
      select(board, parent);
      return;
    }

    const group = siblingGroup(layout, parent, element);
    const index = group.findIndex(child => child.id === element.id);
    const target = group[role === "prev" ? index - 1 : index + 1];
    if (target) {
      select(board, target);
      return;
    }
    // 组首按「上一个」回到父节点；组尾按「下一个」跳到父节点的下一个同级（与原行为一致）
    if (role === "prev") {
      select(board, parent);
      return;
    }
    if (MindUtil.isRoot(parent)) return;
    const grandParent = MindUtil.getParent(root, parent);
    if (!grandParent) return;
    const parentGroup = siblingGroup(layout, grandParent, parent);
    const next = parentGroup[parentGroup.findIndex(child => child.id === parent.id) + 1];
    if (next) select(board, next);
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
      false
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

  const ops = BoardUtil.diffNode(oldRoot, newRoot, rootPath);
  BoardUtil.normalizeOperations(ops);
  board.apply(ops);
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

  const ops = BoardUtil.diffNode(oldRoot, newRoot, rootPath);
  BoardUtil.normalizeOperations(ops);
  board.apply(ops);
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
    if (!oldRoot || getMindLayout(oldRoot).sides.length < 2) return;
    // 找到当前节点并修改 direction
    const changeedDirectionRoot = produce(oldRoot, draft => {
      const node = MindUtil.findNodeInTree(draft, element.id);
      if (node) node.direction = dir;
    });
    const newRoot = MindUtil.layout(changeedDirectionRoot);
    if (!newRoot) return;
    const rootPath = PathUtil.getPathByElement(board, oldRoot);
    if (!rootPath) return;
    const ops = [
      ...BoardUtil.diffNode(oldRoot, newRoot, rootPath),
      {
        type: "set_selection" as const,
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [MindUtil.findNodeInTree(newRoot, element.id) || element],
        },
      },
    ];
    BoardUtil.normalizeOperations(ops);
    board.apply(ops);
  };

/** 整树替换后写一次操作；selectId 给出时把选区落到新树里的该节点 */
const commitRoot = (
  board: Board,
  oldRoot: MindNodeElement,
  newRoot: MindNodeElement | null | undefined,
  selectId?: string,
  move?: MoveNodeOperation
) => {
  if (!newRoot) return false;
  const rootPath = PathUtil.getPathByElement(board, oldRoot);
  if (!rootPath) return false;
  const selected = selectId ? MindUtil.findNodeInTree(newRoot, selectId) : null;
  const before = move
    ? PathUtil.getElement(BoardOperations.applyToChildren(board.children, [move]), rootPath)
    : oldRoot;
  if (!before) return false;
  const ops = [
    ...(move ? [move] : []),
    ...BoardUtil.diffNode(before, newRoot, rootPath),
    ...(selected
      ? [
          {
            type: "set_selection" as const,
            properties: board.selection,
            newProperties: { selectArea: null, selectedElements: [selected] },
          },
        ]
      : []),
  ];
  BoardUtil.normalizeOperations(ops);
  board.apply(ops);
  return true;
};

const withRoot =
  (
    change: (
      root: MindNodeElement,
      element: MindNodeElement,
      board: Board,
      params: Parameters<KeyHandler>[0]
    ) => void
  ): KeyHandler =>
  params => {
    const root = MindUtil.getRoot(params.board, params.element);
    if (root) change(root, params.element, params.board, params);
  };

/** Mod+.：收起 / 展开选中节点 */
const handleToggleCollapsed = withRoot((root, element, board) =>
  commitRoot(board, root, MindUtil.toggleCollapsed(root, element.id), element.id)
);

/** Mod+Shift+.：展开选中节点下的全部层级 */
const handleExpandAll = withRoot((root, element, board) =>
  commitRoot(board, root, MindUtil.expandAll(root, element.id), element.id)
);

/** Alt+数字：整张导图展开到第 N 层；选中节点被收进去时改选它在第 N 层的祖先 */
const handleExpandToLevel = (depth: number) =>
  withRoot((root, element, board) => {
    let selectId = element.id;
    if (depth > 0 && element.level > depth) {
      let current: MindNodeElement | null = element;
      while (current && current.level > depth) current = MindUtil.getParent(root, current);
      if (current) selectId = current.id;
    }
    commitRoot(board, root, MindUtil.expandToLevel(root, depth), selectId);
  });

/** Shift+Tab：升一级，变成父节点的下一个同级 */
const handlePromote = withRoot((root, element, board) => {
  const path = PathUtil.getPathByElement(board, element);
  const parent = MindUtil.getParent(root, element);
  if (!path || !parent || MindUtil.isRoot(parent)) return;
  const parentPath = path.slice(0, -1);
  commitRoot(board, root, MindUtil.promote(root, element.id), element.id, {
    type: "move_node",
    path,
    newPath: [...parentPath.slice(0, -1), parentPath[parentPath.length - 1] + 1],
  });
});

/** Mod+D：复制整个分支放在后面，选中副本 */
const handleDuplicate = withRoot((root, element, board, { retainContent }) => {
  const result = MindUtil.duplicate(root, element.id);
  if (!result || !commitRoot(board, root, result.root, result.copy.id)) return;
  // 本机模式下笔记按引用计数，副本多引用一次；协作文档里由实体引用自行管理
  if (board.document || !retainContent) return;
  MindUtil.dfs(result.copy, {
    before: node => {
      if (node.contentId) retainContent(node.contentId);
    },
  });
});

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
  arrowup: handleNavigate("up"),
  arrowdown: handleNavigate("down"),
  arrowleft: handleNavigate("left"),
  arrowright: handleNavigate("right"),
  space: handleEnterEditMode,
  "shift+tab": handlePromote,
  "mod+d": handleDuplicate,
  "mod+.": handleToggleCollapsed,
  "mod+shift+.": handleExpandAll,
  "alt+0": handleExpandToLevel(0),
  ...Object.fromEntries([1, 2, 3, 4, 5].map(depth => [`alt+${depth}`, handleExpandToLevel(depth)])),
};

// 编辑状态下的快捷键配置
const handleFinishEditing: KeyHandler = ({ setIsEditing, element, board }) => {
  if (setIsEditing) {
    setIsEditing(false);
    // 触发重新布局
    const root = MindUtil.getRoot(board, element);
    if (root) {
      const newRoot = MindUtil.layout(root);
      const rootPath = PathUtil.getPathByElement(board, root);
      if (rootPath) {
        const ops = [
          ...BoardUtil.diffNode(root, newRoot, rootPath),
          {
            type: "set_selection" as const,
            properties: board.selection,
            newProperties: {
              selectArea: null,
              selectedElements: [element],
            },
          },
        ];
        BoardUtil.normalizeOperations(ops);
        board.apply(ops);
      }
    }
  }
};

const EDITING_KEYBOARD_CONFIG: KeyboardConfig = {
  enter: handleFinishEditing,
  escape: handleFinishEditing,
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
  retainContent?: (contentId: number) => void
) => {
  const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
    const onlyOneSelected =
      board.selection.selectedElements && board.selection.selectedElements.length === 1;

    // 如果选中了当前节点且不在编辑状态：
    // 仅在命中本 hook 的快捷键时才拦截，其余按键放行给 Board
    // （如 mod+z 撤销等全局快捷键不能被误拦）
    if (isSelected && onlyOneSelected && !isEditing) {
      for (const [hotkey, handler] of Object.entries(NON_EDITING_KEYBOARD_CONFIG)) {
        if (isHotkey(hotkey, e)) {
          e.stopImmediatePropagation();
          e.preventDefault();
          handler({ board, element, setIsEditing, editor, retainContent });
          return;
        }
      }
    }
    // 如果在编辑状态
    else if (isEditing) {
      // 遍历编辑状态下的快捷键配置
      for (const [hotkey, handler] of Object.entries(EDITING_KEYBOARD_CONFIG)) {
        // 编辑器内的浮层（链接面板等）先消费过的 Esc 不结束编辑
        if (hotkey === "escape" && (e.defaultPrevented || e.isComposing)) continue;
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
