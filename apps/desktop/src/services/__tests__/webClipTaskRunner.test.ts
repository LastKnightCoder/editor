import { describe, expect, it, vi } from "vitest";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { PiChatOptions, PiChatHandle, PiChatResult } from "@/services/piLLM";
import { WebClipTaskRunner, type WebClipTaskRunnerDeps } from "../webClipTaskRunner";

const provider: import("@/types/pi-llm").LLMProviderSetting = {
  id: "provider-1",
  name: "Provider",
  apiKey: "key",
  baseUrl: "https://example.test/v1",
  api: "openai-completions",
  models: [],
};

const model: import("@/types/pi-llm").LLMModelSetting = {
  id: "model-1",
  reasoning: true,
  input: ["text"],
  contextWindow: 65536,
  maxTokens: 4096,
};

/** 构造 pi 原生 text_delta 事件（partial 为全量累计快照） */
const textDeltaEvent = (full: string, delta: string): AssistantMessageEvent =>
  ({
    type: "text_delta",
    contentIndex: 0,
    delta,
    partial: { role: "assistant", content: [{ type: "text", text: full }] },
  }) as unknown as AssistantMessageEvent;

interface MockChatStream {
  fn: (options: PiChatOptions, onEvent?: (event: AssistantMessageEvent) => void) => PiChatHandle;
  cancelSpy: ReturnType<typeof vi.fn>;
}

/** mock piStreamChat：立即派发事件，result 按传入文本 resolve；cancel 记入 spy */
const createChatStreamMock = (
  full: string,
  delta: string,
  pending?: Promise<void>
): MockChatStream => {
  const cancelSpy = vi.fn();
  const fn = (_options: PiChatOptions, onEvent?: (event: AssistantMessageEvent) => void) => {
    onEvent?.(textDeltaEvent(full, delta));
    const result = (async (): Promise<PiChatResult> => {
      if (pending) await pending;
      return {
        ok: true,
        aborted: false,
        text: full,
        reasoning: "",
        message: null,
      };
    })();
    return { result, cancel: cancelSpy };
  };
  return { fn, cancelSpy };
};

const createRunner = (overrides: Partial<WebClipTaskRunnerDeps> = {}) => {
  const saveWebClip = vi.fn(async () => ({
    webClipId: 11,
    contentId: 22,
  }));
  const mock = createChatStreamMock("# 标题", "# 标题");

  const runner = new WebClipTaskRunner({
    getLLMConfig: () => ({ provider, model }),
    chatStream: mock.fn,
    saveWebClip,
    ...overrides,
  });

  return { runner, chatStream: mock.fn, cancelSpy: mock.cancelSpy, saveWebClip };
};

const startParams = {
  projectItemId: 1,
  html: "<article>正文</article>",
  url: "https://example.test/post",
  title: "页面标题",
  translateToChinese: false,
};

const waitForAsyncWork = () =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
  });

describe("WebClipTaskRunner", () => {
  it("通过 pi 流事件推送进度并在完成后保存网页解析结果", async () => {
    const { runner, saveWebClip } = createRunner();
    const progress = vi.fn();
    const complete = vi.fn();
    runner.onProgress(progress);
    runner.onComplete(complete);

    await runner.start(startParams);
    await waitForAsyncWork();

    expect(progress).toHaveBeenCalledWith({
      projectItemId: 1,
      markdown: "# 标题",
      delta: "# 标题",
    });
    expect(saveWebClip).toHaveBeenCalledWith({
      projectItemId: 1,
      markdown: "# 标题",
      url: "https://example.test/post",
      title: "页面标题",
    });
    expect(complete).toHaveBeenCalledWith({
      projectItemId: 1,
      markdown: "# 标题",
      url: "https://example.test/post",
      title: "页面标题",
      webClipId: 11,
      contentId: 22,
    });
  });

  it("不会把 think 标签和思考内容写入 markdown", async () => {
    const mock = createChatStreamMock("<think>先分析</think># 标题", "# 标题");
    const runner = new WebClipTaskRunner({
      getLLMConfig: () => ({ provider, model }),
      chatStream: mock.fn,
      saveWebClip: vi.fn(async () => ({ webClipId: 11, contentId: 22 })),
    });
    const progress = vi.fn();
    const complete = vi.fn();
    runner.onProgress(progress);
    runner.onComplete(complete);

    await runner.start(startParams);
    await waitForAsyncWork();

    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ markdown: "# 标题" }));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ markdown: "# 标题" }));
  });

  it("同一 projectItemId 重复启动时会取消旧任务并以新任务为准", async () => {
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const first = createChatStreamMock("# 旧标题", "# 旧标题", firstPending);
    const second = createChatStreamMock("# 新标题", "# 新标题");

    let callCount = 0;
    const chatStream = vi.fn((...args: Parameters<typeof first.fn>) => {
      callCount += 1;
      return callCount === 1 ? first.fn(...args) : second.fn(...args);
    });

    const runner = new WebClipTaskRunner({
      getLLMConfig: () => ({ provider, model }),
      chatStream,
      saveWebClip: vi.fn(async () => ({ webClipId: 11, contentId: 22 })),
    });

    await runner.start(startParams);
    await Promise.resolve();
    await runner.start({ ...startParams, title: "新页面标题" });
    releaseFirst();
    await waitForAsyncWork();

    expect(first.cancelSpy).toHaveBeenCalled();
    expect(await runner.getStatus(1)).toEqual({
      projectItemId: 1,
      status: "completed",
      markdown: "# 新标题",
    });
  });

  it("取消订阅后任务仍可通过 getStatus 恢复进度", async () => {
    let releaseRun!: () => void;
    const pending = new Promise<void>(resolve => {
      releaseRun = resolve;
    });
    const mock = createChatStreamMock("# 处理中", "# 处理中", pending);
    const runner = new WebClipTaskRunner({
      getLLMConfig: () => ({ provider, model }),
      chatStream: mock.fn,
      saveWebClip: vi.fn(async () => ({ webClipId: 11, contentId: 22 })),
    });
    const progress = vi.fn();
    const unsubscribe = runner.onProgress(progress);

    await runner.start(startParams);
    await Promise.resolve();
    unsubscribe();

    expect(await runner.getStatus(1)).toEqual({
      projectItemId: 1,
      status: "processing",
      markdown: "# 处理中",
    });

    releaseRun();
    await waitForAsyncWork();
  });
});
