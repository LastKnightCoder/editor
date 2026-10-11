import { FIT_VIEW_PADDING } from "../constants";
import { ViewPortTransforms, SelectTransforms } from "../transforms";
import { BoardUtil, deleteBoardElements } from "../utils";
import type { Board, BoardElement, ViewPort } from "../types";
import { resolveBoardAccess } from "./access";
import type { WhiteboardAPI, WhiteboardCommand } from "./api";

/**
 * tau.interaction 的命令与快捷键（原 HistoryPlugin / SelectPlugin / ViewPortPlugin
 * 的 onKeyDown 硬编码迁移而来）：撤销重做、全选与删除、视口缩放与全览。
 * 让位规则（输入法、编辑上下文、元素编辑中、演示态）由扩展运行时统一仲裁，
 * 命令 enabled 只表达自身可用性。
 */

const VIEW_ANIMATION_MS = 300;

const isSameViewport = (a: ViewPort, b: ViewPort) =>
  (["minX", "minY", "width", "height", "zoom"] as const).every(
    key => Math.abs(a[key] - b[key]) <= 1e-6 * Math.max(1, Math.abs(b[key]))
  );

export function createInteractionContributions() {
  const boardOf = (api: WhiteboardAPI): Board => resolveBoardAccess(api);
  /** Z 全览前的视角与全览目标；视角离开全览目标（手动平移 / 缩放）后再按 Z 重新全览 */
  let quickFit: { from: ViewPort; to: ViewPort } | null = null;

  const commands: WhiteboardCommand[] = [
    {
      id: "tau.history.undo",
      enabled: api => {
        const board = boardOf(api);
        return !board.readonly && board.undos.length > 0;
      },
      execute: api => boardOf(api).undo(),
    },
    {
      id: "tau.history.redo",
      enabled: api => {
        const board = boardOf(api);
        return !board.readonly && board.redos.length > 0;
      },
      execute: api => boardOf(api).redo(),
    },
    {
      id: "tau.selection.select-all",
      execute: api => {
        const board = boardOf(api);
        const allElements: BoardElement[] = [];
        BoardUtil.dfs(board, node => {
          allElements.push(node);
        });
        SelectTransforms.updateSelectArea(board, {
          selectArea: null,
          selectedElements: allElements,
        });
      },
    },
    {
      id: "tau.selection.delete",
      enabled: api => {
        const board = boardOf(api);
        return !board.readonly && board.selection.selectedElements.length > 0;
      },
      execute: api => {
        const board = boardOf(api);
        const deleted = deleteBoardElements(board, [...board.selection.selectedElements]);
        if (deleted) {
          SelectTransforms.updateSelectArea(board, {
            selectArea: null,
            selectedElements: [],
          });
        }
      },
    },
    {
      id: "tau.viewport.zoom-in",
      execute: api => {
        const board = boardOf(api);
        ViewPortTransforms.updateZoom(board, Math.min(board.viewPort.zoom * 1.1, 10));
      },
    },
    {
      id: "tau.viewport.zoom-out",
      execute: api => {
        const board = boardOf(api);
        ViewPortTransforms.updateZoom(board, Math.max(board.viewPort.zoom / 1.1, 0.1));
      },
    },
    {
      id: "tau.viewport.fit",
      execute: api => {
        const board = boardOf(api);
        const selectedElements = [...board.selection.selectedElements];
        if (selectedElements.length > 0) {
          ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true, selectedElements);
          // 在下一个事件循环中恢复选中状态，避免被全局事件处理器清除
          setTimeout(() => {
            if (selectedElements.length > 0) {
              board.apply(
                {
                  type: "set_selection",
                  properties: board.selection,
                  newProperties: {
                    selectArea: null,
                    selectedElements: selectedElements,
                  },
                },
                false
              );
            }
          }, 0);
        } else {
          ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true);
        }
      },
    },
    {
      id: "tau.viewport.toggle-fit",
      execute: api => {
        const board = boardOf(api);
        const current = { ...board.viewPort };
        if (quickFit && isSameViewport(current, quickFit.to)) {
          const { from } = quickFit;
          quickFit = null;
          ViewPortTransforms.animateToViewport(board, current, from, VIEW_ANIMATION_MS);
          return;
        }
        const to = ViewPortTransforms.getFitViewport(board, FIT_VIEW_PADDING);
        if (!to) return;
        quickFit = { from: current, to };
        ViewPortTransforms.animateToViewport(board, current, to, VIEW_ANIMATION_MS);
      },
    },
    {
      id: "tau.viewport.fit-all",
      execute: api => ViewPortTransforms.fitAllElements(boardOf(api), FIT_VIEW_PADDING, true),
    },
    {
      id: "tau.viewport.fit-selection",
      enabled: api => boardOf(api).selection.selectedElements.length > 0,
      execute: api => {
        const board = boardOf(api);
        const selected = [...board.selection.selectedElements];
        if (selected.length === 0) return;
        ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true, selected);
      },
    },
    {
      id: "tau.viewport.zoom-reset",
      execute: api => ViewPortTransforms.updateZoom(boardOf(api), 1),
    },
  ];

  const hotkeys = [
    { key: "mod+z", command: "tau.history.undo" },
    { key: "mod+shift+z", command: "tau.history.redo" },
    { key: "mod+y", command: "tau.history.redo" },
    { key: "mod+a", command: "tau.selection.select-all" },
    { key: "delete", command: "tau.selection.delete" },
    { key: "backspace", command: "tau.selection.delete" },
    { key: "mod+=", command: "tau.viewport.zoom-in" },
    { key: "mod+-", command: "tau.viewport.zoom-out" },
    { key: "mod+o", command: "tau.viewport.fit" },
    { key: "z", command: "tau.viewport.toggle-fit" },
  ];

  // shift+数字在键盘布局间 event.key 漂移（!、@…），按 event.code 登记
  const hotkeyCodes = [
    { code: "Digit1", shift: true, command: "tau.viewport.fit-all" },
    { code: "Digit2", shift: true, command: "tau.viewport.fit-selection" },
    { code: "Digit0", shift: true, command: "tau.viewport.zoom-reset" },
  ];

  return { commands, hotkeys, hotkeyCodes };
}
