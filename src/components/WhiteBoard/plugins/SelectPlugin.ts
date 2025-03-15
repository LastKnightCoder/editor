import {
  BoardElement,
  IBoardPlugin,
  Board,
  ECreateBoardElementType,
  MindNodeElement,
  Operation,
} from "../types";
import { BoardUtil, isValid, MindUtil, PathUtil, PointUtil } from "../utils";
import { SelectTransforms } from "../transforms";
import isHotkey from "is-hotkey";

export class SelectPlugin implements IBoardPlugin {
  name = "select";
  startPoint: { x: number; y: number } | null = null;
  hitElements: BoardElement[] | null = null;
  moved = false;

  onPointerDown(e: PointerEvent, board: Board) {
    if (board.currentCreateType !== ECreateBoardElementType.None) {
      return;
    }

    // 如果按下的是右键
    if (e.button === 2) {
      return;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    this.hitElements = BoardUtil.getHitElements(
      board,
      startPoint.x,
      startPoint.y,
    );

    this.startPoint = startPoint;

    SelectTransforms.updateSelectArea(board, {
      selectedElements:
        this.hitElements && this.hitElements.length > 0
          ? board.selection.selectedElements
          : [],
    });
  }
  onPointerMove(e: PointerEvent, board: Board) {
    if (this.startPoint) {
      const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!endPoint) {
        return;
      }

      if (
        !this.moved &&
        (Math.abs(endPoint.x - this.startPoint.x) > 3 ||
          Math.abs(endPoint.y - this.startPoint.y) > 3)
      ) {
        this.moved = true;
      }

      // 选中的情况，要么是移动元素，要么是点选，在鼠标抬起时处理点选，移动元素在 MovePlugin 中
      if (this.hitElements && this.hitElements.length > 0) return;

      const selectArea = {
        anchor: this.startPoint,
        focus: endPoint,
      };

      const selectedElements: BoardElement[] = [];
      BoardUtil.dfs(board, (node) => {
        if (board.isElementSelected(node, selectArea)) {
          selectedElements.push(node);
        }
      });

      SelectTransforms.updateSelectArea(board, {
        selectArea,
        selectedElements,
      });
    }
  }
  onGlobalPointerUp(e: PointerEvent, board: Board) {
    if (this.startPoint) {
      let selectedElements: BoardElement[] = board.selection.selectedElements;

      const isMultiSelect = e.ctrlKey || e.metaKey;

      if (!this.moved && this.hitElements && this.hitElements.length > 0) {
        const clickedElement = this.hitElements[this.hitElements.length - 1];

        console.log(isMultiSelect, selectedElements, clickedElement);

        if (isMultiSelect) {
          // 多选模式下，如果点击的元素已经在选中列表中，则移除它；否则添加它
          const existingIndex = selectedElements.findIndex(
            (el) => el.id === clickedElement.id,
          );

          if (existingIndex >= 0) {
            // 元素已存在，移除它
            selectedElements = [
              ...selectedElements.slice(0, existingIndex),
              ...selectedElements.slice(existingIndex + 1),
            ];
          } else {
            // 元素不存在，添加它
            selectedElements = [...selectedElements, clickedElement];
          }
        } else {
          // 非多选模式，只选中当前点击的元素
          selectedElements = [clickedElement];
        }
      }

      // 确保选择区域被清除
      SelectTransforms.updateSelectArea(board, {
        selectArea: null,
        selectedElements,
      });

      // 重置状态
      this.startPoint = null;
      this.moved = false;
      this.hitElements = null;
    }
  }
  onKeyDown(e: KeyboardEvent, board: Board) {
    if (board.selection.selectedElements.length === 0) return;
    const selectedElements = board.selection.selectedElements;
    if (isHotkey(["delete", "backspace"], e)) {
      // 思维导图节点还需要特殊处理，删除后需要布局
      const mindNodes = selectedElements.filter(
        (element) => element.type === "mind-node",
      ) as MindNodeElement[];
      // 找到所有的根节点
      const roots = mindNodes
        .map((node) => {
          const root = MindUtil.getRoot(board, node);
          if (!root) return;
          return {
            root,
            node,
          };
        })
        .filter(isValid);

      // 按照根节点聚合
      const rootsMap = new Map<MindNodeElement, MindNodeElement[]>();
      roots.forEach((root) => {
        const rootNode = root.root;
        if (!rootsMap.has(rootNode)) {
          rootsMap.set(rootNode, []);
        }
        rootsMap.get(rootNode)?.push(root.node);
      });

      // 分为两种，一种是 root 在 selectedElements 中，一种是 root 不在 selectedElements 中
      // 根节点删除就整个被删除了
      const mindOps: Operation[] = [];
      const toDeleteRoots: MindNodeElement[] = [];
      rootsMap.forEach((nodes, root) => {
        const rootPath = PathUtil.getPathByElement(board, root);
        if (!rootPath) return;
        if (selectedElements.map((node) => node.id).includes(root.id)) {
          toDeleteRoots.push(root);
        } else {
          const newRoot = MindUtil.deleteNodes(root, nodes);
          mindOps.push({
            type: "set_node",
            path: rootPath,
            properties: root,
            newProperties: newRoot,
          });
        }
      });

      const otherElements = selectedElements.filter(
        (element) => element.type !== "mind-node",
      );
      const ops = BoardUtil.getBatchRemoveNodesOps(board, [
        ...otherElements,
        ...toDeleteRoots,
      ]);

      const finalOps = [...mindOps, ...ops];

      board.apply(finalOps);
      SelectTransforms.updateSelectArea(board, {
        selectArea: null,
        selectedElements: [],
      });
    }
  }
}

export default SelectPlugin;
