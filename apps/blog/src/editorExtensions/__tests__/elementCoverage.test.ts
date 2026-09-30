/**
 * blog 的已发布内容必须覆盖跨端清单里的全部业务元素类型（docs/editor-refactor P10）。
 * 少一个，含该块的内容在站点上只显示通用的「无法显示」占位（ER-006）。
 */
import { describe, expect, it } from "vitest";
import { CONTENT_ELEMENT_TYPES } from "@tau/shared";
import { blogEditorExtensions } from "../index";
import { getBlogKit } from "../../services/editorKit";

describe("blog 已发布内容的元素覆盖", () => {
  it("覆盖 CONTENT_ELEMENT_TYPES 的每一项", () => {
    // 迁移过渡期两种形状并存：旧 IExtension 的 type 在顶层，v2 在 elements 里
    const typeOf = (extension: unknown): string | string[] => {
      const legacy = (extension as { type?: string }).type;
      if (legacy) return legacy;
      return (extension as { elements: { type: string }[] }).elements.map(element => element.type);
    };
    const types = blogEditorExtensions.flatMap(typeOf);
    for (const required of CONTENT_ELEMENT_TYPES) {
      expect(types, `blog 缺少 ${required}，该块只会显示通用占位`).toContain(required);
    }
  });

  it("同一发布设置复用 kit，保留已拆扩展", () => {
    const settings = { appearance: { image: { borderRadius: "md" as const } } };
    const kit = getBlogKit(settings);
    expect(getBlogKit(settings)).toBe(kit);
    for (const type of ["custom-block", "mermaid", "plantuml", "abc", "tikz", "typst"])
      expect(kit.elementTypes).toContain(type);
  });
});
