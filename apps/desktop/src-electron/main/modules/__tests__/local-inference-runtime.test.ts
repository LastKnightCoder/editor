// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingRuntime } from "../local-inference/runtime";

const mocks = vi.hoisted(() => ({ getLlama: vi.fn(), loadModel: vi.fn(), cores: vi.fn(() => 12) }));
vi.mock("node-llama-cpp", () => ({ getLlama: mocks.getLlama }));
vi.mock("node:os", () => ({ availableParallelism: mocks.cores }));

function model(vector: number[]) {
  const context = {
    getEmbeddingFor: vi.fn(async () => ({ vector })),
    dispose: vi.fn(async () => {}),
  };
  return {
    context,
    tokens: { shouldPrependBosToken: true, bos: 0 },
    tokenize: vi.fn(() => Array.from({ length: 960 }, (_, i) => i + 1)),
    createEmbeddingContext: vi.fn(async () => context),
    dispose: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLlama.mockResolvedValue({ gpu: false, loadModel: mocks.loadModel });
});

describe("隔离进程中的嵌入运行时", () => {
  it("限制线程与上下文，保留补 BOS、480 token 分窗和归一化算法", async () => {
    const loaded = model([3, 4]);
    mocks.loadModel.mockResolvedValue(loaded);
    const runtime = new EmbeddingRuntime();
    const result = await runtime.embed(["长文本"], "a.gguf", "cpu");
    expect(mocks.getLlama).toHaveBeenCalledWith({ maxThreads: 4 });
    expect(loaded.createEmbeddingContext).toHaveBeenCalledWith({
      threads: 4,
      contextSize: 512,
      batchSize: 512,
    });
    expect(loaded.context.getEmbeddingFor).toHaveBeenCalledTimes(2);
    for (const call of loaded.context.getEmbeddingFor.mock.calls) {
      const tokens = (call as unknown as [number[]])[0];
      expect(tokens).toHaveLength(481);
      expect(tokens[0]).toBe(0);
    }
    expect(result.embeddings[0][0]).toBeCloseTo(0.6);
    expect(result.embeddings[0][1]).toBeCloseTo(0.8);
    await runtime.warmup("a.gguf", "cpu");
    expect(mocks.loadModel).toHaveBeenCalledOnce();
    expect(loaded.createEmbeddingContext).toHaveBeenCalledOnce();
  });

  it("切换模型必须等待旧 context 释放，并重置向量维度", async () => {
    const first = model([1, 0]);
    const second = model([1, 0, 0]);
    mocks.loadModel.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const runtime = new EmbeddingRuntime();
    await runtime.embed(["一"], "a.gguf", "cpu");
    let release!: () => void;
    first.context.dispose.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    const switched = runtime.embed(["二"], "b.gguf", "cpu");
    await vi.waitFor(() => expect(first.context.dispose).toHaveBeenCalledOnce());
    expect(first.dispose).not.toHaveBeenCalled();
    expect(mocks.loadModel).toHaveBeenCalledOnce();
    release();
    expect((await switched).dimensions).toBe(3);
    expect(first.dispose).toHaveBeenCalledOnce();
  });
});
