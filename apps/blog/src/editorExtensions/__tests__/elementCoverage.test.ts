/**
 * blog 的已发布内容必须覆盖跨端清单里的全部业务元素类型（docs/editor-refactor P10）。
 * 少一个，含该块的内容在站点上只显示通用的「无法显示」占位（ER-006）。
 */
import { describe, expect, it } from "vitest";
import { CONTENT_ELEMENT_TYPES } from "@tau/shared";
import { getBlogKit } from "../../services/editorKit";

describe("blog 已发布内容的元素覆盖", () => {
  it("覆盖 CONTENT_ELEMENT_TYPES 的每一项", () => {
    const types = getBlogKit().elementTypes;
    for (const required of CONTENT_ELEMENT_TYPES) {
      expect(types, `blog 缺少 ${required}，该块只会显示通用占位`).toContain(required);
    }
  });

  it("同一发布设置复用 kit，保留已拆扩展", () => {
    const settings = { appearance: { image: { borderRadius: "md" as const } } };
    const kit = getBlogKit(settings);
    expect(getBlogKit(settings)).toBe(kit);
    expect(getBlogKit()).toBe(getBlogKit());
    expect(getBlogKit({ ...settings })).not.toBe(kit);
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
    for (const type of ["mermaid", "plantuml", "abc", "tikz", "typst"])
      expect(kit.elementTypes).toContain(type);
  });
});
