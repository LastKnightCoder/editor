/**
 * 插件的笔记编辑器必须覆盖跨端清单里的全部业务元素类型（docs/editor-refactor P10）。
 * 笔记会被 desktop 那边的内容覆盖写回，少一个类型就只剩通用占位（ER-006）。
 */
import { describe, expect, it } from "vitest";
import { CONTENT_ELEMENT_TYPES } from "@tau/shared";
import { getExtensionKit } from "../editorKit";
import WebSocketClient from "../../utils/WebSocketClient";

describe("插件笔记编辑器的元素覆盖", () => {
  it("按连接对象隔离缓存，断开连接不重建编辑器 Kit", () => {
    const first = new WebSocketClient("ws://localhost:1");
    const second = new WebSocketClient("ws://localhost:1");
    const kit = getExtensionKit(first);
    expect(getExtensionKit(first)).toBe(kit);
    expect(getExtensionKit(second)).not.toBe(kit);
    expect(getExtensionKit()).not.toBe(kit);
    first.disconnect();
    expect(getExtensionKit(first)).toBe(kit);
  });
  it("覆盖 CONTENT_ELEMENT_TYPES 的每一项", () => {
    const types = getExtensionKit().elementTypes;
    for (const required of CONTENT_ELEMENT_TYPES) {
      expect(types, `插件缺少 ${required}，该块只会显示通用占位`).toContain(required);
    }
  });

  it("未连接的场景 kit 复用实例并保留已拆扩展", () => {
    const kit = getExtensionKit();
    expect(getExtensionKit()).toBe(kit);
    for (const id of [
      "tau.mark.bold",
      "tau.header.promote",
      "tau.transform.to.bulleted-list",
      "tau.preview.edit",
    ])
      expect(kit.assembly.commands.get(id), id).toBeDefined();
    expect(kit.assembly.commandHotkeys.some(entry => entry.hotkey.key === "mod+b")).toBe(true);
    expect(kit.assembly.hoveringBarElements.length).toBeGreaterThan(0);
    expect(kit.extensions.filter(extension => extension.id === "tau.preview-menu")).toHaveLength(1);
    for (const type of ["mermaid", "plantuml", "abc"]) expect(kit.elementTypes).toContain(type);
    expect(kit.elementTypes).not.toContain("tikz");
    expect(kit.elementTypes).not.toContain("typst");
  });
});
