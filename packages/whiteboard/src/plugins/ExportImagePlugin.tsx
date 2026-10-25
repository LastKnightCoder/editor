import { toast } from "@tau/ui";
import { downloadBlobAsFile } from "../utils/ExportImageUtil";
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
        ctx.board.emit("tau.modal.open", {
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
          ctx.board.emit("tau.modal.open", {
            type: "export-image",
            action: "selection",
            selectedElementIds: ctx.targetElements.map(element => element.id),
          });
        },
      });
    }

    if (context.board.document?.exportFile) {
      items.push({
        key: "export-whiteboard-data",
        label: "导出可编辑白板",
        icon: <Download size={14} />,
        priority: 322,
        onSelect: ctx => {
          void ctx.board.document!.exportFile!()
            .then(blob => downloadBlobAsFile(blob, "whiteboard.tau-board.json"))
            .catch(error => toast.error(error instanceof Error ? error.message : "白板导出失败"));
        },
      });
      items.push({
        key: "import-whiteboard-data",
        label: "导入可编辑白板",
        icon: <Download size={14} />,
        priority: 323,
        disabled: context.board.readonly,
        onSelect: ctx => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json,application/json";
          const valid = ctx.board.captureSubmission();
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            void (async () => {
              if (file.size > 32 * 1024 * 1024) throw new Error("白板包超过导入预算");
              const bundle = JSON.parse(await file.text());
              if (!valid()) throw new Error("导入目标已变化");
              await ctx.board.document!.importTransfer!(bundle, true);
            })().catch(error =>
              toast.error(error instanceof Error ? error.message : "白板导入失败")
            );
          };
          input.click();
        },
      });
    }
    return items;
  }
}

export default ExportImagePlugin;
