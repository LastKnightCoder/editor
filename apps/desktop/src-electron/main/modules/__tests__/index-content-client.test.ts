import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../services/content-execution", () => ({
  contentExecutor: { execute: mocks.execute },
}));
import { IndexContentClient } from "../index-content-client";

const input = { raw: "[]", title: "", whole: false, sections: true };
beforeEach(() => {
  mocks.execute.mockReset();
});

describe("正文转换会话生命周期", () => {
  it("按需调用内容服务，逐篇复用取消作用域", async () => {
    const client = new IndexContentClient();
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.execute.mockResolvedValueOnce({ content: "甲" }).mockResolvedValueOnce({ content: "乙" });
    const first = client.prepare(input);
    expect(await first).toEqual({ content: "甲" });
    const second = client.prepare(input);
    expect(await second).toEqual({ content: "乙" });
    expect(mocks.execute.mock.calls[0][1]).toBe(mocks.execute.mock.calls[1][1]);
    await client.dispose();
    expect(mocks.execute.mock.calls[0][1].aborted).toBe(true);
  });

  it("释放会话取消在途请求，后续请求不悬挂", async () => {
    const client = new IndexContentClient();
    mocks.execute.mockImplementation(
      (_request, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("已结束")), { once: true })
        )
    );
    const result = client.prepare(input);
    const rejected = expect(result).rejects.toThrow("结束");
    await client.dispose();
    await rejected;
    await expect(client.prepare(input)).rejects.toThrow("结束");
  });

  it("转换失败不丢失错误，并允许下一篇请求", async () => {
    const client = new IndexContentClient();
    mocks.execute
      .mockRejectedValueOnce(new Error("非法正文"))
      .mockResolvedValueOnce({ content: "" });
    const result = client.prepare(input);
    await expect(result).rejects.toThrow("非法正文");
    const next = client.prepare(input);
    await expect(next).resolves.toEqual({ content: "" });
    await client.dispose();
  });
});
