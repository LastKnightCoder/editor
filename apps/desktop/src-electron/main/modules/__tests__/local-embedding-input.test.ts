import { describe, expect, it } from "vitest";
import {
  EMBED_WINDOW_TOKENS,
  averageNormalized,
  toEmbeddingWindows,
} from "../local-inference/embedding-input";
import { LOCAL_EMBEDDING_PIPELINE, buildEmbeddingFingerprint } from "../../utils/embedding-config";

describe("本地嵌入的输入整形", () => {
  it("每个窗口开头补 bos；已带 bos 的不重复补；bos 为 null 时不补", () => {
    expect(toEmbeddingWindows([5, 6, 7], 0)).toEqual([[0, 5, 6, 7]]);
    expect(toEmbeddingWindows([0, 5, 6], 0)).toEqual([[0, 5, 6]]);
    expect(toEmbeddingWindows([5, 6, 7], null)).toEqual([[5, 6, 7]]);
    expect(toEmbeddingWindows([], 0)).toEqual([]);
  });

  it("长输入按窗口切分，每段不超过窗口大小（另加 bos）", () => {
    const tokens = Array.from({ length: EMBED_WINDOW_TOKENS * 2 + 10 }, (_, i) => i + 1);
    const windows = toEmbeddingWindows(tokens, 0);
    expect(windows).toHaveLength(3);
    expect(windows.map(w => w.length)).toEqual([
      EMBED_WINDOW_TOKENS + 1,
      EMBED_WINDOW_TOKENS + 1,
      11,
    ]);
    expect(windows.flatMap(w => w.slice(1))).toEqual(tokens);
  });

  it("各段先归一化再平均，结果为单位向量，不被模长大的一段主导", () => {
    const merged = averageNormalized([
      [100, 0],
      [0, 1],
    ]);
    expect(merged[0]).toBeCloseTo(Math.SQRT1_2);
    expect(merged[1]).toBeCloseTo(Math.SQRT1_2);
    expect(averageNormalized([])).toEqual([]);
  });
});

describe("嵌入指纹的管线版本", () => {
  const base = {
    configId: "c",
    model: "bge-m3",
    dimensions: 1024,
    distance: 0.4,
    devicePolicy: "auto" as const,
  };

  it("本地配置带上管线版本，版本变化即指纹变化（触发全量重建）", () => {
    const local = { ...base, providerType: "local_python" as const, runtime: "llama" as const };
    const current = buildEmbeddingFingerprint({ ...local, pipeline: LOCAL_EMBEDDING_PIPELINE });
    expect(JSON.parse(current).pipeline).toBe(LOCAL_EMBEDDING_PIPELINE);
    expect(current).not.toBe(buildEmbeddingFingerprint(local));
  });

  it("远端配置的指纹不含管线版本，保持不变", () => {
    const remote = buildEmbeddingFingerprint({
      ...base,
      providerType: "remote_openai",
      baseUrl: "https://x",
    });
    expect(JSON.parse(remote)).not.toHaveProperty("pipeline");
  });
});
