import { expect, it, vi } from "vitest";
import { createEditorKit } from "@tau/editor";
import { createEmbeddedRichTextService, embeddedTextOptions } from "../extensions/text";

vi.mock("@tau/editor", async original => {
  const module = await original<typeof import("@tau/editor")>();
  return { ...module, createEditorKit: vi.fn(module.createEditorKit) };
});

it("默认富文本 Kit 在首次使用时创建，模块加载不触发循环初始化", () => {
  expect(createEditorKit).not.toHaveBeenCalled();
  const service = createEmbeddedRichTextService();
  expect(createEditorKit).not.toHaveBeenCalled();
  const kit = service.kit();
  expect(createEditorKit).toHaveBeenCalledTimes(1);
  expect(embeddedTextOptions.kit()).toBe(kit);
  expect(createEmbeddedRichTextService().kit()).toBe(kit);
});
