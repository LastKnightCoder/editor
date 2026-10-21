import { describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { buildDefaultEpubMetadata, extractImageSources } from "../epub-export/metadata";

vi.mock("@/utils/editor", () => ({
  getEditorText: (content: Descendant[]) => {
    const texts: string[] = [];
    const walk = (nodes: Descendant[]) => {
      nodes.forEach((node: any) => {
        if (typeof node.text === "string") {
          texts.push(node.text);
        }
        if (Array.isArray(node.children)) {
          walk(node.children as Descendant[]);
        }
      });
    };
    walk(content);
    return texts.join("").trim();
  },
}));

const buildParagraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

const buildH1 = (text: string): Descendant => ({
  type: "header",
  level: 1,
  children: [{ type: "formatted", text }],
});

describe("epub metadata defaults", () => {
  it("优先使用外部传入标题", () => {
    const content: Descendant[] = [buildH1("文内 H1"), buildParagraph("正文")];
    const metadata = buildDefaultEpubMetadata({
      content,
      title: "外部标题",
    });

    expect(metadata.title).toBe("外部标题");
  });

  it("无外部标题时使用首个 H1", () => {
    const content: Descendant[] = [buildH1("文内 H1"), buildParagraph("正文")];
    const metadata = buildDefaultEpubMetadata({
      content,
    });

    expect(metadata.title).toBe("文内 H1");
  });

  it("无外部标题且无 H1 时回退正文文本", () => {
    const content: Descendant[] = [buildParagraph("这是正文回退标题")];
    const metadata = buildDefaultEpubMetadata({
      content,
    });

    expect(metadata.title).toContain("这是正文回退标题");
  });

  it("仅记忆作者和语言，不记忆简介和封面", () => {
    const content: Descendant[] = [
      buildParagraph("正文"),
      {
        type: "image",
        url: "https://example.com/cover.png",
        children: [{ type: "formatted", text: "" }],
      } as any,
    ];
    const metadata = buildDefaultEpubMetadata({
      content,
      remembered: {
        author: "记忆作者",
        language: "en-US",
      },
    });

    expect(metadata.author).toBe("记忆作者");
    expect(metadata.language).toBe("en-US");
    expect(metadata.description).toBe("");
    expect(metadata.coverImageSrc).toBe("https://example.com/cover.png");
  });

  it("图片来源按资源声明收集，插件图册里的图一并计入", () => {
    const content = [
      {
        type: "example.gallery",
        images: [{ url: "a.png" }, { url: " b.png " }, { url: "" }],
        children: [{ type: "formatted", text: "" }],
      },
      { type: "inline-image", url: "a.png", children: [{ type: "formatted", text: "" }] },
      { type: "video", src: "v.mp4", children: [{ type: "formatted", text: "" }] },
    ] as unknown as Descendant[];
    const declarations = {
      ...BUILTIN_CONTENT_RESOURCES,
      "example.gallery": [{ path: "images[].url", kind: "image" as const }],
    };
    expect(extractImageSources(content, 12, declarations)).toEqual(["a.png", "b.png"]);
    expect(extractImageSources(content, 1, declarations)).toEqual(["a.png"]);
    expect(extractImageSources(content)).toEqual(["a.png"]);
  });
});
