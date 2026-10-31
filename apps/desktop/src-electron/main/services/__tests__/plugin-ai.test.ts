import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { PLUGIN_AI_CAPABILITIES, PLUGIN_PERMISSIONS } from "@tau/plugins/package";
import type { PluginAICapability } from "@tau/plugins";
import type { ISetting } from "@/stores/useSettingStore";
import { PluginAIService, type PluginAIDeps } from "../plugin-ai";
import type { UsageRecordInput } from "../../modules/model-usage/recorder";

const request = {
  feature: "summary",
  messages: [{ role: "user" as const, content: "不能保存这段正文" }],
  maxOutputTokens: 20,
};
function fixture() {
  const disk = new Map<string, string>();
  const audits: UsageRecordInput[] = [];
  const deps: PluginAIDeps = {
    read: key => disk.get(key) ?? null,
    write: (key, value) => {
      disk.set(key, value);
    },
    hostModel: vi.fn(async () => ({ providerId: "app-provider", modelId: "app-flashcards" })),
    capacity: vi.fn(async () => ({ contextWindow: 100, maxTokens: 40 })),
    audit: initial => {
      audits.push(initial);
      return final => {
        audits[audits.indexOf(initial)] = final;
      };
    },
    execute: vi.fn(async (input, _signal, delta, record) => {
      delta("摘要");
      record({
        ...audits[audits.length - 1],
        ...input.source,
        status: "ok",
        usageKnown: true,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        errorMessage: null,
      });
      return { ok: true, text: "摘要" };
    }),
  };
  const service = new PluginAIService(deps);
  const session = service.register(1, "test.ai", "测试插件", [{ id: "summary", name: "摘要" }]);
  const config = {
    enabled: true,
    dailyRequests: 10,
    dailyTokens: 1000,
    concurrency: 2,
    assignments: { summary: { providerId: "provider", modelId: "model" } },
  };
  service.configure("test.ai", config);
  return { service, session, config, deps, disk, audits };
}

describe("插件 AI 主进程边界", () => {
  it("仅公开聊天与闪卡生成，且都对应应用已有模型分配", () => {
    expectTypeOf<PluginAICapability>().toEqualTypeOf<"chat" | "flashcardGeneration">();
    expectTypeOf<PluginAICapability>().toExtend<keyof ISetting["llmUsageSettings"]>();
    expect(Object.keys(PLUGIN_AI_CAPABILITIES)).toEqual(["chat", "flashcardGeneration"]);
    for (const name of Object.keys(PLUGIN_AI_CAPABILITIES))
      expect(PLUGIN_PERMISSIONS).toContain(`ai:${name}`);
  });

  it.each(["titleSummary", "contentInsights"])("内部能力 %s 不能注册宿主绑定", capability => {
    const { service, deps } = fixture();
    expect(() =>
      service.register(1, "test.internal", "内部能力插件", [], capability as never)
    ).toThrow("AI_UNDECLARED_FEATURE");
    expect(service.info("test.internal")).toBeNull();
    expect(deps.hostModel).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it.each(Object.keys(PLUGIN_AI_CAPABILITIES) as PluginAICapability[])(
    "宿主能力 %s 按对应应用分配执行并保留插件身份",
    async capability => {
      const { service, deps, audits } = fixture();
      const session = service.register(1, "test.capabilities", "能力插件", [], capability);
      await service.run(1, session, capability, { ...request, feature: capability }, vi.fn());
      expect(deps.hostModel).toHaveBeenCalledWith(capability);
      expect(audits[0]).toMatchObject({
        pluginId: "test.capabilities",
        pluginFeatureName: PLUGIN_AI_CAPABILITIES[capability].name,
      });
    }
  );

  it("聊天按受控图片载荷执行，图片不进入审计", async () => {
    const { service, deps, audits } = fixture();
    const session = service.register(1, "images.capability", "图片插件", [], "chat");
    const image = { mimeType: "image/png" as const, data: "aW1hZ2UtcHJpdmF0ZQ==" };
    await service.run(
      1,
      session,
      "image",
      {
        feature: "chat",
        messages: [{ role: "user", content: "描述图片", images: [image] }],
      },
      vi.fn()
    );
    expect(deps.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "描述图片", images: [image] }],
      }),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function)
    );
    expect(JSON.stringify(audits)).not.toContain(image.data);
    await expect(
      service.run(
        1,
        session,
        "invalid-image",
        {
          feature: "chat",
          messages: [
            {
              role: "user",
              content: "",
              images: [{ ...image, data: "data:image/png;base64,AA==" }],
            },
          ],
        },
        vi.fn()
      )
    ).rejects.toThrow("AI_INVALID_REQUEST");
    expect(deps.execute).toHaveBeenCalledOnce();
  });
  it("宿主闪卡使用应用功能分配，无需作者声明或另配模型，额度和审计仍按插件归属", async () => {
    const { service, deps, audits } = fixture();
    const session = service.register(1, "native.cards", "制卡插件", [], "flashcardGeneration");
    const info = service.info("native.cards");
    if (!info) throw new Error("插件 AI 未登记");
    expect(info.features).toEqual([]);
    expect(info.config.enabled).toBe(false);
    expect(info.config.assignments).toEqual({});
    service.configure(info.id, { ...info.config, dailyRequests: 1 });
    const input = { ...request, feature: "flashcardGeneration" };
    await service.run(1, session, "native-1", input, vi.fn());
    expect(deps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "app-provider", modelId: "app-flashcards" }),
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Function)
    );
    expect(audits[0]).toMatchObject({ pluginId: "native.cards", pluginFeatureName: "闪卡制作" });
    await expect(service.run(1, session, "native-2", input, vi.fn())).rejects.toThrow(
      "AI_QUOTA_EXCEEDED"
    );
  });

  it("宿主能力不覆盖插件自定义模型，应用模型未配置或身份不匹配时拒绝", async () => {
    const { service, deps, config } = fixture();
    const session = service.register(1, "test.ai", "测试插件", [], "flashcardGeneration");
    expect(service.info("test.ai")?.features).toEqual([{ id: "summary", name: "摘要" }]);
    expect(service.info("test.ai")?.config.assignments).toEqual(config.assignments);
    deps.hostModel = async () => null;
    await expect(
      service.run(1, session, "1", { ...request, feature: "flashcardGeneration" }, vi.fn())
    ).rejects.toThrow("应用设置中分配闪卡制作模型");
    await expect(
      service.run(2, session, "2", { ...request, feature: "flashcardGeneration" }, vi.fn())
    ).rejects.toThrow("AI_DISABLED");
    await expect(service.run(1, session, "3", request, vi.fn())).rejects.toThrow(
      "AI_UNDECLARED_FEATURE"
    );
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("等待模型容量时应用分配变化，不继续使用旧模型", async () => {
    const { service, deps } = fixture();
    const session = service.register(1, "native.cards", "制卡插件", [], "flashcardGeneration");
    deps.capacity = async () => {
      deps.hostModel = async () => ({ providerId: "new", modelId: "new" });
      return { contextWindow: 100, maxTokens: 40 };
    };
    await expect(
      service.run(1, session, "changed", { ...request, feature: "flashcardGeneration" }, vi.fn())
    ).rejects.toThrow("AI_CONFIG_CHANGED");
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("读取宿主模型分配期间取消也能命中请求，不启动模型", async () => {
    const { service, deps } = fixture();
    const session = service.register(1, "native.cards", "制卡插件", [], "flashcardGeneration");
    let resolveModel!: (model: { providerId: string; modelId: string }) => void;
    deps.hostModel = () =>
      new Promise(resolve => {
        resolveModel = resolve;
      });
    const pending = service.run(
      1,
      session,
      "early",
      { ...request, feature: "flashcardGeneration" },
      vi.fn()
    );
    const rejected = expect(pending).rejects.toThrow("AI_ABORTED");
    service.cancelOwn(1, session, "early");
    resolveModel({ providerId: "app-provider", modelId: "app-flashcards" });
    await rejected;
    expect(deps.execute).not.toHaveBeenCalled();
  });
  it("默认关闭、拒绝未声明功能与跨窗口身份，不执行模型", async () => {
    const { service, deps } = fixture();
    const session = service.register(2, "other.ai", "其他", [{ id: "summary", name: "摘要" }]);
    await expect(service.run(2, session, "1", request, vi.fn())).rejects.toThrow("AI_DISABLED");
    await expect(service.run(1, session, "2", request, vi.fn())).rejects.toThrow("AI_DISABLED");
    await expect(
      service.run(2, session, "3", { ...request, feature: "secret" }, vi.fn())
    ).rejects.toThrow("AI_UNDECLARED_FEATURE");
    expect(deps.execute).not.toHaveBeenCalled();
  });
  it("宿主归属审计，不保存正文；已知用量释放预占", async () => {
    const { service, session, audits, disk } = fixture();
    const result = await service.run(1, session, "1", request, vi.fn());
    expect(result).toEqual({
      text: "摘要",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    expect(audits[0]).toMatchObject({
      pluginId: "test.ai",
      pluginName: "测试插件",
      pluginFeatureName: "摘要",
      status: "ok",
    });
    expect(JSON.stringify(audits)).not.toContain("不能保存这段正文");
    const quota = [...disk.entries()].find(([key]) => key.includes(":quota:"))!;
    expect(JSON.parse(quota[1])).toMatchObject({ requests: 1, tokens: 15 });
  });
  it("多窗口并发预占相同额度，重启服务不能重置已消费额度", async () => {
    const { service, session, deps, config } = fixture();
    service.configure("test.ai", { ...config, dailyTokens: 120 });
    let finish!: () => void;
    deps.execute = vi.fn(
      () =>
        new Promise<{ ok: boolean; text: string; error?: string }>(resolve => {
          finish = () => resolve({ ok: true, text: "" });
        })
    );
    const running = service.run(1, session, "1", request, vi.fn());
    await vi.waitFor(() => expect(deps.execute).toHaveBeenCalledOnce());
    const second = service.register(2, "test.ai", "测试插件", [{ id: "summary", name: "摘要" }]);
    await expect(service.run(2, second, "2", request, vi.fn())).rejects.toThrow(
      "AI_QUOTA_EXCEEDED"
    );
    finish();
    expect((await running).usage).toBeNull();
    const restarted = new PluginAIService(deps);
    const next = restarted.register(1, "test.ai", "测试插件", [{ id: "summary", name: "摘要" }]);
    await expect(restarted.run(1, next, "3", request, vi.fn())).rejects.toThrow(
      "AI_QUOTA_EXCEEDED"
    );
  });
  it.each(["revoke", "unregister", "releaseOwner", "cancel"] as const)(
    "%s 中止运行中的调用",
    async action => {
      const { service, session, deps, audits } = fixture();
      deps.execute = vi.fn(
        (_request, signal) =>
          new Promise<{ ok: boolean; text: string; error?: string }>(resolve => {
            signal.addEventListener(
              "abort",
              () => resolve({ ok: false, text: "", error: "cancel" }),
              { once: true }
            );
          })
      );
      const running = service.run(1, session, "1", request, vi.fn());
      const failure = expect(running).rejects.toThrow("AI_ABORTED");
      await vi.waitFor(() => expect(deps.execute).toHaveBeenCalledOnce());
      if (action === "revoke") service.revoke("test.ai");
      if (action === "unregister") service.unregister(1, session);
      if (action === "releaseOwner") service.releaseOwner(1);
      if (action === "cancel") service.cancel("1");
      await failure;
      expect(service.running()).toEqual([]);
      expect(audits[0]).toMatchObject({ status: "aborted", usageKnown: false });
    }
  );
  it("模型准备阶段也能取消，不能在取消后发起收费请求", async () => {
    const { service, session, deps } = fixture();
    let ready!: () => void;
    deps.capacity = () =>
      new Promise(resolve => {
        ready = () => resolve({ contextWindow: 100, maxTokens: 40 });
      });
    const pending = service.run(1, session, "1", request, vi.fn());
    const failure = expect(pending).rejects.toThrow("AI_ABORTED");
    await vi.waitFor(() => expect(ready).toBeTypeOf("function"));
    service.cancelOwn(1, session, "1");
    ready();
    await failure;
    expect(deps.execute).not.toHaveBeenCalled();
    expect(service.running()).toEqual([]);
  });
  it("审计写入失败时不得请求供应商", async () => {
    const { service, session, deps } = fixture();
    deps.audit = () => {
      throw new Error("disk full");
    };
    await expect(service.run(1, session, "1", request, vi.fn())).rejects.toThrow("disk full");
    expect(deps.execute).not.toHaveBeenCalled();
    expect(service.running()).toEqual([]);
  });
});
