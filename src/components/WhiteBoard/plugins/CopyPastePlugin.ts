import { Board, BoardElement, IBoardPlugin, Operation, Point } from "../types";
import { isValid, PathUtil } from "@/components/WhiteBoard/utils";
import {
  SelectTransforms,
  ViewPortTransforms,
} from "@/components/WhiteBoard/transforms";
import { v4 as getUuid } from "uuid";

export class CopyPastePlugin implements IBoardPlugin {
  name = "copy-paste";

  constructor() {
    this.onCopy = this.onCopy.bind(this);
    this.onCut = this.onCut.bind(this);
    this.onPaste = this.onPaste.bind(this);
  }

  onCopy(e: ClipboardEvent, board: Board) {
    // 读取当前所有选择的元素
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return;

    // 解决有的对象的属性不可更改
    const copiedElements: BoardElement[] = JSON.parse(
      JSON.stringify(selectedElements),
    );

    const data = {
      source: "editor-white-board",
      elements: copiedElements
        .map((element) => {
          // 把 x y 相对于当前中心
          if (typeof element.x === "number" && typeof element.y === "number") {
            return board.moveElement(element, 20, 20);
          } else if (element.type === "arrow") {
            element.points = element.points.map((point: Point) => {
              return {
                x: point.x + 20,
                y: point.y + 20,
              };
            });
            return element;
          } else {
            return element;
          }
        })
        .filter(isValid),
    };

    e.clipboardData?.setData("application/json", JSON.stringify(data));
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  onCut(e: ClipboardEvent, board: Board) {
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return;

    // 创建删除操作，现在不需要预先计算路径了，apply 方法会自动处理路径转换
    const ops: Operation[] = [];
    for (const element of selectedElements) {
      const path = PathUtil.getPathByElement(board, element);
      if (path) {
        ops.push({
          type: "remove_node",
          path,
          node: element,
        });
      }
    }

    board.apply(ops);
    this.onCopy(e, board);
    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [],
    });
  }

  onPaste(e: ClipboardEvent, board: Board) {
    // 读取剪切板数据
    const data = e.clipboardData?.getData("application/json");
    if (!data) return;
    try {
      const dataObj = JSON.parse(data);
      if (dataObj.source !== "editor-white-board") return;
      // 获取粘贴板的元素
      const elements: BoardElement[] = dataObj.elements;

      // 收集所有需要替换的ID映射，包括子元素
      const idMaps = new Map<string, string>();
      this.collectAllIds(elements, idMaps);

      elements.forEach((element) => {
        // 更新元素位置并替换所有ID引用
        this.updateElementIds(element, idMaps);
      });

      const childrenLength = board.children.length;
      const ops: Operation[] = [];
      for (const element of elements) {
        const path = [childrenLength];
        ops.push({
          type: "insert_node",
          path,
          node: element,
        });
      }

      ops.push({
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: elements,
          selectArea: null,
        },
      });

      board.apply(ops);
      ViewPortTransforms.centerElements(board, elements);

      e.preventDefault();
      e.stopImmediatePropagation();
    } catch (e) {
      console.error(e);
      return;
    }
  }

  /**
   * 递归收集所有元素的ID，包括children中的元素
   */
  private collectAllIds(elements: BoardElement[], idMaps: Map<string, string>) {
    for (const element of elements) {
      // 为当前元素生成新ID
      const newId = getUuid();
      idMaps.set(element.id, newId);
      element.id = newId;

      // 递归处理children
      if (element.children && element.children.length > 0) {
        this.collectAllIds(element.children, idMaps);
      }
    }
  }

  /**
   * 递归更新元素及其children的所有ID引用
   */
  private updateElementIds(
    element: BoardElement,
    idMaps: Map<string, string>,
  ): BoardElement {
    // 更新当前元素的ID
    const updatedElement = { ...element };
    updatedElement.id = idMaps.get(element.id) || element.id;

    // 处理arrow类型的bindId引用
    if (updatedElement.type === "arrow") {
      if (updatedElement.source.bindId) {
        updatedElement.source.bindId =
          idMaps.get(updatedElement.source.bindId) ||
          updatedElement.source.bindId;
      }
      if (updatedElement.target.bindId) {
        updatedElement.target.bindId =
          idMaps.get(updatedElement.target.bindId) ||
          updatedElement.target.bindId;
      }
    }

    // 递归处理children
    if (updatedElement.children && updatedElement.children.length > 0) {
      updatedElement.children = updatedElement.children.map((child) =>
        this.updateElementIds(child, idMaps),
      );
    }

    return updatedElement;
  }
}
