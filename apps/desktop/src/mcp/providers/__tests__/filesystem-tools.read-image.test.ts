import { beforeEach, describe, expect, it, vi } from "vitest";
import { filesystemToolsProvider } from "../filesystem-tools";

vi.mock("@/utils/localMediaPath", () => ({
  resolveLocalMediaPath: vi.fn(async (path: string) => path),
}));

vi.mock("@/commands/file", () => ({
  getFileExtension: vi.fn(async () => "png"),
  getHomeDir: vi.fn(async () => "C:/Users/test"),
  readBinaryFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
  readTextFile: vi.fn(async () => "text"),
}));

vi.mock("@/commands/extra", () => ({
  nodeFetch: vi.fn(),
}));

const getReadImageTool = () => {
  const tool = filesystemToolsProvider
    .tools()
    .find((item) => item.name === "read_image");
  if (!tool) {
    throw new Error("read_image tool not found");
  }
  return tool;
};

describe("filesystem read_image tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("直接读取 data URL 并返回 modelContent 图片块", async () => {
    const tool = getReadImageTool();
    const result = await tool.executor({
      path: "data:image/png;base64,AQID",
    });

    expect(typeof result).toBe("object");
    expect((result as any).modelContent).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "image", image: "data:image/png;base64,AQID" },
    ]);
    expect(JSON.parse((result as any).content)).toMatchObject({
      success: true,
      mimeType: "image/png",
    });
  });

  it("读取本地图片并编码为 data URL", async () => {
    const tool = getReadImageTool();
    const result = await tool.executor({ path: "C:/tmp/image.png" });

    expect((result as any).modelContent[1]).toEqual({
      type: "image",
      image: "data:image/png;base64,AQID",
    });
  });

  it("空路径返回参数错误", async () => {
    const tool = getReadImageTool();
    const result = await tool.executor({ path: "" });

    expect((result as any).isParameterError).toBe(true);
    expect(JSON.parse((result as any).content)).toMatchObject({
      success: false,
    });
  });
});
