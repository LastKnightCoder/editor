import { describe, expect, it, vi } from "vitest";
import type { ChatStreamCoreOptions } from "@/hooks/useChatLLM";
import {
  WebClipTaskRunner,
  type WebClipTaskRunnerDeps,
} from "../webClipTaskRunner";

vi.mock("@/hooks/useChatLLM", () => ({
  chatStreamCore: vi.fn(),
}));

const providerConfig = {
  id: "provider-1",
  name: "Provider",
  apiKey: "key",
  baseUrl: "https://example.test/v1",
  models: [],
};

const modelConfig = {
  name: "model-1",
  description: "Model",
  features: {
    online: false,
    thinking: true,
    image: false,
    video: false,
    audio: false,
    file: false,
  },
};

const createRunner = (overrides: Partial<WebClipTaskRunnerDeps> = {}) => {
  const saveWebClip = vi.fn(async () => ({
    webClipId: 11,
    contentId: 22,
  }));
  const chatStreamCore = vi.fn(async (options: ChatStreamCoreOptions) => {
    options.onUpdate?.("# 标题", "# 标题");
    options.onFinish?.("# 标题", "");
  });

  const runner = new WebClipTaskRunner({
    getLLMConfig: () => ({ providerConfig, modelConfig }),
    chatStreamCore,
    saveWebClip,
    ...overrides,
  });

  return { runner, chatStreamCore, saveWebClip };
};

const startParams = {
  projectItemId: 1,
  html: "<article>正文</article>",
  url: "https://example.test/post",
  title: "页面标题",
  translateToChinese: false,
};

const waitForAsyncWork = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("WebClipTaskRunner", () => {
  it("通过 chatStreamCore 推送进度并在完成后保存网页解析结果", async () => {
    const { runner, chatStreamCore, saveWebClip } = createRunner();
    const progress = vi.fn();
    const complete = vi.fn();
    runner.onProgress(progress);
    runner.onComplete(complete);

    await runner.start(startParams);
    await waitForAsyncWork();

    expect(chatStreamCore).toHaveBeenCalledWith(
      expect.objectContaining({
        providerConfig,
        modelConfig,
        enableTools: false,
        disableAnimation: true,
      }),
    );
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
    const { runner } = createRunner({
      chatStreamCore: vi.fn(async (options: ChatStreamCoreOptions) => {
        options.onUpdate?.("<think>先分析</think># 标题", "# 标题");
        options.onFinish?.("<think>先分析</think># 标题", "");
      }),
    });
    const progress = vi.fn();
    const complete = vi.fn();
    runner.onProgress(progress);
    runner.onComplete(complete);

    await runner.start(startParams);
    await waitForAsyncWork();

    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ markdown: "# 标题" }),
    );
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: "# 标题" }),
    );
  });

  it("同一 projectItemId 重复启动时会取消旧任务并以新任务为准", async () => {
    let firstController: AbortController | undefined;
    let releaseFirst!: () => void;
    const firstRun = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const chatStreamCore = vi
      .fn()
      .mockImplementationOnce(async (options: ChatStreamCoreOptions) => {
        const controller = new AbortController();
        firstController = controller;
        options.onController?.(controller);
        await firstRun;
      })
      .mockImplementationOnce(async (options: ChatStreamCoreOptions) => {
        options.onUpdate?.("# 新标题", "# 新标题");
        options.onFinish?.("# 新标题", "");
      });
    const { runner } = createRunner({ chatStreamCore });

    await runner.start(startParams);
    await Promise.resolve();
    await runner.start({ ...startParams, title: "新页面标题" });
    releaseFirst();
    await waitForAsyncWork();

    expect(firstController?.signal.aborted).toBe(true);
    expect(await runner.getStatus(1)).toEqual({
      projectItemId: 1,
      status: "completed",
      markdown: "# 新标题",
    });
  });

  it("取消订阅后任务仍可通过 getStatus 恢复进度", async () => {
    let releaseRun!: () => void;
    const running = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const { runner } = createRunner({
      chatStreamCore: vi.fn(async (options: ChatStreamCoreOptions) => {
        options.onUpdate?.("# 处理中", "# 处理中");
        await running;
        options.onFinish?.("# 处理中", "");
      }),
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
