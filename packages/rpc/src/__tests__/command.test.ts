import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditCommandCoverage,
  command,
  getDefinedCommandChannels,
  setCommandBridge,
} from "../command";

describe("command 契约工厂", () => {
  beforeEach(() => {
    setCommandBridge(null);
  });

  it("未装配桥时 call/register 抛出带 channel 的清晰错误", () => {
    const ref = command<[], string>("test.unbridged");
    expect(() => ref.call()).toThrow("test.unbridged");
    expect(() => ref.register(async () => "x")).toThrow("test.unbridged");
  });

  it("call 转发 channel 与 args 到桥", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    setCommandBridge({ call });
    const ref = command<[number, string], string>("test.call");
    await expect(ref.call(1, "a")).resolves.toBe("ok");
    expect(call).toHaveBeenCalledWith("test.call", [1, "a"]);
  });

  it("register 转发 handler 到桥", () => {
    const register = vi.fn();
    setCommandBridge({ register });
    const ref = command<[number], number>("test.register");
    const handler = async (_event, value: number) => value * 2;
    ref.register(handler);
    expect(register).toHaveBeenCalledWith("test.register", handler);
  });

  it("单一能力装配互不干扰（渲染侧仅 call、主进程仅 register）", async () => {
    setCommandBridge({ call: vi.fn().mockResolvedValue(null) });
    const ref = command<[], void>("test.partial");
    expect(() => ref.register(async () => {})).toThrow();

    setCommandBridge({ register: vi.fn() });
    expect(() => ref.call()).toThrow();
  });

  it("define 登记 channel 且对账正确分组", () => {
    const ref = command<[], void>(`test.audit-${Date.now()}`);
    const defined = getDefinedCommandChannels();
    expect(defined).toContain(ref.channel);

    const coverage = auditCommandCoverage([ref.channel, "legacy-inline-channel"]);
    expect(coverage.contracted).toContain(ref.channel);
    expect(coverage.uncontracted).toContain("legacy-inline-channel");
    expect(coverage.contracted).not.toContain("legacy-inline-channel");
  });
});
