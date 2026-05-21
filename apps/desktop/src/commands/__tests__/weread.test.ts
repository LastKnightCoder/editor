import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/electron", () => ({
  invoke: mockContext.invoke,
}));

const loadWereadCommands = async () => {
  vi.resetModules();
  return import("../weread");
};

describe("commands/weread", () => {
  beforeEach(() => {
    mockContext.invoke.mockReset();
  });

  it("首次读取笔记本时应先初始化 weread 模块", async () => {
    mockContext.invoke
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce([]);

    const { getAllWeReadNotebooks } = await loadWereadCommands();

    await expect(getAllWeReadNotebooks()).resolves.toEqual([]);

    expect(mockContext.invoke).toHaveBeenNthCalledWith(
      1,
      "module-init:init-module",
      "weread",
    );
    expect(mockContext.invoke).toHaveBeenNthCalledWith(
      2,
      "weread:get-all-notebooks",
    );
  });

  it("初始化失败后下次调用应重新尝试初始化", async () => {
    mockContext.invoke
      .mockResolvedValueOnce({ success: false, error: "初始化失败" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce([]);

    const { getAllWeReadNotebooks } = await loadWereadCommands();

    await expect(getAllWeReadNotebooks()).rejects.toThrow("初始化失败");
    await expect(getAllWeReadNotebooks()).resolves.toEqual([]);

    expect(
      mockContext.invoke.mock.calls.filter(
        ([channel]) => channel === "module-init:init-module",
      ),
    ).toHaveLength(2);
  });
});
