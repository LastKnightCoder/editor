import { expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { customBlockExtension } from "../index";

it("自定义预览块注册拖拽源与放置目标", () => {
  const kit = createEditorKit({ extensions: [customBlockExtension] });
  expect(kit.assembly.dragSpecs.get("custom-block")).toEqual({ self: true, children: true });
});
