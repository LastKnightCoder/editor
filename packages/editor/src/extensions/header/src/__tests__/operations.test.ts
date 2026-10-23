import { createEditor } from "slate";
import { ReactEditor } from "slate-react";
import { afterEach, expect, it, vi } from "vitest";
import { resolveHeaderAnchor } from "../operations";
import type { HeaderElement } from "../types";

afterEach(() => vi.restoreAllMocks());

it("批量解析目录时复用索引，正文替换和标题重排后解析当前节点", () => {
  const editor = createEditor();
  const first: HeaderElement = {
    type: "header",
    level: 1,
    children: [{ type: "formatted", text: "甲" }],
  };
  const second: HeaderElement = {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "乙" }],
  };
  const firstDom = document.createElement("h1");
  const secondDom = document.createElement("h2");
  vi.spyOn(ReactEditor, "toDOMNode").mockImplementation((_editor, node) =>
    node === first ? firstDom : secondDom
  );
  editor.children = [first, second];
  const filter = vi.spyOn(editor.children, "filter");
  expect(resolveHeaderAnchor(editor, 0)).toBe(firstDom);
  expect(resolveHeaderAnchor(editor, 1)).toBe(secondDom);
  expect(filter).toHaveBeenCalledTimes(1);
  editor.children = [second, first];
  expect(resolveHeaderAnchor(editor, 0)).toBe(secondDom);
  expect(resolveHeaderAnchor(editor, 1)).toBe(firstDom);
  editor.children = [];
  expect(resolveHeaderAnchor(editor, 0)).toBeNull();
});
