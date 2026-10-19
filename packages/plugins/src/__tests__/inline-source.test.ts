import { createElement } from "react";
import { expect, it, vi } from "vitest";
import { configureInlineSource } from "../inline-source";
import { InlineSourceBoundary, insertInlineSource, useInlineSource } from "../index";

it("行内源码 API 复用宿主，不在作者入口加载 Slate 或 DOM", () => {
  expect(typeof document).toBe("undefined");
  const update = vi.fn();
  const remove = vi.fn();
  const read = vi.fn(() => ({ readOnly: true, compiler: undefined, update, remove }));
  const insert = vi.fn();
  configureInlineSource({
    useInlineSource: read,
    insertInlineSource: insert,
    InlineSourceBoundary: () => createElement("span", { contentEditable: false }),
  });
  const element = { type: "test.inline", children: [] };
  const access = useInlineSource(element as never);
  expect(access.readOnly).toBe(true);
  expect(read).toHaveBeenCalledWith(element);
  access.update({ source: "修改" });
  access.remove();
  expect(update).toHaveBeenCalledWith({ source: "修改" });
  expect(remove).toHaveBeenCalledOnce();
  insertInlineSource({} as never, element as never);
  expect(insert).toHaveBeenCalledWith({}, element);
  expect(InlineSourceBoundary().props).toMatchObject({ contentEditable: false });
});
