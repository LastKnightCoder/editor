import { afterEach, expect, it, vi } from "vitest";
import { AiSkillRegistry, type AiSkillSource } from "@tau/ai/skills";
import { createMobilePluginAiSkills, type MobileAiSkillPackage } from "./ai-skills";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
afterEach(() => vi.resetAllMocks());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
const initial = {
  id: "example.skill",
  kind: "plugin" as const,
  version: "1.0.0",
  skillRevision: "installed-1",
};
const description = (revision = "installed-1") => [
  {
    kind: "plugin",
    pluginId: "example.skill",
    pluginName: "技能示例",
    version: "1.0.0",
    revision,
    entries: [{ id: "summary", path: "skills/summary/SKILL.md" }],
  },
];
const document = (body = "先读取卡片，再整理行动项。") =>
  `---\nname: summary\ndescription: 整理卡片\n---\n${body}`;
const encoded = (text: string, offset: number) => {
  const bytes = new TextEncoder().encode(text);
  const end = offset === 0 ? Math.min(2, bytes.length) : bytes.length;
  return {
    data: btoa(String.fromCharCode(...bytes.slice(offset, end))),
    nextOffset: end,
    eof: end === bytes.length,
  };
};
function harness(register?: (source: AiSkillSource) => Promise<() => void> | (() => void)) {
  let active: MobileAiSkillPackage[] = [initial];
  const listeners = new Set<() => void>();
  const registry = new AiSkillRegistry();
  const sources: AiSkillSource[] = [];
  const onError = vi.fn();
  const registerSource = vi.fn((source: AiSkillSource) => {
    sources.push(source);
    return register ? register(source) : registry.registerSource(source);
  });
  const adapter = createMobilePluginAiSkills("fixture.db", "workspace-token", {
    getActivePackages: () => active,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerSource,
    onError,
  });
  return {
    adapter,
    registry,
    sources,
    onError,
    registerSource,
    setActive(values: MobileAiSkillPackage[]) {
      active = values;
      for (const listener of listeners) listener();
    },
  };
}
function defaultNative() {
  invoke.mockImplementation(async (command, args) => {
    expect(args.database).toBe("fixture.db");
    expect(args.token).toBe("workspace-token");
    if (command === "plugin_ai_skill_sources") return description();
    if (command === "plugin_ai_skill_read")
      return encoded(args.path.endsWith("SKILL.md") ? document() : "中文参考资料", args.offset);
    throw new Error(`未预期的命令：${command}`);
  });
}

it("仅向活动安装代次注册技能，真实registry能读说明和分块UTF8参考资料", async () => {
  defaultNative();
  const host = harness();
  await host.adapter.refresh();
  expect(host.registerSource).toHaveBeenCalledTimes(1);
  const skills = await host.registry.list();
  expect(skills.map(skill => skill.id)).toEqual(["example.skill:summary"]);
  expect((await host.registry.load("example.skill:summary")).instructions).toBe(
    "先读取卡片，再整理行动项。"
  );
  expect(await host.registry.readResource("example.skill:summary", "references/guide.md")).toBe(
    "中文参考资料"
  );
  expect(invoke).toHaveBeenCalledWith(
    "plugin_ai_skill_read",
    expect.objectContaining({
      pluginId: "example.skill",
      revision: "installed-1",
      path: "skills/summary/references/guide.md",
      offset: 2,
    })
  );
  await host.adapter.dispose();
  expect(await host.registry.list()).toEqual([]);
});

it("没有活动插件时不查询原生目录、不加载AI来源", async () => {
  const host = harness();
  host.setActive([]);
  await host.adapter.refresh();
  expect(invoke).not.toHaveBeenCalled();
  expect(host.registerSource).not.toHaveBeenCalled();
  await host.adapter.dispose();
});

it("停用立即撤销快照，并拒绝在途读取的迟到结果", async () => {
  defaultNative();
  const host = harness();
  await host.adapter.refresh();
  const snapshot = await host.registry.captureAvailable();
  const pending = deferred<ReturnType<typeof encoded>>();
  const entered = deferred<void>();
  invoke.mockImplementation(async (command, args) => {
    if (command === "plugin_ai_skill_sources") return description();
    if (args.path.endsWith("SKILL.md")) return encoded(document(), args.offset);
    entered.resolve();
    return pending.promise;
  });
  const read = snapshot.readResource("example.skill:summary", "references/guide.md");
  await entered.promise;
  host.setActive([]);
  expect(snapshot.isCurrent()).toBe(false);
  await expect(read).rejects.toMatchObject({ code: "AI_SKILL_UNAVAILABLE" });
  pending.resolve(encoded("不应进入模型的旧资料", 0));
  await host.adapter.dispose();
  await expect(host.sources[0].read("skills/summary/SKILL.md")).rejects.toMatchObject({
    code: "AI_SKILL_UNAVAILABLE",
  });
});

it("同版本新安装代次不能复用旧来源和旧快照", async () => {
  defaultNative();
  const host = harness();
  await host.adapter.refresh();
  const old = await host.registry.captureAvailable();
  invoke.mockImplementation(async (command, args) =>
    command === "plugin_ai_skill_sources"
      ? description("installed-2")
      : encoded(document("新的说明"), args.offset)
  );
  host.setActive([{ ...initial, skillRevision: "installed-2" }]);
  await host.adapter.refresh();
  expect(old.isCurrent()).toBe(false);
  expect((await host.registry.load("example.skill:summary")).instructions).toBe("新的说明");
  await expect(old.load("example.skill:summary")).rejects.toMatchObject({
    code: "AI_SKILL_UNAVAILABLE",
  });
  await host.adapter.dispose();
});

it("同ID版本和revision发生包类型转换时，旧来源立即失效", async () => {
  defaultNative();
  const host = harness();
  await host.adapter.refresh();
  const previous = await host.registry.captureAvailable();
  const source = host.sources[0];
  host.setActive([{ ...initial, kind: "skills" }]);
  expect(previous.isCurrent()).toBe(false);
  invoke.mockImplementation(async (command, args) =>
    command === "plugin_ai_skill_sources"
      ? description().map(item => ({ ...item, kind: "skills" }))
      : encoded(document("独立技能说明"), args.offset)
  );
  await host.adapter.refresh();
  expect((await host.registry.load("example.skill:summary")).instructions).toBe("独立技能说明");
  await expect(source.read("skills/summary/SKILL.md")).rejects.toMatchObject({
    code: "AI_SKILL_UNAVAILABLE",
  });
  await host.adapter.dispose();
});

it("安装代次不匹配或新目录读取失败均可观察，并可显式刷新恢复", async () => {
  defaultNative();
  const host = harness();
  await host.adapter.refresh();
  const changed = vi.fn();
  host.adapter.subscribe(changed);
  invoke.mockResolvedValue(description("unexpected-new-install"));
  await expect(host.adapter.refresh()).rejects.toMatchObject({ code: "AI_SKILL_UNAVAILABLE" });
  expect(host.adapter.getSnapshot().error?.message).toContain("安装版本");
  expect(await host.registry.list()).toEqual([]);
  expect(changed).toHaveBeenCalled();
  invoke.mockRejectedValue("AI_SKILL_INVALID:新版本摘要失败");
  await expect(host.adapter.refresh()).rejects.toMatchObject({ code: "AI_SKILL_INVALID" });
  expect(host.adapter.getSnapshot().error?.message).toContain("摘要失败");
  defaultNative();
  await host.adapter.refresh();
  expect(host.adapter.getSnapshot().error).toBeNull();
  expect((await host.registry.list()).length).toBe(1);
  await host.adapter.dispose();
});

it("dispose等待异步注册返回，并注销迟到的来源", async () => {
  defaultNative();
  const registry = new AiSkillRegistry();
  const entered = deferred<AiSkillSource>();
  const released = deferred<void>();
  const stopped = vi.fn();
  const host = harness(async source => {
    const stop = registry.registerSource(source);
    entered.resolve(source);
    await released.promise;
    return () => {
      stopped();
      stop();
    };
  });
  const refreshing = host.adapter.refresh();
  const source = await entered.promise;
  let complete = false;
  const disposal = host.adapter.dispose().then(() => {
    complete = true;
  });
  await Promise.resolve();
  expect(complete).toBe(false);
  await expect(source.list()).rejects.toMatchObject({ code: "AI_SKILL_UNAVAILABLE" });
  released.resolve();
  await disposal;
  await refreshing;
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(await registry.list()).toEqual([]);
  await expect(host.adapter.refresh()).rejects.toMatchObject({ code: "AI_SKILL_UNAVAILABLE" });
});

it("来源撤销函数异常不阻断插件状态监听，读取资格先失效", async () => {
  defaultNative();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const host = harness(() => () => {
      throw new Error("撤销失败");
    });
    await host.adapter.refresh();
    expect(() => host.setActive([])).not.toThrow();
    await expect(host.sources[0].list()).rejects.toMatchObject({ code: "AI_SKILL_UNAVAILABLE" });
    expect(host.adapter.getSnapshot().error?.message).toBe("撤销失败");
    await host.adapter.dispose();
  } finally {
    warn.mockRestore();
  }
});
