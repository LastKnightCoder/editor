import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHAT_INPUT_PLACEHOLDER,
  resolveChatInputModifierLabel,
  resolveChatInputPlaceholder,
} from "@tau/shared";

describe("chat input placeholder", () => {
  it("应在 macOS 下显示 Command", () => {
    expect(resolveChatInputModifierLabel("MacIntel")).toBe("Command");
    expect(
      resolveChatInputPlaceholder(DEFAULT_CHAT_INPUT_PLACEHOLDER, "MacIntel"),
    ).toBe("输入消息，Command + Enter 进行发送");
  });

  it("应在非 macOS 系统下显示 Ctrl", () => {
    expect(resolveChatInputModifierLabel("Win32")).toBe("Ctrl");
    expect(
      resolveChatInputPlaceholder(DEFAULT_CHAT_INPUT_PLACEHOLDER, "Win32"),
    ).toBe("输入消息，Ctrl + Enter 进行发送");
  });

  it("应保留不含快捷键模板的自定义文案", () => {
    expect(resolveChatInputPlaceholder("继续追问", "MacIntel")).toBe(
      "继续追问",
    );
  });
});
