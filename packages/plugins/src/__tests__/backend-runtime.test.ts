import { describe, expect, it } from "vitest";
import { BackendRuntime } from "../backend-runtime";
import type { BackendContext } from "../backend";
import { backendJson, type BackendReply } from "../backend-protocol";

describe("后台执行协议", () => {
  it("输入与输出都校验，旧代次和未知方法不调用业务", async () => {
    const replies: BackendReply[] = [];
    let calls = 0;
    const number = {
      parse(value: unknown) {
        if (typeof value !== "number") throw new Error("需要数字");
        return value;
      },
    };
    const runtime = new BackendRuntime(
      { pluginId: "test.backend", workspaceId: null, generation: "one" },
      reply => replies.push(reply)
    );
    await runtime.activate({
      create: () => ({
        activate(ctx) {
          ctx.rpc.register("double", { input: number, output: number }, input => {
            calls++;
            return input * 2;
          });
        },
      }),
    });
    await runtime.receive({ type: "call", generation: "old", id: "1", method: "double", input: 2 });
    await runtime.receive({
      type: "call",
      generation: "one",
      id: "2",
      method: "double",
      input: "2",
    });
    await runtime.receive({
      type: "call",
      generation: "one",
      id: "3",
      method: "missing",
      input: 2,
    });
    await runtime.receive({ type: "call", generation: "one", id: "4", method: "double", input: 2 });
    expect(calls).toBe(1);
    expect(replies).toContainEqual({ type: "result", generation: "one", id: "4", value: 4 });
    expect(replies.filter(reply => reply.type === "error")).toHaveLength(2);
    await runtime.stop();
  });
  it("停止先中止任务再逆序回收，迟到结果不再发送", async () => {
    const replies: BackendReply[] = [];
    const order: string[] = [];
    let context!: BackendContext;
    let finish!: () => void;
    const runtime = new BackendRuntime(
      { pluginId: "test.backend", workspaceId: "workspace", generation: "one" },
      reply => replies.push(reply)
    );
    await runtime.activate({
      create: () => ({
        activate(ctx) {
          context = ctx;
          ctx.register({
            dispose() {
              order.push("first");
            },
          });
          ctx.register({
            dispose() {
              order.push("second");
            },
          });
          ctx.rpc.register(
            "wait",
            { input: { parse: backendJson }, output: { parse: backendJson } },
            async (_input, { signal }) => {
              await new Promise<void>(resolve => {
                finish = resolve;
                signal.addEventListener("abort", resolve as () => void, { once: true });
              });
              return "late";
            }
          );
        },
        deactivate() {
          expect(context.signal.aborted).toBe(true);
          order.push("deactivate");
        },
      }),
    });
    const call = runtime.receive({
      type: "call",
      generation: "one",
      id: "1",
      method: "wait",
      input: null,
    });
    await runtime.stop();
    finish();
    await call;
    await runtime.stop();
    expect(order).toEqual(["deactivate", "second", "first"]);
    expect(replies.some(reply => reply.type === "result")).toBe(false);
    expect(() => context.rpc.emit("event", null)).toThrow();
  });
  it("拒绝不可序列化、原型危险字段和过大载荷", () => {
    expect(() => backendJson({ value: undefined })).toThrow();
    expect(() => backendJson(JSON.parse('{"__proto__":{"value":1}}'))).toThrow("保留字段");
    expect(() => backendJson("中".repeat(400_000))).toThrow("大小限制");
  });
});
