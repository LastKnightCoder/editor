import { describe, expect, it } from "vitest";

import { shouldIgnoreBlockKey } from "../keyboardTarget";

const keydown = (target: HTMLElement, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
};

const setup = () => {
  document.body.innerHTML = `
    <div id="editor" contenteditable="true">
      <div id="block" contenteditable="false"><div id="caption" contenteditable="plaintext-only"></div></div>
    </div>
    <div id="lightbox" aria-modal="true"><button id="close"></button></div>
    <input id="search" />`;
  const $ = (id: string) => document.getElementById(id)!;
  return {
    editor: $("editor"),
    block: $("block"),
    caption: $("caption"),
    close: $("close"),
    search: $("search"),
  };
};

describe("shouldIgnoreBlockKey", () => {
  it("焦点在包含该块的编辑器根上时照常处理", () => {
    const { editor, block } = setup();
    expect(shouldIgnoreBlockKey(keydown(editor), block)).toBe(false);
    expect(shouldIgnoreBlockKey(keydown(document.body), block)).toBe(false);
  });

  it("说明框、其他输入框里的按键不处理", () => {
    const { caption, search, block } = setup();
    expect(shouldIgnoreBlockKey(keydown(caption), block)).toBe(true);
    expect(shouldIgnoreBlockKey(keydown(search), block)).toBe(true);
  });

  it("灯箱 / 裁剪编辑器等浮层里的按键交给浮层", () => {
    const { close, block } = setup();
    expect(shouldIgnoreBlockKey(keydown(close, { key: "Escape" }), block)).toBe(true);
  });

  it("输入法组合中的按键不处理", () => {
    const { editor, block } = setup();
    expect(shouldIgnoreBlockKey(keydown(editor, { isComposing: true }), block)).toBe(true);
  });
});
