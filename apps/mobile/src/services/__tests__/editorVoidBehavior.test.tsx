import { describe, expect, it, vi } from "vitest";
import { IEditorInteraction } from "@tau/editor/api";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import {
  verifyCodeStepEditing,
  verifyVoidBehavior,
  voidFixtures,
} from "../../../../../packages/editor/test-support/void-behavior";
import { getMobileContentKit } from "../editorKit";

vi.hoisted(() => {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  });
});

const kit = getMobileContentKit().extend({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

describe("移动端真实扩展的 void 编辑行为", () => {
  it("测试覆盖正文全部 void 声明", () => {
    expect(kit.registry.get(IEditorInteraction).touch).toBe(true);
    const types = kit.extensions
      .flatMap(extension => extension.elements ?? [])
      .filter(element => element.isVoid)
      .map(element => element.type)
      .sort();
    expect(voidFixtures.map(node => node.type).sort()).toEqual(types);
  });
  it.each(voidFixtures)("$type：进入编辑、恢复光标、输入与撤销", async fixture => {
    await verifyVoidBehavior(kit, fixture);
  });
  it("分步代码编辑只修改当前步骤，撤销后仍可恢复光标", async () => {
    await verifyCodeStepEditing(kit);
  });
});
