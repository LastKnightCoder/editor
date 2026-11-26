import { menuText } from "../menu-i18n";
import { whiteboardFeedback } from "../feedback-i18n";
import type { TranslationValues } from "@tau/i18n";
import type { WhiteboardMessageKey } from "../messages";
import { toast, type ToastOptions } from "@tau/ui";
import { downloadBlobAsFile } from "../utils/ExportImageUtil";
import { Download } from "lucide-react";
import { IBoardPlugin, ContextMenuContext, PluginContextMenuItem } from "../types";

class ImportUiError extends Error {
  readonly parameters: TranslationValues;
  constructor(
    readonly kind: "budget" | "target",
    message: string,
    parameters: TranslationValues = {}
  ) {
    super(message);
    this.parameters = Object.freeze({ ...parameters });
  }
}
function failureFeedback(
  board: ContextMenuContext["board"],
  error: unknown,
  fallback: WhiteboardMessageKey
): readonly [string, ToastOptions] {
  if (error instanceof ImportUiError)
    return whiteboardFeedback(
      board,
      error.kind === "budget" ? "menus.media.importBudget" : "menus.media.importTarget",
      error.parameters
    );
  return error instanceof Error
    ? ([error.message, {}] as const)
    : whiteboardFeedback(board, fallback);
}

export class ExportImagePlugin implements IBoardPlugin {
  name = "export-image";

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const items: PluginContextMenuItem[] = [];

    items.push({
      key: "export-board-image",
      ...menuText(context.board, "menus.media.exportBoard"),
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
        ...menuText(
          context.board,
          context.isHitSelected ? "menus.media.exportSelection" : "menus.media.exportElement"
        ),
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
        ...menuText(context.board, "menus.media.exportEditable"),
        icon: <Download size={14} />,
        priority: 322,
        onSelect: ctx => {
          void ctx.board.document
            ?.exportFile?.()
            .then(blob => downloadBlobAsFile(blob, "whiteboard.tau-board.json"))
            .catch(error =>
              toast.error(...failureFeedback(ctx.board, error, "menus.media.exportFailed"))
            );
        },
      });
      items.push({
        key: "import-whiteboard-data",
        ...menuText(context.board, "menus.media.importEditable"),
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
              if (file.size > 32 * 1024 * 1024)
                throw new ImportUiError("budget", "白板包超过导入预算", {
                  bytes: file.size,
                  limit: 32 * 1024 * 1024,
                });
              const bundle = JSON.parse(await file.text());
              if (!valid()) throw new ImportUiError("target", "导入目标已变化");
              console.info("[whiteboard-edit] 从文件导入白板", {
                bytes: file.size,
              });
              await ctx.board.document?.importTransfer?.(bundle, true);
            })().catch(error =>
              toast.error(...failureFeedback(ctx.board, error, "menus.media.importFailed"))
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
