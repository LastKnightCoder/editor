/**
 * blog 的已发布内容必须覆盖跨端清单里的全部业务元素类型（docs/editor-refactor P10）。
 * 少一个，含该块的内容在站点上就渲染成字面的「无法识别的类型 X」。
 */
import { describe, expect, it } from "vitest";
import { CONTENT_ELEMENT_TYPES } from "@tau/shared";
import { blogEditorExtensions } from "../index";

describe("blog 已发布内容的元素覆盖", () => {
  it("覆盖 CONTENT_ELEMENT_TYPES 的每一项", () => {
    const types = blogEditorExtensions.map(extension => extension.type);
    for (const required of CONTENT_ELEMENT_TYPES) {
      expect(types, `blog 缺少 ${required}，该块会渲染成「无法识别的类型」`).toContain(required);
    }
  });
});
