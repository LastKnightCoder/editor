import type { EditorCommand, EditorHotkey } from "../api/command";
import { modMoveCommands, modMoveHotkeys } from "./modMove";
import { caretMoveCommands, caretMoveHotkeys } from "./caretMove";
import { slashCommandCommands, slashCommandHotkeys } from "./slashCommand";
import { blockNavigationCommands, blockNavigationHotkeys } from "./blockNavigation";
import { selectAllCommands, selectAllHotkeys } from "./selectAll";

/**
 * 内核默认的命令与热键，全部经命令注册表执行（隔离与 enablement 一份）。
 * 内置命令热键的匹配顺序在扩展命令热键之后（index.tsx 的 finalHotkeys 段序）：
 * 同键位的扩展命令（表格 / 多列的 mod+方向、表格的 enter/方向导航）先匹配，
 * 内置的兜底项（mod+方向拦截、块导航）不遮蔽它们。
 */
export const builtinCommands: EditorCommand[] = [
  ...selectAllCommands,
  ...modMoveCommands,
  ...slashCommandCommands,
  ...caretMoveCommands,
  ...blockNavigationCommands,
];

export const builtinHotkeys: EditorHotkey[] = [
  ...selectAllHotkeys,
  ...modMoveHotkeys,
  ...slashCommandHotkeys,
  ...caretMoveHotkeys,
  ...blockNavigationHotkeys,
];
