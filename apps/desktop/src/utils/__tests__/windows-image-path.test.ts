import { win32, posix } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { paragraphCodec } from "@tau/editor/markdown";
import { mediaMarkdownCodecs } from "@tau/editor/extensions/media/markdown";
import { copyFileToLocal } from "../resouce";
import { resolveLocalMediaPath, toLocalMediaPreviewUrl } from "../localMediaPath";

const mocks = vi.hoisted(() => ({
  home: "C:\\Users\\Administrator",
  editor: "C:\\Users\\Administrator\\.editor",
  sep: "\\",
  writeBinaryFile: vi.fn(),
  readBinaryFile: vi.fn(),
  convertFileSrc: vi.fn(async (path: string) => `preview:${path}`),
}));

vi.mock("@/commands", () => ({
  getEditorDir: async () => mocks.editor,
  getHomeDir: async () => mocks.home,
  getSep: async () => mocks.sep,
  pathExists: async () => true,
  createDir: vi.fn(),
  writeBinaryFile: mocks.writeBinaryFile,
  generateCacheKey: async () => "han-cishi-timeline_2d52c36",
}));
vi.mock("@/commands/file", () => ({
  getEditorDir: async () => mocks.editor,
  getHomeDir: async () => mocks.home,
  getDirectoryName: async () => "C:\\notes",
  getFileExtension: async () => ".png",
  readBinaryFile: mocks.readBinaryFile,
  convertFileSrc: mocks.convertFileSrc,
}));
vi.mock("@/commands/extra", () => ({
  resolvePath: async (value: string) => (mocks.sep === "\\" ? win32 : posix).normalize(value),
}));

const processor = createMarkdownProcessor({ codecs: [paragraphCodec, ...mediaMarkdownCodecs] });
const imageName = "han-cishi-timeline_2d52c36.png";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.home = "C:\\Users\\Administrator";
  mocks.editor = `${mocks.home}\\.editor`;
  mocks.sep = "\\";
});

describe("Windows 本地图片引用", () => {
  it.each([
    ["C:\\Users\\Administrator", "\\"],
    ["C:/Users/Administrator", "\\"],
    ["/Users/test", "/"],
  ])("保存后经过 Markdown 仍能定位原文件：%s", async (home, sep) => {
    mocks.home = home;
    mocks.sep = sep;
    mocks.editor = `${home}${sep}.editor`;
    const bytes = new Uint8Array([1, 2, 3]);
    const file = { name: imageName, arrayBuffer: async () => bytes.buffer } as File;
    const reference = await copyFileToLocal(file);
    expect(reference).toBe(`~/.editor/resources/${imageName}`);
    const written = mocks.writeBinaryFile.mock.calls[0];
    expect(written[1]).toEqual(bytes);

    const markdown = processor.getMarkdown([
      { type: "image", url: reference, children: [{ type: "formatted", text: "" }] },
    ]);
    const [image] = processor.importFromMarkdown(markdown);
    if (image.type !== "image") throw new Error("Markdown 应还原为图片节点");
    const path = await resolveLocalMediaPath(image.url);
    const pathApi = sep === "\\" ? win32 : posix;
    expect(path).toBe(pathApi.normalize(written[0]));
    expect(await toLocalMediaPreviewUrl(path)).toEqual({
      url: `preview:${path}`,
      method: "app-protocol",
    });
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it.each([
    `~\\.editor\\resources\\${imageName}`,
    `~.editor\\resources\\${imageName}`,
    `~.editor/resources/${imageName}`,
    `~/.editor/resources/${imageName}`,
  ])("已有引用恢复到应用资源目录：%s", async reference => {
    const expected = `${mocks.editor}\\resources\\${imageName}`;
    expect(await resolveLocalMediaPath(reference)).toBe(expected);
    const [image] = processor.importFromMarkdown(`![图片](${reference})`);
    if (image.type !== "image") throw new Error("Markdown 应还原为图片节点");
    expect(await resolveLocalMediaPath(image.url)).toBe(expected);
  });

  it("用户目录末尾已有分隔符时仍能正确展开", async () => {
    mocks.home += "\\";
    expect(await resolveLocalMediaPath(`~.editor/resources/${imageName}`)).toBe(
      `${mocks.editor}\\resources\\${imageName}`
    );
  });

  it.each([
    "https://images.test/a.png?signature=%5C.foo",
    "data:image/png;base64,AQID",
    "blob:https://images.test/id",
    "http://localhost:24678/resources/a.png",
  ])("直接资源地址保持不变：%s", async reference => {
    expect(await resolveLocalMediaPath(reference)).toBe(reference);
  });
});
