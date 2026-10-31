import { createEditor, Editor, Node, Transforms, type Descendant } from "slate";
import { describe, expect, it, vi } from "vitest";
import { createEditorKit } from "@tau/editor";
import { createParagraph } from "@tau/editor/api";
import linkExtension from "@tau/editor/extensions/link";
import { createMarkdownProcessor } from "@tau/markdown";
import { IFetchService, IResourceService } from "@tau/shared/host-services";

import bookmarkExtension from "../index";
import { bookmarkCodec } from "../../markdown";
import { bookmarkDisplay } from "../display";
import { insertBookmark } from "../operations";
import { applyPasteChoice, claimsBookmarkPaste, pasteMenuOf, runBookmarkPaste } from "../paste";
import type { BookmarkElement } from "../types";

const text = (value = "") => ({ type: "formatted", text: value }) as Descendant;
const paragraph = (value = "") => {
  const node = createParagraph();
  node.children = [text(value)] as typeof node.children;
  return node;
};

function setup(services: { fetch?: typeof fetch; upload?: (file: File) => Promise<string> } = {}) {
  const kit = createEditorKit({ extensions: [bookmarkExtension, linkExtension] });
  let editor = createEditor();
  for (const plugin of kit.assembly.plugins) editor = plugin(editor);
  // 服务实例须稳定：提交按引用比对，换了实例视为作用域变化
  const fetchService = services.fetch && { fetch: services.fetch };
  const resourceService = services.upload && { upload: services.upload };
  editor.tryGetService = ((id: unknown) =>
    id === IFetchService
      ? fetchService
      : id === IResourceService
        ? resourceService
        : undefined) as typeof editor.tryGetService;
  editor.children = [paragraph()];
  Transforms.select(editor, Editor.start(editor, [0]));
  return editor;
}

const clipboard = (value: string) =>
  ({ getData: (type: string) => (type === "text/plain" ? value : "") }) as DataTransfer;
const html = (head: string) =>
  new Response(`<html><head>${head}</head></html>`, { headers: { "content-type": "text/html" } });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("书签节点", () => {
  it("插入为 void 块并写回读取到的网页信息，封面经资源服务存储", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith(".png")
        ? new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } })
        : html(`<meta property="og:title" content="标题"><meta property="og:image" content="/c.png">
            <link rel="icon" href="/i.png">`)
    ) as unknown as typeof fetch;
    const upload = vi.fn(async (file: File) => `~/.editor/resources/${file.name}`);
    const editor = setup({ fetch: fetcher, upload });
    const path = insertBookmark(editor, "https://a.com/p");
    expect(path).toEqual([0]);
    expect(editor.isVoid(Node.get(editor, [0]) as BookmarkElement)).toBe(true);
    await vi.waitFor(() => expect((Node.get(editor, [0]) as BookmarkElement).meta).toBeDefined());
    const { meta } = Node.get(editor, [0]) as BookmarkElement;
    expect(meta).toMatchObject({
      title: "标题",
      image: "~/.editor/resources/bookmark-cover.png",
      sourceImage: "https://a.com/c.png",
      icon: "~/.editor/resources/bookmark-icon.png",
      sourceIcon: "https://a.com/i.png",
    });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("读取失败记 failed；没有跨域能力时写空快照", async () => {
    const failing = setup({
      fetch: vi.fn().mockRejectedValue(new TypeError("x")) as unknown as typeof fetch,
    });
    insertBookmark(failing, "https://a.com");
    await vi.waitFor(() =>
      expect((Node.get(failing, [0]) as BookmarkElement).meta?.failed).toBe(true)
    );

    const offline = setup();
    insertBookmark(offline, "https://a.com");
    await vi.waitFor(() => expect((Node.get(offline, [0]) as BookmarkElement).meta).toBeDefined());
    expect((Node.get(offline, [0]) as BookmarkElement).meta?.failed).toBeUndefined();
  });

  it("网址改变后丢弃迟到的读取结果", async () => {
    let resolve: (value: Response) => void = () => undefined;
    const fetcher = vi.fn(
      () => new Promise<Response>(r => (resolve = r))
    ) as unknown as typeof fetch;
    const editor = setup({ fetch: fetcher });
    insertBookmark(editor, "https://a.com");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    Transforms.setNodes(editor, { url: "https://b.com" } as Partial<BookmarkElement>, { at: [0] });
    resolve(html(`<title>旧</title>`));
    await flush();
    await flush();
    expect((Node.get(editor, [0]) as BookmarkElement).meta).toBeUndefined();
  });
});

describe("显示字段", () => {
  const base: BookmarkElement = {
    type: "bookmark",
    url: "https://www.example.com/a/b",
    children: [text()],
  };

  it("没有网页信息时网址当标题，域名当网站名", () => {
    expect(bookmarkDisplay(base)).toMatchObject({
      title: "example.com/a/b",
      siteName: "example.com",
      bare: true,
    });
  });

  it("改写优先，封面以网站原图为回退，可隐藏", () => {
    const element: BookmarkElement = {
      ...base,
      meta: {
        title: "原标题",
        image: "~/r/c.png",
        sourceImage: "https://e.com/c.png",
        fetchedAt: 1,
      },
      overrides: { title: "新标题" },
    };
    expect(bookmarkDisplay(element)).toMatchObject({
      title: "新标题",
      image: "~/r/c.png",
      imageFallback: "https://e.com/c.png",
    });
    expect(bookmarkDisplay({ ...element, overrides: { image: null } }).image).toBeUndefined();
  });
});

describe("粘贴为", () => {
  it("只认领空段落里的单个网址，行内交给链接", () => {
    const editor = setup();
    expect(claimsBookmarkPaste(clipboard("https://a.com"), editor)).toBe(true);
    expect(claimsBookmarkPaste(clipboard("看 https://a.com"), editor)).toBe(false);
    editor.children = [paragraph("已有文字")];
    Transforms.select(editor, Editor.end(editor, [0]));
    expect(claimsBookmarkPaste(clipboard("https://a.com"), editor)).toBe(false);
  });

  it("先成链接，选「网页书签」替换为书签，选「纯文本」还原原文", async () => {
    const editor = setup();
    runBookmarkPaste(editor, clipboard("https://a.com/x"));
    expect(pasteMenuOf(editor).getState()).not.toBeNull();
    expect(Node.string(editor)).toBe("a.com/x");
    applyPasteChoice(editor, "bookmark");
    expect((editor.children[0] as BookmarkElement).type).toBe("bookmark");
    expect((editor.children[0] as BookmarkElement).url).toBe("https://a.com/x");
    expect((editor.children[1] as { type: string }).type).toBe("paragraph");
    expect(pasteMenuOf(editor).getState()).toBeNull();

    const plain = setup();
    runBookmarkPaste(plain, clipboard("https://a.com/x"));
    applyPasteChoice(plain, "text");
    expect(plain.children).toHaveLength(1);
    expect(Node.string(plain)).toBe("https://a.com/x");

    const keep = setup();
    runBookmarkPaste(keep, clipboard("https://a.com/x"));
    applyPasteChoice(keep, "link");
    expect(Node.string(keep)).toBe("a.com/x");
    expect(pasteMenuOf(keep).getState()).toBeNull();
  });

  it("粘贴后又输入了文字，选择不再改写段落", () => {
    const editor = setup();
    runBookmarkPaste(editor, clipboard("https://a.com"));
    Transforms.insertText(editor, " 继续");
    applyPasteChoice(editor, "bookmark");
    expect((editor.children[0] as { type: string }).type).toBe("paragraph");
  });
});

it("导出为独占一段的 Markdown 链接", () => {
  const processor = createMarkdownProcessor({ codecs: [bookmarkCodec] });
  const element: BookmarkElement = {
    type: "bookmark",
    url: "https://a.com",
    meta: { title: "标题 [1]", fetchedAt: 1 },
    children: [text()],
  };
  expect(processor.getMarkdown([element as unknown as Descendant]).trim()).toBe(
    "[标题 \\[1\\]](https://a.com)"
  );
});
