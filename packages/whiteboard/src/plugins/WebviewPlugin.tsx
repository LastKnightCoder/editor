import { Globe } from "lucide-react";
import CommonPlugin, { CommonElement } from "./CommonPlugin";
import {
  Board,
  IBoardPlugin,
  WebviewElement,
  ContextMenuContext,
  PluginContextMenuItem,
} from "../types";
import WebviewElementComponent from "../components/WebviewElement";

const DRAG_PADDING = 20;

export class WebviewPlugin extends CommonPlugin implements IBoardPlugin {
  name = "webview";

  constructor() {
    super();
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「网页」菜单
    if (targetElements.length === 0) {
      items.push({
        key: "create-webview",
        label: "网页",
        icon: <Globe size={14} />,
        priority: 170,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.emit("context-menu:open-modal", { type: "webview" });
        },
      });
    }

    return items;
  }

  isHit(_board: Board, element: CommonElement & any, x: number, y: number): boolean {
    const { x: elementX, y: elementY, width, height } = element;
    return (
      x >= elementX - DRAG_PADDING &&
      x <= elementX + width + DRAG_PADDING &&
      y >= elementY - DRAG_PADDING &&
      y <= elementY + height + DRAG_PADDING
    );
  }

  render(_board: Board, { element }: { element: WebviewElement }) {
    return (
      <WebviewElementComponent
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
