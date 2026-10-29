import { expect, it, vi } from "vitest";
import {
  AiSkillRegistry,
  createSkillTools,
  parseSkillDocument,
  validateSkillResourcePath,
  type AiSkillSource,
} from "../index";
import { AiToolRegistry } from "../../tools";

const body = (manual = false) => `---
name: card-summary
description: >-
  整理卡片行动项
disable-model-invocation: ${manual}
allowed-tools: Read Search Bash(git *)
---
# 整理卡片
先读取正文，再整理行动项。
`;
const source = (manual = false): AiSkillSource => ({
  id: "builtin",
  revision: "1",
  async list() {
    return [{ id: "summary", path: "summary/SKILL.md" }];
  },
  async read(path) {
    if (path === "summary/SKILL.md") return body(manual);
    if (path === "summary/references/style.md") return "使用项目已有的命名。";
    throw new Error("资料不存在");
  },
});

it("标准 YAML 元数据、手动调用与 allowed-tools 均保留，但不会授予执行权", () => {
  expect(parseSkillDocument(body(true), "summary")).toMatchObject({
    name: "card-summary",
    description: "整理卡片行动项",
    disableModelInvocation: true,
    allowedTools: ["Read", "Search", "Bash(git *)"],
  });
});

it("只在捕获的技能范围内加载正文和参考资料", async () => {
  const registry = new AiSkillRegistry();
  registry.registerSource(source());
  const catalog = await registry.list();
  expect(catalog[0]).not.toHaveProperty("instructions");
  const snapshot = await registry.capture(["builtin:summary"]);
  expect((await snapshot.load("builtin:summary")).instructions).toContain("先读取正文");
  expect(await snapshot.readResource("builtin:summary", "references/style.md")).toBe(
    "使用项目已有的命名。"
  );
  await expect(snapshot.load("other:summary")).rejects.toMatchObject({
    code: "AI_SKILL_UNAVAILABLE",
  });
  await expect(snapshot.readResource("builtin:summary", "scripts/run.py")).rejects.toMatchObject({
    code: "AI_SKILL_SCRIPT_UNSUPPORTED",
  });
});

it.each([
  "../secret",
  "/secret",
  "C:/secret",
  "references/../../secret",
  "references\\secret",
  "%2e%2e/secret",
  "references/%252e%252e/secret",
])("拒绝资源越界路径 %s", path => expect(() => validateSkillResourcePath(path)).toThrow());

it("手动技能必须由调用方显式点名，自动目录不隐式包含它", async () => {
  const registry = new AiSkillRegistry();
  registry.registerSource(source(true));
  expect((await registry.captureAvailable()).skills).toHaveLength(0);
  await expect(registry.capture(["builtin:summary"])).rejects.toMatchObject({
    code: "AI_SKILL_UNAVAILABLE",
  });
  expect((await registry.captureAvailable(["builtin:summary"])).skills).toHaveLength(1);
});

it("来源停用后原技能工具快照失效，同身份重注册不能接管旧快照", async () => {
  const registry = new AiSkillRegistry();
  const dispose = registry.registerSource(source());
  const snapshot = await registry.captureAvailable();
  const tools = createSkillTools(snapshot);
  const toolRegistry = new AiToolRegistry();
  for (const tool of tools) toolRegistry.register(tool.spec, tool.execute);
  dispose();
  registry.registerSource(source());
  expect(snapshot.isCurrent()).toBe(false);
  await expect(snapshot.load("builtin:summary")).rejects.toMatchObject({
    code: "AI_SKILL_UNAVAILABLE",
  });
});

it("取消在途资料读取会传递信号并结束等待", async () => {
  const registry = new AiSkillRegistry();
  const fixture = source();
  let started!: () => void;
  const ready = new Promise<void>(resolve => {
    started = resolve;
  });
  let received: AbortSignal | undefined;
  fixture.read = vi.fn(async (path, signal) => {
    if (path.endsWith("SKILL.md")) return body();
    received = signal;
    started();
    return new Promise<string>(() => undefined);
  });
  registry.registerSource(fixture);
  const snapshot = await registry.captureAvailable();
  const controller = new AbortController();
  const read = snapshot.readResource("builtin:summary", "references/style.md", controller.signal);
  await ready;
  const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  expect(received?.aborted).toBe(true);
});
