import { describe, expect, it } from "vitest";
import { createCommandRegistry, type OnHandler } from "../command-registry";
import type { CommandEvent } from "../command";

const fakeEvent: CommandEvent = { sender: { id: 1 } };

describe("command-registry", () => {
  it("invoke handler 注册后可查询、移除后失效", () => {
    const registry = createCommandRegistry();
    const handler = async () => 42;
    registry.registerInvokeHandler("a", handler);
    expect(registry.getInvokeHandler("a")).toBe(handler);
    expect(registry.listInvokeChannels()).toContain("a");

    registry.removeInvokeHandler("a");
    expect(registry.getInvokeHandler("a")).toBeUndefined();
  });

  it("同 channel 多 on listener 聚合分发，抛错中断后续（对齐 EventEmitter 语义）", () => {
    const registry = createCommandRegistry();
    const calls: string[] = [];
    const first: OnHandler = () => {
      calls.push("first");
      throw new Error("listener 抛错中断后续分发");
    };
    const second: OnHandler = () => {
      calls.push("second");
    };
    registry.addOnHandler("evt", first);
    registry.addOnHandler("evt", second);

    const dispatch = registry.getOnHandler("evt")!;
    expect(() => dispatch(fakeEvent)).toThrow();
    expect(calls).toEqual(["first"]);

    registry.removeOnHandler("evt", first);
    registry.getOnHandler("evt")!(fakeEvent);
    expect(calls).toEqual(["first", "second"]);
  });

  it("on listener 全部移除后 channel 不再列出", () => {
    const registry = createCommandRegistry();
    const listener: OnHandler = () => {};
    registry.addOnHandler("evt", listener);
    expect(registry.listOnChannels()).toContain("evt");
    registry.removeOnHandler("evt", listener);
    expect(registry.getOnHandler("evt")).toBeUndefined();
    expect(registry.listOnChannels()).not.toContain("evt");
  });
});
