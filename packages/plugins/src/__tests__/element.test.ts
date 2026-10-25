import { createElement } from "react";
import { expect, it, vi } from "vitest";
import { configureElement } from "../element";
import {
  BlockToolbar,
  BlockToolbarButton,
  BlockToolbarGap,
  useElement,
  useMediaViewer,
} from "../index";

it("块组件 API 由编辑器宿主注入，作者入口不加载 Slate 或 DOM", () => {
  expect(typeof document).toBe("undefined");
  const element = { type: "test.block", children: [] };
  expect(() => useElement(element as never)).toThrow("块组件需要 Tau 编辑器宿主");

  const access = {
    view: {},
    updateView: vi.fn(),
    readOnly: false,
    selected: true,
    update: vi.fn(),
    remove: vi.fn(),
    select: vi.fn(),
    openMenu: vi.fn(),
  };
  const open = vi.fn();
  configureElement({
    useElement: () => access,
    useMediaViewer: () => open,
    BlockToolbar: props => createElement("div", { role: "toolbar" }, props.children),
    BlockToolbarButton: props => createElement("button", { title: props.title }),
    BlockToolbarGap: () => createElement("span"),
  });

  expect(useElement(element as never)).toBe(access);
  useMediaViewer(element as never)(2);
  expect(open).toHaveBeenCalledWith(2);
  expect(BlockToolbar({ label: "属性", children: "x" }).props).toMatchObject({ role: "toolbar" });
  expect(BlockToolbarButton({ title: "编辑", onClick: () => undefined }).props).toMatchObject({
    title: "编辑",
  });
  expect(BlockToolbarGap().type).toBe("span");
});
