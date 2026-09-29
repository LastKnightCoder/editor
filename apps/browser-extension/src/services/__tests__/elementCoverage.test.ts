/**
 * 插件的笔记编辑器必须覆盖跨端清单里的全部业务元素类型（docs/editor-refactor P10）。
 * 笔记会被 desktop 那边的内容覆盖写回，少一个类型就只剩通用占位（ER-006）。
 */
import { describe, expect, it } from "vitest";
import { CONTENT_ELEMENT_TYPES } from "@tau/shared";
import { getExtensionKit } from "../editorKit";

describe("插件笔记编辑器的元素覆盖", () => {
  it("覆盖 CONTENT_ELEMENT_TYPES 的每一项", () => {
    const types = getExtensionKit().elementTypes;
    for (const required of CONTENT_ELEMENT_TYPES) {
      expect(types, `插件缺少 ${required}，该块只会显示通用占位`).toContain(required);
    }
  });
});
