import { describe, expect, it, vi } from "vitest";
import { shouldReusePdfIndex } from "../pdf-index-reuse";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => "/tmp"),
  },
}));

const mockFns = vi.hoisted(() => ({
  onDatabaseChange: vi.fn(),
  getCurrentDatabaseName: vi.fn(() => "alpha.db"),
  closeAllForMainDB: vi.fn(),
}));

vi.mock("../database", () => ({
  default: {
    onDatabaseChange: mockFns.onDatabaseChange,
    getCurrentDatabaseName: mockFns.getCurrentDatabaseName,
    getDatabase: vi.fn(),
  },
}));

vi.mock("../user-setting", () => ({
  default: {
    getSettingSnapshot: vi.fn(),
  },
}));

vi.mock("../python-service", () => ({
  default: {
    ensureStarted: vi.fn(),
  },
}));

vi.mock("../pdf-index-db", () => ({
  default: {
    closeAllForMainDB: mockFns.closeAllForMainDB,
  },
}));

vi.mock("./../search-core/pipeline", () => ({
  runSearchPipeline: vi.fn(),
}));

vi.mock("./../search-core/pdf-search-adapter", () => ({
  createPdfSearchAdapter: vi.fn(),
}));

vi.mock("./../search-core/expander", () => ({
  NoopExpander: vi.fn(),
}));

vi.mock("./../search-core/reranker", () => ({
  NoopReranker: vi.fn(),
}));

vi.mock("../tables/pdf", () => ({
  default: {
    getPdfById: vi.fn(),
  },
}));

import pdfIndexQueue from "../pdf-index-queue";

describe("shouldReusePdfIndex", () => {
  it("数据库切换时关闭上一个主库的 PDF sidecar 连接", async () => {
    mockFns.onDatabaseChange.mockClear();
    mockFns.closeAllForMainDB.mockClear();
    mockFns.getCurrentDatabaseName.mockReturnValue("alpha.db");

    await pdfIndexQueue.init();

    const changeHandler = mockFns.onDatabaseChange.mock.calls.at(-1)?.[0] as
      | ((dbName: string) => void)
      | undefined;
    expect(changeHandler).toBeTypeOf("function");

    changeHandler?.("beta.db");

    expect(mockFns.closeAllForMainDB).toHaveBeenCalledWith("alpha.db");
  });

  it("文件与 embedding 指纹都一致时复用索引", () => {
    expect(
      shouldReusePdfIndex({
        currentState: "ready",
        currentFingerprint: "pdf-fingerprint",
        nextFingerprint: "pdf-fingerprint",
        currentEmbeddingFingerprint: "embed-a",
        nextEmbeddingFingerprint: "embed-a",
      }),
    ).toBe(true);
  });

  it("embedding 指纹变化时不复用索引", () => {
    expect(
      shouldReusePdfIndex({
        currentState: "ready",
        currentFingerprint: "pdf-fingerprint",
        nextFingerprint: "pdf-fingerprint",
        currentEmbeddingFingerprint: "embed-a",
        nextEmbeddingFingerprint: "embed-b",
      }),
    ).toBe(false);
  });

  it("从向量索引切回纯 FTS 时不复用索引", () => {
    expect(
      shouldReusePdfIndex({
        currentState: "ready",
        currentFingerprint: "pdf-fingerprint",
        nextFingerprint: "pdf-fingerprint",
        currentEmbeddingFingerprint: "embed-a",
        nextEmbeddingFingerprint: null,
      }),
    ).toBe(false);
  });

  it("可以解析带代码块包裹的 LLM JSON 响应", () => {
    const parsed = (pdfIndexQueue as any).parseJsonLikeResponse(`
\`\`\`json
{
  "overview": "测试摘要",
  "mainPoints": ["要点一", "要点二"]
}
\`\`\`
`);

    expect((parsed as { overview: string }).overview).toBe("测试摘要");
    expect((parsed as { mainPoints: string[] }).mainPoints).toEqual([
      "要点一",
      "要点二",
    ]);
  });

  it("LLM 章节摘要缺字段时回退 baseline", () => {
    const baseline = {
      sectionId: "section-1",
      overview: "baseline-overview",
      mainPoints: ["baseline-point"],
      arguments: ["baseline-argument"],
      evidence: ["baseline-evidence"],
      conclusions: ["baseline-conclusion"],
      terms: ["baseline-term"],
      questions: ["baseline-question"],
      summarySource: "extractive",
      status: "ready",
    };

    const normalized = (pdfIndexQueue as any).normalizeSectionSummaryFromLLM(
      {
        overview: "llm-overview",
        mainPoints: ["llm-point"],
      },
      baseline,
    );

    expect(normalized.overview).toBe("llm-overview");
    expect(normalized.mainPoints).toEqual(["llm-point"]);
    expect(normalized.arguments).toEqual(["baseline-argument"]);
    expect(normalized.evidence).toEqual(["baseline-evidence"]);
  });
});
