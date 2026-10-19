import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defineEditorElement,
  defineEditorExtension,
  definePlugin,
  usePluginServices,
  type PluginServices,
} from "@tau/plugins";
import { PluginServicesProvider, bindPluginServiceRenderers } from "@tau/plugins/services-host";
import { PluginServiceScope } from "../service-scope";

describe("插件服务入口不依赖编辑器或 activate", () => {
  let root: Root | undefined;
  let host: HTMLDivElement;
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
  });

  it("按插件包裹服务，普通组件和博客取不到服务，独立窗口不调用生命周期", async () => {
    const seen = new Map<string, PluginServices | undefined>();
    function Probe({ id }: { id: string }) {
      seen.set(id, usePluginServices());
      return <span>{id}</span>;
    }
    const activate = vi.fn();
    const definition = definePlugin({
      id: "test.service",
      name: "测试",
      version: "1.0.0",
      create: () => ({ activate }),
      editorExtensions: [
        defineEditorExtension({
          id: "test.element",
          elements: [
            defineEditorElement({
              type: "paragraph",
              kind: "block",
              isVoid: true,
              render: () => <Probe id="plugin" />,
            }),
          ],
        }),
      ],
    });
    const original = definition.editorExtensions![0].elements![0].render!;
    const bound = bindPluginServiceRenderers(definition);
    const Render = bound.editorExtensions![0].elements![0].render!;
    const props = {
      attributes: { "data-slate-node": "element", ref: null },
      element: { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      children: null,
    } as ComponentProps<typeof Render>;
    const adapter = { tailwind: { compile: vi.fn() } } as unknown as PluginServices;
    const scope = new PluginServiceScope(adapter, id => id === definition.id);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <PluginServicesProvider resolve={scope.resolve}>
          <Probe id="outside" />
          <Render {...props} />
        </PluginServicesProvider>
      )
    );
    expect(seen.get("plugin")).toBe(scope.resolve(definition.id));
    expect(seen.get("outside")).toBeUndefined();
    expect(scope.resolve("other.plugin")).toBeUndefined();
    expect(activate).not.toHaveBeenCalled();
    expect(definition.editorExtensions![0].elements![0].render).toBe(original);
    await act(async () => root!.render(<Render {...props} />));
    expect(seen.get("plugin")).toBeUndefined();
    scope.dispose();
  });

  it("窗口取消只结束自己的调用，工作区切换拒绝旧结果", async () => {
    const jobs: { signal: AbortSignal; finish(value: { html: string }): void }[] = [];
    const adapter = {
      tailwind: {
        compile: vi.fn(
          (_input, options) =>
            new Promise(resolve => jobs.push({ signal: options.signal, finish: resolve }))
        ),
      },
    } as unknown as PluginServices;
    let workspace = "A";
    const first = new PluginServiceScope(adapter, () => workspace === "A");
    const second = new PluginServiceScope(adapter, () => true);
    const caller = new AbortController();
    const a = first.resolve("test")!.tailwind.compile({ source: "a" }, { signal: caller.signal });
    const b = second.resolve("test")!.tailwind.compile({ source: "b" });
    caller.abort();
    expect(jobs[0].signal.aborted).toBe(true);
    expect(jobs[1].signal.aborted).toBe(false);
    jobs[0].finish({ html: "late" });
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    first.dispose();
    jobs[1].finish({ html: "b" });
    await expect(b).resolves.toEqual({ html: "b" });
    const old = second.resolve("test")!;
    const pending = old.tailwind.compile({ source: "pending" });
    second.dispose();
    expect(jobs[2].signal.aborted).toBe(true);
    jobs[2].finish({ html: "late" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(old.tailwind.compile({ source: "old" })).rejects.toMatchObject({
      name: "AbortError",
    });
    const changed = new PluginServiceScope(adapter, () => workspace === "A");
    const late = changed.resolve("test")!.tailwind.compile({ source: "before switch" });
    workspace = "B";
    jobs[3].finish({ html: "old workspace" });
    await expect(late).rejects.toMatchObject({ name: "AbortError" });
    expect(changed.resolve("test")).toBeUndefined();
    changed.dispose();
  });
});
