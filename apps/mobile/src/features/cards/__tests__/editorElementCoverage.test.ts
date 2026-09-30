/**
 * mobile 的 content 场景 kit 必须覆盖跨端清单里的全部业务元素类型（docs/editor-refactor P10）。
 * 少一个，含该块的内容在 mobile 上只显示通用的「无法显示」占位（ER-006）。
 */
import { describe, expect, it } from "vitest";
import { CONTENT_ELEMENT_TYPES } from "@tau/shared";
import { getMobileContentKit } from "../../../services/editorKit";

describe("mobile content 场景的元素覆盖", () => {
  it("覆盖 CONTENT_ELEMENT_TYPES 的每一项", () => {
    const types = getMobileContentKit().elementTypes;
    for (const required of CONTENT_ELEMENT_TYPES) {
      expect(types, `mobile 缺少 ${required}，该块只会显示通用占位`).toContain(required);
    }
  });

  it("场景 kit 保留已拆扩展并复用实例", () => {
    const kit = getMobileContentKit();
    expect(getMobileContentKit()).toBe(kit);
    for (const type of ["custom-block", "mermaid", "plantuml", "abc", "tikz", "typst"])
      expect(kit.elementTypes).toContain(type);
  });
});
