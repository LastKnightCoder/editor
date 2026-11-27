import { describe, expect, it, vi } from "vitest";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { PiChatOptions, PiChatHandle, PiChatResult } from "@/services/piLLM";
import { WebClipTaskRunner, type WebClipTaskRunnerDeps } from "../webClipTaskRunner";
import useSettingStore from "@/stores/useSettingStore";

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
  const chatStream = vi.fn(mock.fn);

  const runner = new WebClipTaskRunner({
    getLLMConfig: () => ({ provider, model }),
    chatStream,
    saveWebClip,
    ...overrides,
  });

  return { runner, chatStream, cancelSpy: mock.cancelSpy, saveWebClip };
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
    const databaseName = useSettingStore.getState().setting.database.active;
    const { runner, chatStream, saveWebClip } = createRunner();
    const progress = vi.fn();
    const complete = vi.fn();
    runner.onProgress(progress);
    runner.onComplete(complete);

    await runner.start(startParams);
    await waitForAsyncWork();

    expect(chatStream.mock.calls[0]?.[0].source?.feature).toBe("webClip");
    expect(progress).toHaveBeenCalledWith({
      databaseName,
      projectItemId: 1,
      markdown: "# 标题",
      delta: "# 标题",
    });
    expect(saveWebClip).toHaveBeenCalledWith({
      databaseName,
      projectItemId: 1,
      markdown: "# 标题",
      url: "https://example.test/post",
      title: "页面标题",
    });
    expect(complete).toHaveBeenCalledWith({
      databaseName,
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
  it("跨库同 ID 任务各自保存并在完成事件中保留发起库身份", async () => {
    const original = useSettingStore.getState().setting;
    const switchDatabase = (active: string) =>
      useSettingStore.setState(state => ({
        setting: { ...state.setting, database: { ...state.setting.database, active } },
      }));
    let release!: () => void;
    const first = createChatStreamMock(
      "A 的结果",
      "A",
      new Promise<void>(resolve => {
        release = resolve;
      })
    );
    const second = createChatStreamMock("B 的结果", "B");
    let invoked = false;
    const chatStream = vi.fn((...args: Parameters<typeof first.fn>) => {
      const selected = invoked ? second : first;
      invoked = true;
      return selected.fn(...args);
    });
    const save = vi.fn<WebClipTaskRunnerDeps["saveWebClip"]>(async () => ({
      webClipId: 11,
      contentId: 22,
    }));
    const runner = new WebClipTaskRunner({
      getLLMConfig: () => ({ provider, model }),
      chatStream,
      saveWebClip: save,
    });
    const complete = vi.fn();
    runner.onComplete(complete);
    try {
      switchDatabase("a.db");
      await runner.start(startParams);
      switchDatabase("b.db");
      await runner.start(startParams);
      await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
      release();
      await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
      expect(first.cancelSpy).not.toHaveBeenCalled();
      expect(save.mock.calls.map(call => call[0].databaseName)).toEqual(["b.db", "a.db"]);
      expect(complete.mock.calls.map(call => call[0].databaseName)).toEqual(["b.db", "a.db"]);
      expect((await runner.getStatus(1))?.markdown).toBe("B 的结果");
    } finally {
      useSettingStore.setState({ setting: original });
    }
  });
});
