import { createEditor, Editor, Transforms, type Descendant, type Element } from "slate";
import { describe, expect, it, vi } from "vitest";
import { createEditorKit } from "../kit/EditorKit";
import { isNodeEmpty } from "../api";
import { withBlockNavigation } from "../plugins/withBlockNavigation";
import { registerBlockNavigation, unregisterBlockNavigation } from "../utils/blockNavigation";
import { default as blockquote } from "@tau/editor-blockquote";
import { default as callout } from "@tau/editor-callout";
import { default as detail } from "@tau/editor-detail";
import {
  tableExtension as table,
  tableRowExtension as tableRow,
  tableCellExtension as tableCell,
} from "@tau/editor-table";
import { listItem, bulletedList, numberedList, checkList, checkListItem } from "@tau/editor-list";
import { default as link } from "@tau/editor-link";
import { default as kbd } from "@tau/editor-kbd";
import { default as underline } from "@tau/editor-underline";
import { default as styledText } from "@tau/editor-styled-text";
import { inlineImage, image } from "@tau/editor-media";

const text = (value = "") => ({ type: "formatted" as const, text: value });
const node = (type: string, children: unknown[], fields = {}): Descendant =>
  ({ type, children, ...fields }) as Descendant;
const paragraph = (value = "") => node("paragraph", [text(value)]);
const createDomainEditor = () =>
  createEditorKit({
    extensions: [
      link,
      underline,
      styledText,
      kbd,
      inlineImage,
      image,
      listItem,
      bulletedList,
      numberedList,
      checkList,
      checkListItem,
      blockquote,
      callout,
      detail,
      table,
      tableRow,
      tableCell,
    ],
  }).assembly.plugins.reduce((editor, plugin) => plugin(editor), createEditor());

describe("领域空态由安装的扩展贡献", () => {
  it.each(["", "resource://image"])("退格导航只删除领域确认的空段落：%s", url => {
    const editor = withBlockNavigation(createDomainEditor());
    const previous = paragraph("前块") as Element;
    const current = node("paragraph", [text(), node("inline-image", [text()], { url }), text()]);
    const focusEnd = vi.fn(() => true);
    registerBlockNavigation(previous, { focusEnd });
    editor.children = [previous, current];
    try {
      Transforms.select(editor, Editor.start(editor, [1]));
      editor.deleteBackward("character");
      expect(focusEnd).toHaveBeenCalledTimes(1);
      expect(editor.children).toHaveLength(url ? 2 : 1);
      if (url) expect(editor.children[1]).toBe(current);
    } finally {
      unregisterBlockNavigation(previous);
    }
  });

  it.each(["link", "underline", "styled-text", "kbd"])("%s 保留单个空叶子的规则", type => {
    const editor = createDomainEditor();
    expect(isNodeEmpty(node(type, [text()]), editor)).toBe(true);
    expect(isNodeEmpty(node(type, [text("内容")]), editor)).toBe(false);
    expect(isNodeEmpty(node(type, [text(), text()]), editor)).toBe(false);
    expect(isNodeEmpty(node(type, [text()]), createEditor())).toBe(false);
  });

  it.each([
    "list-item",
    "bulleted-list",
    "numbered-list",
    "check-list",
    "check-list-item",
    "blockquote",
    "callout",
    "detail",
  ])("%s 递归判断，不丢未知或有内容子节点", type => {
    const editor = createDomainEditor();
    expect(isNodeEmpty(node(type, [paragraph()]), editor)).toBe(true);
    expect(isNodeEmpty(node(type, [paragraph("正文")]), editor)).toBe(false);
    expect(isNodeEmpty(node(type, [node("unknown", [text()])]), editor)).toBe(false);
    expect(isNodeEmpty(node(type, [paragraph()]), createEditor())).toBe(false);
  });

  it("图片的真实内容字段由媒体扩展判断，空文本占位不能掩盖图片", () => {
    const editor = createDomainEditor();
    for (const type of ["image", "inline-image"]) {
      const empty = node(type, [text()], { url: "" });
      const filled = node(type, [text()], { url: "resource://image" });
      expect(isNodeEmpty(empty, editor)).toBe(true);
      expect(isNodeEmpty(filled, editor)).toBe(false);
      expect(isNodeEmpty(empty, createEditor())).toBe(false);
    }
    expect(
      isNodeEmpty(
        node("paragraph", [
          text(),
          node("inline-image", [text()], { url: "resource://image" }),
          text(),
        ]),
        editor
      )
    ).toBe(false);
  });

  it("表格沿自身行/单元格结构判断，行和单元格不能作为空块自动删除", () => {
    const editor = createDomainEditor();
    const cell = node("table-cell", [text()]);
    const row = node("table-row", [cell]);
    expect(isNodeEmpty(node("table", [row]), editor)).toBe(true);
    expect(isNodeEmpty(row, editor)).toBe(false);
    expect(isNodeEmpty(cell, editor)).toBe(false);
    expect(
      isNodeEmpty(
        node("table", [
          node("table-row", [
            node("table-cell", [node("inline-image", [text()], { url: "resource://image" })]),
          ]),
        ]),
        editor
      )
    ).toBe(false);
    expect(isNodeEmpty(node("table", [row]), createEditor())).toBe(false);
  });
});
