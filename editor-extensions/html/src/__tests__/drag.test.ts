import { expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { htmlExtensions } from "../index";

it("HTML 块注册拖拽能力，行内 HTML 不注册块级拖拽", () => {
  const kit = createEditorKit({ extensions: htmlExtensions });
  expect(kit.assembly.dragSpecs.get("html-block")).toEqual({ self: true, children: true });
  expect(kit.assembly.dragSpecs.has("html-inline")).toBe(false);
});
