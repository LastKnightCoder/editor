// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import localInference from "../local-inference";

const mocks = vi.hoisted(() => ({ request: vi.fn(), exists: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: () => "app-data" } }));
vi.mock("node:fs", () => ({ default: { existsSync: mocks.exists } }));
vi.mock("../local-inference/client", () => ({
  InferenceClient: class {
    request = mocks.request;
  },
}));
vi.mock("node-llama-cpp", () => {
  throw new Error("主进程不得加载原生推理模块");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exists.mockReturnValue(true);
});

describe("本地推理主进程入口", () => {
  it("逐条提交并按原顺序返回，交互优先级贯穿整批", async () => {
    let release!: (value: unknown) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    mocks.request.mockResolvedValueOnce({
      kind: "embed",
      value: { embeddings: [[0, 1]], dimensions: 2, device: "gpu" },
    });
    const result = localInference.embedTexts(["一", "二"], {
      modelName: "bge-m3",
      priority: "interactive",
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    release({ kind: "embed", value: { embeddings: [[1, 0]], dimensions: 2, device: "gpu" } });
    await expect(result).resolves.toEqual({
      embeddings: [
        [1, 0],
        [0, 1],
      ],
      dimensions: 2,
      device: "gpu",
    });
    expect(mocks.request.mock.calls.map(([input, priority]) => [input.text, priority])).toEqual([
      ["一", "interactive"],
      ["二", "interactive"],
    ]);
  });

  it("缺失模型和空批次不启动推理进程", async () => {
    await localInference.embedTexts([], { modelName: "bge-m3" });
    mocks.exists.mockReturnValue(false);
    expect(localInference.isEmbeddingModelReady({ modelName: "bge-m3" })).toBe(false);
    await expect(localInference.embedTexts(["一"], { modelName: "bge-m3" })).rejects.toThrow(
      "模型不存在"
    );
    await expect(localInference.embeddingHealth({ modelName: "bge-m3" })).resolves.toMatchObject({
      success: true,
      health: { loaded: false },
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("批次中途失败不返回部分向量，健康检查故障明确返回失败", async () => {
    mocks.request
      .mockResolvedValueOnce({
        kind: "embed",
        value: { embeddings: [[1, 0]], dimensions: 2, device: "cpu" },
      })
      .mockRejectedValue(new Error("进程退出"));
    await expect(localInference.embedTexts(["一", "二"], { modelName: "bge-m3" })).rejects.toThrow(
      "进程退出"
    );
    await expect(localInference.embeddingHealth({ modelName: "bge-m3" })).resolves.toMatchObject({
      success: false,
      health: { loaded: false },
      error: "进程退出",
    });
  });
});
