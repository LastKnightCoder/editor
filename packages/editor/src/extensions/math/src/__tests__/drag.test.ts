import { expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { mathExtensions } from "../index";

it("块级公式注册拖拽能力，行内公式不注册块级拖拽", () => {
  const kit = createEditorKit({ extensions: mathExtensions });
  expect(kit.assembly.dragSpecs.get("block-math")).toEqual({ self: true, children: true });
  expect(kit.assembly.dragSpecs.has("inline-math")).toBe(false);
});
