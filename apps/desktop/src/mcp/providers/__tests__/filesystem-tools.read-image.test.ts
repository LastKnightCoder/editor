import { beforeEach, describe, expect, it, vi } from "vitest";
import { filesystemToolsProvider } from "../filesystem-tools";

vi.mock("@/commands/extra", () => ({
  nodeFetch: vi.fn(),
}));

const getReadImageTool = () => {
  const tool = filesystemToolsProvider.tools().find(item => item.name === "read_image");
  if (!tool) {
    throw new Error("read_image tool not found");
  }
  return tool;
};

describe("filesystem read_image tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provider 只提供 read_image（read_file 已由 pi 内置 read 取代）", () => {
    const names = filesystemToolsProvider.tools().map(tool => tool.name);
    expect(names).toEqual(["read_image"]);
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

  it("本地路径返回参数错误并引导使用 read 工具", async () => {
    const tool = getReadImageTool();
    const result = await tool.executor({ path: "C:/tmp/image.png" });

    expect((result as any).isParameterError).toBe(true);
    expect(JSON.parse((result as any).content)).toMatchObject({
      success: false,
    });
    expect((result as any).content).toContain("read");
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
