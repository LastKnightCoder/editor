import { Editor } from "slate";
import { IHotKeyConfig } from "../types";
import type { CommandDispatcher } from "../api/command";
import isHotKey from "is-hotkey";

/** 热键的两种来源：v2 绑命令 id；legacy 直函数（迁移期内并存，扩展迁 v2 时切换） */
export type ResolvedHotkey =
  | { kind: "command"; keys: string | string[]; command: string }
  | { kind: "legacy"; config: IHotKeyConfig };

/**
 * keydown 的统一入口：按声明顺序匹配，命令热键经注册表执行（隔离与 enablement 在
 * dispatcher 里），legacy 热键执行 action。任一处理消费了事件（defaultPrevented）即停。
 */
export const registerHotKey = (
  editor: Editor,
  event: React.KeyboardEvent<HTMLDivElement>,
  resolved: readonly ResolvedHotkey[],
  dispatcher?: CommandDispatcher
) => {
  for (const entry of resolved) {
    if (event.defaultPrevented) {
      return;
    }

    if (entry.kind === "command") {
      if (isHotKey(entry.keys, event)) {
        dispatcher?.execute(editor, entry.command, { event });
        if (event.defaultPrevented) {
          return;
        }
      }
      continue;
    }

    const { hotKey, action } = entry.config;
    if (isHotKey(hotKey, event)) {
      action(editor, event);
      if (event.defaultPrevented) {
        return;
      }
    }
  }
};
