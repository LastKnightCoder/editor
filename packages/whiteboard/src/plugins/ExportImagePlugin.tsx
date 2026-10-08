import { Download } from "lucide-react";
import { IBoardPlugin, ContextMenuContext, PluginContextMenuItem } from "../types";

export class ExportImagePlugin implements IBoardPlugin {
  name = "export-image";

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const items: PluginContextMenuItem[] = [];

    items.push({
      key: "export-board-image",
      label: "导出白板为图片",
      icon: <Download size={14} />,
      priority: 320,
      onSelect: (ctx: ContextMenuContext) => {
        ctx.board.emit("context-menu:open-modal", {
          type: "export-image",
          action: "board",
        });
      },
    });

    if (context.targetElements.length > 0) {
      items.push({
        key: "export-selection-image",
        label: context.isHitSelected ? "导出选中元素为图片" : "导出当前元素为图片",
        icon: <Download size={14} />,
        priority: 321,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.emit("context-menu:open-modal", {
            type: "export-image",
            action: "selection",
            selectedElementIds: ctx.targetElements.map(element => element.id),
          });
        },
      });
    }

    return items;
  }
}

export default ExportImagePlugin;
