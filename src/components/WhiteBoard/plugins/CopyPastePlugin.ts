import { Board, BoardElement, IBoardPlugin, Operation, Point } from "../types";
import { BoardUtil } from "@/components/WhiteBoard/utils";
import { SelectTransforms } from "@/components/WhiteBoard/transforms";
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

    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    const data = {
      source: "editor-white-board",
      elements: copiedElements.map((element) => {
        // 把 x y 相对于当前中心
        if (typeof element.x === "number" && typeof element.y === "number") {
          return {
            ...element,
            x: element.x - center.x,
            y: element.y - center.y,
          };
        } else if (element.type === "arrow") {
          element.points = element.points.map((point: Point) => {
            return {
              x: point.x - center.x,
              y: point.y - center.y,
            };
          });
          return element;
        } else {
          return element;
        }
      }),
    };
    e.clipboardData?.setData("application/json", JSON.stringify(data));
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  onCut(e: ClipboardEvent, board: Board) {
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return;
    const ops = BoardUtil.getBatchRemoveNodesOps(board, selectedElements);
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
      // 获取当前鼠标的位置
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      };
      const idMaps = new Map<string, string>();
      const pastedElements = elements.map((element) => {
        const newId = getUuid();
        idMaps.set(element.id, newId);
        element.id = newId;
        if (typeof element.x === "number" && typeof element.y === "number") {
          return {
            ...element,
            x: element.x + center.x,
            y: element.y + center.y,
          };
        } else if (element.type === "arrow") {
          element.points = element.points.map((point: Point) => {
            return {
              x: point.x + center.x,
              y: point.y + center.y,
            };
          });
          return element;
        } else {
          return element;
        }
      });
      let index = 0;
      const childrenLength = board.children.length;
      const ops: Operation[] = [];
      for (const element of pastedElements) {
        const path = [childrenLength + index++];
        if (element.type === "arrow") {
          // 重新绑定 bindId
          if (element.source.bindId) {
            element.source.bindId = idMaps.get(element.source.bindId);
          }
          if (element.target.bindId) {
            element.target.bindId = idMaps.get(element.target.bindId);
          }
        }
        ops.push({
          type: "insert_node",
          path,
          node: element,
        });
      }
      board.apply(ops);
      e.preventDefault();
      e.stopImmediatePropagation();
    } catch (e) {
      console.error(e);
      return;
    }
  }
}
