import type { EditorCommand, EditorHotkey } from "../api/command";
import type { IHotKeyConfig } from "../types";
import {
  formattedTextCommands,
  formattedTextHotkeys,
  quitFormattedMarks,
  modMove,
} from "./formattedText";
import { inline } from "./inline";
import { slashCommandConfig } from "./slashCommand";
import { blockNavigationHotkeys } from "./blockNavigation";
import { selectAllCommands, selectAllHotkeys } from "./selectAll";

/**
 * 内核默认的命令与热键。命令热键经命令注册表执行（隔离与 enablement 一份）；
 * 导航类（escape / 方向 / mod+方向 / slash / 块导航）暂留 legacy 直通，后续批次再转。
 */
export const builtinCommands: EditorCommand[] = [...selectAllCommands, ...formattedTextCommands];

export const builtinHotkeys: EditorHotkey[] = [...selectAllHotkeys, ...formattedTextHotkeys];

const legacyHotKeyConfigs: IHotKeyConfig[] = [
  ...quitFormattedMarks,
  ...modMove,
  ...inline,
  ...slashCommandConfig,
  ...blockNavigationHotkeys,
];

export default legacyHotKeyConfigs;
