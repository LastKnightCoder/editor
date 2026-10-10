import { useSyncExternalStore } from "react";
import { useMemoizedFn } from "ahooks";
import type Board from "../Board";
import { RICHTEXT_TOOL_ID, SELECT_TOOL_ID } from "../constants/tools";

/**
 * 创建模式光标：创建型工具按 spec.cursor（默认 crosshair），旧内置创建工具补齐
 * crosshair（文本工具给 text）；非创建模式返回 null。
 * 在 BoardContext.Provider 之上调用，board 由调用方传入。
 */
export const useCreateToolCursor = (board: Board): string | null => {
  const subscribe = useMemoizedFn((callback: () => void) => {
    board.on("active-tool:change", callback);
    return () => {
      board.off("active-tool:change", callback);
    };
  });
  const tool = useSyncExternalStore(subscribe, () => board.activeTool);

  if (tool === SELECT_TOOL_ID) return null;
  const createTool = board.extensions?.getCreateTool(tool);
  if (createTool) {
    return createTool.definition.create?.cursor === "text" ? "cursor-text" : "cursor-crosshair";
  }
  // 旧内置创建工具（useCreate* 路径）：文本工具用文本光标，其余 crosshair
  return tool === RICHTEXT_TOOL_ID ? "cursor-text" : "cursor-crosshair";
};
