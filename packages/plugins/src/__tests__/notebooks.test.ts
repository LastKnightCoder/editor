import { describe, expect, it, vi } from "vitest";
import { forwardRef, memo } from "react";
import { definePlugin, type PluginContext, type PluginNotebookOutputDefinition } from "../index";
import { PluginHost, createMemoryStorage, type NotebooksAdapter } from "../host";

async function setup() {
  let registered!: Readonly<PluginNotebookOutputDefinition>;
  const dispose = vi.fn();
  const registerOutput = vi.fn<NotebooksAdapter["registerOutput"]>((_context, definition) => {
    registered = definition;
    return { dispose };
  });
  const host = new PluginHost({
    environment: { platform: "desktop", input: { coarsePointer: false, finePointer: true } },
    workspaceId: "A",
    storage: createMemoryStorage(),
    notebooks: { registerOutput },
  });
  let context!: PluginContext;
  host.registerTrusted(
    definePlugin({
      id: "sample",
      name: "示例",
      version: "1",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
  await host.enable("sample");
  return { host, context: () => context, registered: () => registered, dispose };
}

const view = () => null;
const target = {
  notebook: { id: "7", title: "分布式系统" },
  resources: [{ id: "1", name: "Raft.pdf" }],
};

describe("Notebook 输出", () => {
  it("校验定义，包装 prepare / complete / fail，停用后拒绝调用", async () => {
    const { host, context, registered, dispose } = await setup();
    const complete = vi.fn<PluginNotebookOutputDefinition["complete"]>(async () => undefined);
    const fail = vi.fn();
    const base: PluginNotebookOutputDefinition = {
      id: "podcast",
      title: "播客",
      kind: "episode",
      icon: forwardRef<SVGSVGElement>(() => null),
      options: memo(() => null),
      view: memo(view),
      prepare: async () => ({
        entity: "12",
        title: "播客脚本",
        instructions: "写对话",
        reminders: ["按行"],
      }),
      complete,
      fail,
    };
    expect(() => context().notebooks.registerOutput({ ...base, id: "a b" })).toThrow("插件标识");
    expect(() => context().notebooks.registerOutput({ ...base, title: " " })).toThrow("名称");
    expect(() => context().notebooks.registerOutput({ ...base, icon: "svg" as never })).toThrow(
      "图标"
    );
    expect(() => context().notebooks.registerOutput({ ...base, view: "div" as never })).toThrow(
      "view"
    );
    context().notebooks.registerOutput(base);
    expect(registered().icon).toBe(base.icon);
    expect(host.listContributions("sample")).toMatchObject({ "notebook-output": 1 });

    const plan = await registered().prepare({
      ...target,
      userPrompt: "",
      options: { minutes: 5 },
      signal: new AbortController().signal,
    });
    expect(plan).toEqual({
      entity: "12",
      title: "播客脚本",
      instructions: "写对话",
      reminders: ["按行"],
    });
    const task = { phase: vi.fn(), progress: vi.fn() };
    await registered().complete({
      entity: "12",
      text: "林舟: 你好",
      task,
      signal: new AbortController().signal,
    });
    expect(complete.mock.calls[0][0]).toMatchObject({ entity: "12", text: "林舟: 你好", task });
    await registered().fail?.({ entity: "12", reason: "cancelled", message: "已停止" });
    expect(fail).toHaveBeenCalledWith({ entity: "12", reason: "cancelled", message: "已停止" });

    await host.disable("sample");
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(
      registered().complete({ entity: "12", text: "", task, signal: new AbortController().signal })
    ).rejects.toThrow();
    await host.dispose();
  });

  it("prepare 返回的任务说明不合规时报错", async () => {
    const { host, context, registered } = await setup();
    const prepare = vi.fn();
    context().notebooks.registerOutput({
      id: "podcast",
      title: "播客",
      kind: "episode",
      view,
      prepare,
      complete: async () => undefined,
    });
    const input = {
      ...target,
      userPrompt: "",
      options: undefined,
      signal: new AbortController().signal,
    };
    prepare.mockResolvedValueOnce({ entity: "x", title: "t", instructions: "i" });
    await expect(registered().prepare(input)).rejects.toThrow("插件实体 ID");
    prepare.mockResolvedValueOnce({ entity: "1", title: "t", instructions: " " });
    await expect(registered().prepare(input)).rejects.toThrow("instructions");
    prepare.mockResolvedValueOnce({ entity: "1", title: "t", instructions: "i", reminders: [1] });
    await expect(registered().prepare(input)).rejects.toThrow("reminders");
    await host.dispose();
  });
});
