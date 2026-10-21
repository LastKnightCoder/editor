import { Blob as NodeBlob } from "node:buffer";
import { Uint8ArrayReader, ZipReader, TextWriter, configure as configureZip } from "@zip.js/zip.js";
import type { Descendant } from "slate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  collectAssetUrls,
  inlineLocalImages,
  mapAssetUrls,
  type AssetIo,
} from "../content-transfer/assets";
import {
  collectBundleAssets,
  encodeMarkdownPath,
  localizeContent,
  relativeBundlePath,
  toPortableMarkdown,
} from "../content-transfer/bundle";
import { ingestLocalAssets, type ImportIo } from "../content-transfer/import";
import { buildMarkdownZipBytes, type BatchExportTreeNode } from "../batch-export";
import { EProjectItemType } from "@/types";

vi.mock("@/commands/file", () => ({
  readBinaryFile: vi.fn(),
  readTextFile: vi.fn(),
  getDirectoryName: vi.fn(),
  getFileBaseName: vi.fn(),
  getHomeDir: vi.fn(),
  resolvePathFrom: vi.fn(),
}));
vi.mock("@/utils/localMediaPath", () => ({
  resolveLocalMediaPath: vi.fn(),
  getMediaMimeType: (ext: string) => (ext === ".png" ? "image/png" : "application/octet-stream"),
}));
vi.mock("@/hooks/useUploadResource", () => ({ uploadResource: vi.fn() }));

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (...children: unknown[]) => ({ type: "paragraph", children });
const image = (url: string) => ({ type: "image", url, alt: "", children: [text("")] });
const contentLink = (refId: number, title: string, contentType = "project-item") => ({
  type: "content-link",
  refId,
  contentId: refId * 10,
  contentType,
  contentTitle: title,
  children: [text("")],
});

const fakeIo = (files: Record<string, Uint8Array>): AssetIo => ({
  resolveLocalMediaPath: async raw => raw.replace(/^~/, "/home/me"),
  readBinaryFile: async path => {
    const bytes = files[path];
    if (!bytes) throw new Error("文件不存在");
    return bytes;
  },
});

const doc = (...nodes: unknown[]) => nodes as Descendant[];

describe("资源地址遍历", () => {
  it("覆盖块图、行内图、图集、音视频与附件", () => {
    const content = doc(
      image("~/a.png"),
      paragraph(text("x"), { type: "inline-image", url: "b.png", children: [text("")] }),
      {
        type: "image-gallery",
        images: [{ url: "c.png" }, { url: "https://x/d.png" }],
        children: [text("")],
      },
      { type: "audio", src: "e.mp3", children: [text("")] },
      { type: "video", src: "f.mp4", children: [text("")] },
      {
        type: "file-attachment",
        fileName: "g.pdf",
        filePath: "/orig/g.pdf",
        localFilePath: "/local/g.pdf",
        isLocal: true,
        uuid: "u",
        children: [text("")],
      }
    );
    expect(collectAssetUrls(content).map(ref => `${ref.kind}:${ref.url}`)).toEqual([
      "image:~/a.png",
      "image:b.png",
      "image:c.png",
      "image:https://x/d.png",
      "audio:e.mp3",
      "video:f.mp4",
      "file:/local/g.pdf",
    ]);
  });

  it("插件节点按传入的资源声明改写，未声明的字段不当资源", () => {
    const content = doc({
      type: "example.compare",
      before: { src: "~/before.png" },
      link: "~/not-a-resource.png",
      children: [text("")],
    });
    const declarations = {
      "example.compare": [{ path: "before.src", kind: "image" as const }],
    };
    expect(collectAssetUrls(content, declarations)).toEqual([
      { url: "~/before.png", kind: "image" },
    ]);
    expect(collectAssetUrls(content)).toEqual([]);
    const [mapped] = mapAssetUrls(content, url => `bundle/${url.slice(2)}`, {}, declarations);
    expect(mapped).toMatchObject({
      before: { src: "bundle/before.png" },
      link: "~/not-a-resource.png",
    });
  });

  it("未改动的子树保持原引用，附件改写后按上传结果标记 isLocal", () => {
    const untouched = paragraph(text("不变"));
    const attachment = {
      type: "file-attachment",
      fileName: "g.pdf",
      filePath: "/local/g.pdf",
      isLocal: true,
      uuid: "u",
      children: [text("")],
    };
    const content = doc(untouched, attachment);
    const [kept, mapped] = mapAssetUrls(content, () => "https://cdn/g.pdf", { uploaded: true });
    expect(kept).toBe(untouched);
    expect(mapped).toMatchObject({ filePath: "https://cdn/g.pdf", isLocal: false });

    const [, local] = mapAssetUrls(content, () => "~/.editor/resources/g.pdf", { uploaded: true });
    expect(local).toMatchObject({ isLocal: false });
    const [, relative] = mapAssetUrls(content, () => "assets/g.pdf");
    expect(relative).toMatchObject({ filePath: "assets/g.pdf", isLocal: true });
  });
});

describe("导出包", () => {
  beforeAll(() => vi.stubGlobal("Blob", NodeBlob));
  afterAll(() => vi.unstubAllGlobals());

  it("相对路径按所在目录回退", () => {
    expect(relativeBundlePath([], ["assets", "a.png"])).toBe("assets/a.png");
    expect(relativeBundlePath(["读书", "笔记"], ["assets", "a.png"])).toBe("../../assets/a.png");
    expect(relativeBundlePath(["读书"], ["读书", "子", "b.md"])).toBe("子/b.md");
    expect(encodeMarkdownPath("assets/my pic (1).png")).toBe("assets/my%20pic%20%281%29.png");
  });

  it("本机资源去重、同名改名、远程地址不入包、读取失败记警告", async () => {
    const io = fakeIo({
      "/home/me/x/a.png": new Uint8Array([1]),
      "/other/a.png": new Uint8Array([2]),
    });
    const assets = await collectBundleAssets(
      [
        doc(image("~/x/a.png"), image("https://cdn/r.png")),
        doc(image("~/x/a.png"), image("/other/a.png"), image("/missing.png")),
      ],
      { io }
    );
    expect([...assets.paths]).toEqual([
      ["~/x/a.png", "assets/a.png"],
      ["/other/a.png", "assets/a-2.png"],
    ]);
    expect(assets.files.map(file => file.path)).toEqual(["assets/a.png", "assets/a-2.png"]);
    expect(assets.warnings).toHaveLength(1);
    expect(assets.warnings[0]).toContain("/missing.png");
  });

  it("Markdown 中图片改为相对路径，包外链接降为标题文本", () => {
    const content = doc(
      image("~/x/a.png"),
      paragraph(text("见 "), contentLink(7, "另一篇"), text(" 和 "), contentLink(8, "外部"))
    );
    const markdown = toPortableMarkdown(content, {
      assets: new Map([["~/x/a.png", "assets/a.png"]]),
      dir: ["读书"],
      resolveLink: ref => (ref.id === 7 ? ["读书", "另一篇.md"] : null),
    });
    expect(markdown).toContain("![](../assets/a.png)");
    expect(markdown).toContain("[另一篇](另一篇.md)");
    expect(markdown).toContain("外部");
    expect(markdown).not.toContain(":content-link");
  });

  it("不修改原正文", () => {
    const content = doc(image("~/x/a.png"));
    localizeContent(content, { assets: new Map([["~/x/a.png", "assets/a.png"]]), dir: [] });
    expect((content[0] as unknown as { url: string }).url).toBe("~/x/a.png");
  });

  it("项目 ZIP 打包 assets/ 并把文档互链改为相对 .md", async () => {
    const { readBinaryFile } = await import("@/commands/file");
    const { resolveLocalMediaPath } = await import("@/utils/localMediaPath");
    vi.mocked(resolveLocalMediaPath).mockImplementation(async raw => raw);
    vi.mocked(readBinaryFile).mockResolvedValue(new Uint8Array([9]));

    const node = (
      id: number,
      title: string,
      content: unknown[],
      children: BatchExportTreeNode[] = []
    ) =>
      ({
        id,
        title,
        depth: 0,
        itemType: EProjectItemType.Document,
        exportable: true,
        content: content as Descendant[],
        children,
      }) as BatchExportTreeNode;
    const tree = [
      node(1, "assets", [paragraph(text("与资源目录同名"))]),
      node(
        2,
        "读书",
        [paragraph(text("目录"))],
        [node(3, "原则", [image("/pics/radar.png"), paragraph(contentLink(1, "assets"))])]
      ),
    ];

    const { bytes, warnings } = await buildMarkdownZipBytes(tree, new Set([1, 2, 3]));
    expect(warnings).toEqual([]);
    configureZip({ useWebWorkers: false });
    const reader = new ZipReader(new Uint8ArrayReader(bytes));
    const entries = await reader.getEntries();
    const byName = new Map(entries.map(entry => [entry.filename, entry]));
    expect([...byName.keys()].sort()).toEqual(
      ["assets-2.md", "assets/radar.png", "读书.md", "读书/原则.md"].sort()
    );
    const entry = byName.get("读书/原则.md");
    if (!entry || entry.directory) throw new Error("缺少 读书/原则.md");
    const principle = await entry.getData(new TextWriter());
    await reader.close();
    expect(principle).toContain("![](../assets/radar.png)");
    expect(principle).toContain("[assets](../assets-2.md)");
  });
});

describe("PDF 图片内联", () => {
  it("本机图片转 data URI，远程与读取失败的保留原地址", async () => {
    const io = fakeIo({ "/home/me/a.png": new Uint8Array([137, 80]) });
    const content = doc(image("~/a.png"), image("https://cdn/b.png"), image("/missing.png"));
    const result = await inlineLocalImages(content, io);
    const urls = result.content.map(node => (node as unknown as { url: string }).url);
    expect(urls[0]).toBe("data:image/png;base64,iVA=");
    expect(urls.slice(1)).toEqual(["https://cdn/b.png", "/missing.png"]);
    expect(result.warnings).toHaveLength(1);
  });
});

describe("导入资源入库", () => {
  const importIo = (files: Record<string, Uint8Array>, uploads: string[]): ImportIo => ({
    readTextFile: vi.fn(),
    getDirectoryName: vi.fn(),
    getFileBaseName: vi.fn(),
    getHomeDir: async () => "/home/me",
    resolvePathFrom: async (base, target) =>
      target.startsWith("/") ? target : `${base}/${target.replace(/^\.\//, "")}`,
    readBinaryFile: async path => {
      const bytes = files[path];
      if (!bytes) throw new Error("文件不存在");
      return bytes;
    },
    upload: async file => {
      uploads.push(file.name);
      return `~/.editor/resources/${file.name}`;
    },
  });

  it("相对路径以 .md 目录为基准，编码与 ~ 展开后上传，远程与 data URI 不动", async () => {
    const uploads: string[] = [];
    const io = importIo(
      {
        "/vault/notes/img/my pic.png": new Uint8Array([1]),
        "/home/me/b.png": new Uint8Array([2]),
      },
      uploads
    );
    const content = doc(
      image("./img/my%20pic.png"),
      image("~/b.png"),
      image("https://cdn/c.png"),
      image("data:image/png;base64,AA=="),
      image("img/missing.png")
    );
    const result = await ingestLocalAssets(content, "/vault/notes", io);
    expect(uploads).toEqual(["my pic.png", "b.png"]);
    expect(result.assetCount).toBe(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.content.map(node => (node as unknown as { url: string }).url)).toEqual([
      "~/.editor/resources/my pic.png",
      "~/.editor/resources/b.png",
      "https://cdn/c.png",
      "data:image/png;base64,AA==",
      "img/missing.png",
    ]);
  });
});
