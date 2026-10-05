import { createEditor, Editor, Node, Transforms } from "slate";
import { describe, expect, it } from "vitest";
import { createParagraph } from "@tau/editor/api";
import { wrapLink, unwrapLink } from "../index";
import { findLinkEntry, pasteUrl, relinkRange, unlinkAt, updateLink } from "../operations";
import type { LinkElement } from "../types";
import { createLinkEditor, link, text } from "./helpers";

const links = (editor: Editor) =>
  [...Editor.nodes(editor, { at: [], match: node => (node as LinkElement).type === "link" })].map(
    ([node]) => node as LinkElement
  );

describe("link 的公开选区操作", () => {
  it("局部包裹/解包保留原文", () => {
    const editor = createLinkEditor([text("abcd")]);
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 3 },
    });
    wrapLink(editor, "https://example.com");
    expect(Node.string(editor)).toBe("abcd");
    expect(links(editor).map(node => Node.string(node))).toEqual(["bc"]);
    const [, path] = findLinkEntry(editor, [])!;
    Transforms.select(editor, Editor.range(editor, path));
    unwrapLink(editor);
    expect(Node.string(editor)).toBe("abcd");
    expect(links(editor)).toHaveLength(0);
  });

  it("无选区时不改写文档", () => {
    const editor = createEditor();
    editor.children = [createParagraph()];
    const before = JSON.stringify(editor.children);
    wrapLink(editor, "https://example.com");
    unwrapLink(editor);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  it("折叠选区插入以地址为文字的链接，补全协议，光标落在链接之后", () => {
    const editor = createLinkEditor([text("看 ")]);
    Transforms.select(editor, Editor.end(editor, []));
    wrapLink(editor, "react.dev/learn/");
    const [created] = links(editor);
    expect(created.url).toBe("https://react.dev/learn/");
    expect(Node.string(created)).toBe("react.dev/learn");
    editor.insertText("！");
    expect(Node.string(created)).toBe("react.dev/learn");
    expect(Node.string(editor)).toBe("看 react.dev/learn！");
  });

  it("空地址不新建链接", () => {
    const editor = createLinkEditor([text("abc")]);
    Transforms.select(editor, Editor.range(editor, []));
    expect(wrapLink(editor, "  ")).toBeNull();
    expect(links(editor)).toHaveLength(0);
  });
});

describe("编辑与取消链接", () => {
  it("一次修改文字与地址", () => {
    const editor = createLinkEditor([
      text("看 "),
      link("https://a.com", text("旧文字")),
      text("。"),
    ]);
    const [, path] = findLinkEntry(editor, [])!;
    updateLink(editor, path, { url: "b.com", text: "新文字" });
    const [updated] = links(editor);
    expect(updated.url).toBe("https://b.com");
    expect(Node.string(updated)).toBe("新文字");
    expect(Node.string(editor)).toBe("看 新文字。");
  });

  it("带格式的链接只改地址，文字留空时保留原文", () => {
    const editor = createLinkEditor([
      link("https://a.com", text("加粗", { bold: true }), text("普通")),
    ]);
    const [, path] = findLinkEntry(editor, [])!;
    updateLink(editor, path, { url: "https://b.com", text: "覆盖" });
    expect(Node.string(links(editor)[0])).toBe("加粗普通");

    const plain = createLinkEditor([link("https://a.com", text("原文"))]);
    updateLink(plain, findLinkEntry(plain, [])![1], { url: "https://a.com", text: "  " });
    expect(Node.string(links(plain)[0])).toBe("原文");
  });

  it("地址清空即取消链接", () => {
    const editor = createLinkEditor([link("https://a.com", text("文字"))]);
    updateLink(editor, findLinkEntry(editor, [])![1], { url: " " });
    expect(links(editor)).toHaveLength(0);
    expect(Node.string(editor)).toBe("文字");
  });

  it("取消链接后可按原范围撤销", () => {
    const editor = createLinkEditor([text("前"), link("https://a.com", text("中间")), text("后")]);
    const ref = unlinkAt(editor, findLinkEntry(editor, [])![1]);
    expect(links(editor)).toHaveLength(0);
    relinkRange(editor, ref.unref(), "https://a.com");
    const [restored] = links(editor);
    expect(restored.url).toBe("https://a.com");
    expect(Node.string(restored)).toBe("中间");
    expect(Node.string(editor)).toBe("前中间后");
  });
});

describe("粘贴网址", () => {
  it("选中文字粘贴直接成链", () => {
    const editor = createLinkEditor([text("参考 React 官方文档")]);
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 3 },
      focus: { path: [0, 0], offset: 13 },
    });
    pasteUrl(editor, "https://react.dev ");
    const [created] = links(editor);
    expect(created.url).toBe("https://react.dev");
    expect(Node.string(created)).toBe("React 官方文档");
  });

  it("光标处粘贴插入为链接", () => {
    const editor = createLinkEditor([text("看 ")]);
    Transforms.select(editor, Editor.end(editor, []));
    pasteUrl(editor, "https://react.dev/learn");
    expect(Node.string(links(editor)[0])).toBe("react.dev/learn");
  });

  it("已在链接里、行内代码中、跨块选区按纯文本粘贴", () => {
    const inLink = createLinkEditor([link("https://a.com", text("链接"))]);
    Transforms.select(inLink, Editor.end(inLink, findLinkEntry(inLink, [])![1]));
    pasteUrl(inLink, "https://b.com");
    expect(links(inLink)).toHaveLength(1);
    expect(Node.string(links(inLink)[0])).toBe("链接https://b.com");

    const inCode = createLinkEditor([text("const a", { code: true })]);
    Transforms.select(inCode, Editor.end(inCode, []));
    pasteUrl(inCode, "https://b.com");
    expect(links(inCode)).toHaveLength(0);
    expect(Node.string(inCode)).toBe("const ahttps://b.com");

    const crossBlock = createLinkEditor([text("第一段")], [text("第二段")]);
    Transforms.select(crossBlock, {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });
    pasteUrl(crossBlock, "https://b.com");
    expect(links(crossBlock)).toHaveLength(0);
  });
});
