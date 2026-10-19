import { describe, expect, it, vi } from "vitest";
import { createEditor } from "slate";
import { registerHotKey } from "../hotkey";
import type { CommandDispatcher } from "../../api/command";

describe("输入法与热键仲裁", () => {
  it("组合事件及 229 不进入命令分发，普通回车仍可消费", () => {
    const editor = createEditor();
    const dispatcher = {
      execute: vi.fn<CommandDispatcher["execute"]>((_editor, _id, ctx) => {
        ctx?.event?.preventDefault();
        return true;
      }),
    };
    const hotkeys = [{ kind: "command" as const, keys: "enter", command: "confirm" }];
    const event = (composing: boolean, keyCode = 13) => ({
      key: "Enter",
      which: 13,
      keyCode,
      nativeEvent: { isComposing: composing },
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    });
    registerHotKey(editor, event(true) as never, hotkeys, dispatcher);
    registerHotKey(editor, event(false, 229) as never, hotkeys, dispatcher);
    expect(dispatcher.execute).not.toHaveBeenCalled();
    const normal = event(false);
    registerHotKey(editor, normal as never, hotkeys, dispatcher);
    expect(dispatcher.execute).toHaveBeenCalledOnce();
    expect(normal.defaultPrevented).toBe(true);
  });
});
